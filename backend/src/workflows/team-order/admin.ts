/**
 * Team orders for staff, as the admin routes use them (/admin/team-orders): the list, one order with
 * everything staff look at, and the admin's steps of the status flow. Medusa glue around the plain
 * rules (lib/rules/team-order-steps.ts says which buttons an order's status offers). Admin routes
 * sit behind the admin's sign-in (Medusa checks it before these handlers run); a customer's token is
 * refused there. Staff see every organizer's orders.
 *
 * An admin may see the address a proof was signed from (it is personal data: never logged, and
 * never in a store route's answer).
 *
 * The money (decision 016): the order page carries `money` (what the order costs, the deposit and
 * the balance, what is paid and outstanding, in the region's currency; workflows/team-order/
 * payments.ts). The by-hand buttons capture the placeholder payment of their part in the admin's
 * name; "Mark as shipped" needs the balance paid (`balance_not_paid` otherwise).
 */
import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { badRequest, conflict, notAllowed, notFound } from "../../lib/http/refusal"
import { actionFor, adminActions, actorLabel, isAdminActionId } from "../../lib/rules/team-order-steps"
import { proofWithSnapshot, type StoredProof } from "../../lib/rules/team-order-proof"
import { isStatus, TEAM_ORDER_STATUSES, type TeamOrderStatus } from "../../lib/rules/team-order-status"
import { DESIGN_MODULE } from "../../modules/design/constants"
import type DesignModuleService from "../../modules/design/service"
import { TeamOrderChanged } from "../../modules/team-order/service"
import { sendBalanceDue } from "./emails"
import { moneyFactsForAdmin, payPartByHand, readMoneyForAdmin, shipWithMoney } from "./payments"
import {
  describeTeamOrder,
  listOrderSummaries,
  loadProofs,
  loadStoreSettings,
  scheduleOf,
  service,
  type TeamOrderRow,
} from "./team-orders"

type Person = { id: string; name: string; email: string | null }

const MAX_LIMIT = 100
const DEFAULT_LIMIT = 20

function wholeNumber(raw: unknown, fallback: number, min: number, max: number, code: string): number {
  if (raw === undefined || raw === "") return fallback
  const n = typeof raw === "string" && /^\d{1,9}$/u.test(raw) ? Number(raw) : Number.NaN
  if (!Number.isInteger(n) || n < min || n > max) {
    throw badRequest(code, `\`${code.replace("_invalid", "")}\` must be a whole number from ${min} to ${max}.`)
  }
  return n
}

const nameOf = (first?: string | null, last?: string | null): string => [first, last].filter((p) => p && p.trim() !== "").join(" ")

async function peopleOf(container: MedusaContainer, entity: "customer" | "user", ids: string[]): Promise<Map<string, Person>> {
  const unique = [...new Set(ids)]
  const found = new Map<string, Person>()
  if (unique.length === 0) return found
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({ entity, fields: ["id", "email", "first_name", "last_name"], filters: { id: unique } })
  for (const row of data as unknown as { id: string; email?: string | null; first_name?: string | null; last_name?: string | null }[]) {
    found.set(row.id, { id: row.id, name: nameOf(row.first_name, row.last_name), email: row.email ?? null })
  }
  return found
}

async function regionsOf(container: MedusaContainer, ids: string[]): Promise<Map<string, { id: string; name: string }>> {
  const unique = [...new Set(ids)]
  const found = new Map<string, { id: string; name: string }>()
  if (unique.length === 0) return found
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({ entity: "region", fields: ["id", "name"], filters: { id: unique } })
  for (const row of data as unknown as { id: string; name: string }[]) found.set(row.id, { id: row.id, name: row.name })
  return found
}

const unknownPerson = (id: string): Person => ({ id, name: "", email: null })

/**
 * The list of team orders: newest first, paged (`limit` 1 to 100, default 20; `offset`), optionally
 * only one status. Each entry: the order, its organizer (name and email), region, players and pieces,
 * the need-by date with its schedule state, and the current proof's status.
 */
export async function listForAdmin(
  container: MedusaContainer,
  query: { status?: unknown; limit?: unknown; offset?: unknown },
  now: Date = new Date()
) {
  const limit = wholeNumber(query.limit, DEFAULT_LIMIT, 1, MAX_LIMIT, "limit_invalid")
  const offset = wholeNumber(query.offset, 0, 0, 1_000_000, "offset_invalid")
  let status: TeamOrderStatus | undefined
  if (query.status !== undefined && query.status !== "") {
    if (!isStatus(query.status)) {
      throw badRequest("status_invalid", `\`status\` must be one of ${TEAM_ORDER_STATUSES.join(", ")}.`)
    }
    status = query.status
  }
  const [orders, count] = (await service(container).listAndCountTeamOrders(status ? { status } : {}, {
    order: { created_at: "DESC", id: "DESC" },
    take: limit,
    skip: offset,
  })) as [TeamOrderRow[], number]
  const [summaries, organizers, regions, settings] = await Promise.all([
    listOrderSummaries(container, orders),
    peopleOf(container, "customer", orders.map((o) => o.customer_id)),
    regionsOf(container, orders.map((o) => o.region_id)),
    loadStoreSettings(container),
  ])
  const team_orders = summaries.map((summary, i) => {
    const order = orders[i]!
    const open = order.status === "draft" || order.status === "proof_sent"
    const schedule = scheduleOf(order, settings, now)
    return {
      ...summary,
      organizer: organizers.get(order.customer_id) ?? unknownPerson(order.customer_id),
      region: regions.get(order.region_id) ?? { id: order.region_id, name: "" },
      // Open orders: the state today. Signed orders: the state recorded when the proof was signed.
      schedule: {
        state: open ? schedule.state : (summary.current_proof?.schedule_state ?? "none"),
        need_by_date: order.need_by_date,
        latest_sign_standard: open ? schedule.latest_sign_standard : null,
        latest_sign_rush: open ? schedule.latest_sign_rush : null,
        days_left_standard: open ? schedule.days_left_standard : null,
        days_left_rush: open ? schedule.days_left_rush : null,
        today: schedule.today,
      },
    }
  })
  return { team_orders, count, limit, offset }
}

type StepRow = {
  id: string
  step_name: string
  from_status: string
  to_status: string
  actor: "organizer" | "admin" | "system"
  actor_id: string | null
  by_hand: boolean
  created_at: Date | string
}

/** Everything staff look at for one team order. 404 for an unknown id. */
export async function readForAdmin(container: MedusaContainer, id: string, now: Date = new Date()) {
  const teams = service(container)
  const [first] = (await teams.listTeamOrders({ id })) as TeamOrderRow[]
  if (!first) {
    throw notFound("team_order_not_found", `Team order ${id} was not found.`)
  }
  // The money first: it prices the order and makes the step a payment caused (decision 016), so the
  // status and the buttons below are as of after it.
  const money = await readMoneyForAdmin(container, first)
  const [order = first] = (await teams.listTeamOrders({ id })) as TeamOrderRow[]
  const [described, proofs, steps, emails, regions, facts] = await Promise.all([
    describeTeamOrder(container, order, now),
    loadProofs(container, order.id),
    teams.listTeamOrderSteps({ team_order_id: order.id }, { order: { created_at: "ASC", id: "ASC" } }) as Promise<StepRow[]>,
    teams.listTeamOrderEmails({ team_order_id: order.id }, { order: { created_at: "ASC" } }) as Promise<
      { kind: string; status: string; attempts: number; sent_at: Date | string | null; created_at: Date | string }[]
    >,
    regionsOf(container, [order.region_id]),
    moneyFactsForAdmin(container, order),
  ])
  const customerIds = [order.customer_id, ...proofs.map((p) => (p as unknown as { signed_by_customer_id?: string | null }).signed_by_customer_id ?? "")]
  const customers = await peopleOf(container, "customer", [
    ...customerIds,
    ...steps.filter((s) => s.actor === "organizer" && s.actor_id).map((s) => s.actor_id!),
  ].filter((v) => v !== ""))
  const users = await peopleOf(container, "user", steps.filter((s) => s.actor === "admin" && s.actor_id).map((s) => s.actor_id!))

  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data: products } = await query.graph({ entity: "product", fields: ["id", "title"], filters: { id: order.product_id } })
  const product = (products as unknown as { id: string; title: string }[])[0]
  const designs = container.resolve<DesignModuleService>(DESIGN_MODULE)
  const [version] = (await designs.listDesignVersions({ id: order.design_version_id }, { select: ["id", "design_id", "version", "product_id"] })) as {
    id: string
    design_id: string
    version: number
  }[]
  const [design] = (await designs.listDesigns({ id: order.design_id }, { select: ["id", "name"] })) as { id: string; name: string }[]

  const status = isStatus(order.status) ? order.status : "draft"
  const personFor = (step: StepRow): Person | null => {
    if (!step.actor_id) return null
    return (step.actor === "admin" ? users : customers).get(step.actor_id) ?? unknownPerson(step.actor_id)
  }
  return {
    ...described,
    team_order: { ...described.team_order, customer_id: order.customer_id },
    organizer: customers.get(order.customer_id) ?? unknownPerson(order.customer_id),
    region: regions.get(order.region_id) ?? { id: order.region_id, name: "" },
    product: { id: order.product_id, title: product?.title ?? "" },
    design_version: {
      id: order.design_version_id,
      design_id: order.design_id,
      design_name: design?.name ?? "",
      version: version?.version ?? null,
    },
    proofs: proofs.map((p: StoredProof) => ({
      ...proofWithSnapshot(p),
      signed_by_customer_id: (p as unknown as { signed_by_customer_id?: string | null }).signed_by_customer_id ?? null,
      signed_by: customers.get((p as unknown as { signed_by_customer_id?: string | null }).signed_by_customer_id ?? "") ?? null,
      signed_ip: (p as unknown as { signed_ip?: string | null }).signed_ip ?? null,
    })),
    steps: steps.map((s) => ({
      id: s.id,
      step_name: s.step_name,
      from: s.from_status,
      to: s.to_status,
      actor: s.actor,
      actor_label: actorLabel(s.actor),
      actor_id: s.actor_id,
      actor_person: personFor(s),
      by_hand: s.by_hand,
      created_at: s.created_at,
    })),
    emails: emails.map((e) => ({ kind: e.kind, status: e.status, attempts: e.attempts, sent_at: e.sent_at, created_at: e.created_at })),
    money,
    actions: adminActions(status, facts).map((a) => ({ id: a.id, to: a.to, label: a.label, confirm: a.confirm, by_hand: a.byHand })),
  }
}

/**
 * An admin's step: `body.action` is one of the buttons the order's status offers (lib/rules/
 * team-order-steps.ts). A step the rules refuse is 400 `step_not_allowed`; when the order moved at
 * the same moment, 409 `team_order_changed`. The step is recorded with the admin user's id. Moving to
 * `balance_due` emails the organizer that the balance is due (a failed send never fails the step).
 * Answers with the order as `readForAdmin` does.
 */
export async function stepForAdmin(
  container: MedusaContainer,
  adminId: string,
  id: string,
  body: Record<string, unknown>,
  now: Date = new Date()
) {
  const teams = service(container)
  const [order] = (await teams.listTeamOrders({ id })) as TeamOrderRow[]
  if (!order) {
    throw notFound("team_order_not_found", `Team order ${id} was not found.`)
  }
  if (!isAdminActionId(body.action)) {
    throw badRequest("action_invalid", "`action` must be one of the steps staff may make: deposit_by_hand, start_production, ask_balance, balance_by_hand, ship.")
  }
  const status = isStatus(order.status) ? order.status : "draft"
  const facts = await moneyFactsForAdmin(container, order)
  if (body.action === "ship" && status === "balance_due" && !facts.balancePaid) {
    // The balance must be paid before shipping (decision 016); the button is not offered either.
    throw notAllowed("balance_not_paid", "The balance is not paid: the order cannot be shipped yet.", { status: order.status, action: body.action })
  }
  const action = actionFor(body.action, status, facts)
  if (!action) {
    throw notAllowed("step_not_allowed", `The step "${body.action}" is not allowed for an order that is ${order.status}.`, {
      status: order.status,
      action: body.action,
    })
  }
  try {
    if (action.id === "deposit_by_hand") {
      // Captures the deposit's placeholder payment in the admin's name; the step follows from it.
      await payPartByHand(container, adminId, order, "deposit")
    } else if (action.id === "balance_by_hand") {
      await payPartByHand(container, adminId, order, "balance")
    } else if (action.id === "ship") {
      await shipWithMoney(container, order, () => teams.adminStep({ teamOrderId: order.id, from: status, to: action.to, adminId, byHand: false }))
    } else {
      await teams.adminStep({ teamOrderId: order.id, from: status, to: action.to, adminId, byHand: action.byHand })
    }
  } catch (error) {
    if (error instanceof TeamOrderChanged) {
      const [current] = (await teams.listTeamOrders({ id })) as TeamOrderRow[]
      throw conflict("team_order_changed", "The order changed at the same moment. Read it again.", { status: current?.status ?? null })
    }
    throw error
  }
  if (action.to === "balance_due" && action.id === "ask_balance") {
    const [after] = (await teams.listTeamOrders({ id })) as TeamOrderRow[]
    if (after) await sendBalanceDue(container, after, now)
  }
  return readForAdmin(container, id, now)
}
