/**
 * Late joiners (add-ons) and reorders, as the store routes use them: Medusa glue around the plain
 * rules in lib/rules/team-order-links.ts. Both are team orders of their own, linked to the order
 * they come from (`linked_order_id`); the existing team-order routes fill, proof and sign them.
 * A customer reaches only orders they are the organizer of; anyone else's is "not found".
 *
 * An add-on takes the same design version, product and region as the first order; the first order
 * and its signed proof are not touched. A reorder takes players from the source's SIGNED list (the
 * snapshot of its current signed proof), never from a later draft.
 */
import { randomUUID } from "node:crypto"
import type { MedusaContainer } from "@medusajs/framework/types"
import { normalizeLines, type RosterLine } from "@fitmyoutfit/team-rules"
import { badRequest, notAllowed } from "../../lib/http/refusal"
import { TeamOrderChanged } from "../../modules/team-order/service"
import { currentProofOf } from "../../lib/rules/team-order-proof"
import { isInThePast } from "../../lib/rules/team-order-schedule"
import { isStatus, type TeamOrderStatus } from "../../lib/rules/team-order-status"
import { readNeedByDate, readTeamName } from "../../lib/rules/team-order"
import { readTake, whyNoAddOn, whyNoReorder } from "../../lib/rules/team-order-links"
import {
  describeTeamOrder,
  kindOf,
  listOrderSummaries,
  loadOwnTeamOrder,
  loadProductSizes,
  loadProofs,
  loadRegion,
  loadStoreSettings,
  regionAddOnMinimum,
  regionMinimum,
  service,
  todayIn,
  type TeamOrderRow,
} from "./team-orders"

const statusOf = (order: Pick<TeamOrderRow, "status">): TeamOrderStatus => (isStatus(order.status) ? order.status : "draft")

/** The optional need-by date of a new order: a calendar date not before today (the store's day), or none. */
async function readOptionalNeedBy(container: MedusaContainer, body: Record<string, unknown>): Promise<string | null> {
  const needBy = readNeedByDate(body.need_by_date)
  if (!needBy.ok) {
    throw badRequest("need_by_date_invalid", "`need_by_date` must be a calendar date written YYYY-MM-DD.")
  }
  if (needBy.value !== null) {
    const today = todayIn(await loadStoreSettings(container), new Date())
    if (isInThePast(needBy.value, today)) {
      throw badRequest("need_by_date_in_past", "`need_by_date` is before today.", { today })
    }
  }
  return needBy.value
}

function readOptionalTeamName(body: Record<string, unknown>, fallback: string): string {
  if (body.team_name === undefined) return fallback
  const name = readTeamName(body.team_name)
  if (name === null) {
    throw badRequest("team_name_invalid", "`team_name` must be text of 1 to 100 characters.")
  }
  return name
}

/**
 * Starts an add-on for late joiners from an order of the caller's own whose proof is signed
 * (`approved` or later). Body (all optional): `{ team_name?, need_by_date?, rush_requested? }`; the
 * team name defaults to the first order's. The add-on is a draft with an empty team list. An add-on
 * of an add-on is refused. Answers with the add-on's whole read answer.
 */
export async function createAddOn(container: MedusaContainer, customerId: string, id: string, body: Record<string, unknown>) {
  const source = await loadOwnTeamOrder(container, customerId, id)
  const why = whyNoAddOn({ kind: kindOf(source), status: statusOf(source) })
  if (why) {
    throw notAllowed(why.code, why.message, { status: source.status })
  }
  const teamName = readOptionalTeamName(body, source.team_name)
  const needBy = await readOptionalNeedBy(container, body)
  if (body.rush_requested !== undefined && typeof body.rush_requested !== "boolean") {
    throw badRequest("rush_requested_invalid", "`rush_requested` must be true or false.")
  }
  // The add-on's minimum must be readable now, so a missing setting shows here and not later.
  regionAddOnMinimum(await loadRegion(container, source.region_id))
  // The first order's row is locked and its status read again in the same transaction that stores
  // the add-on, so it cannot go back to draft (reopen) between the check above and the write.
  let created: TeamOrderRow
  try {
    created = (await service(container).createAddOn({
      firstOrderId: source.id,
      data: {
        customer_id: customerId,
        team_name: teamName,
        design_id: source.design_id,
        design_version_id: source.design_version_id,
        product_id: source.product_id,
        region_id: source.region_id,
        need_by_date: needBy,
        status: "draft",
        prints_name: source.prints_name,
        prints_number: source.prints_number,
        list_version: 1,
        rush_requested: body.rush_requested === true,
        kind: "add_on",
        linked_order_id: source.id,
      },
    })) as TeamOrderRow
  } catch (error) {
    if (!(error instanceof TeamOrderChanged)) throw error
    // The first order moved since it was read (it went back to draft): answer as for its state now.
    const current = await loadOwnTeamOrder(container, customerId, id)
    const refusal = whyNoAddOn({ kind: kindOf(current), status: statusOf(current) })
    throw notAllowed(refusal?.code ?? "team_order_not_signed", refusal?.message ?? "The team order is no longer signed.", {
      status: current.status,
    })
  }
  return describeTeamOrder(container, created)
}

/** The add-ons of an order of the caller's own, oldest first, each with its players, pieces and current proof. */
export async function listAddOns(container: MedusaContainer, customerId: string, id: string) {
  const source = await loadOwnTeamOrder(container, customerId, id)
  const orders = (await service(container).listTeamOrders(
    { linked_order_id: source.id, kind: "add_on" },
    { order: { created_at: "ASC" } }
  )) as TeamOrderRow[]
  const add_ons = await listOrderSummaries(container, orders)
  return { add_ons, count: add_ons.length }
}

type SignedLine = { name: string; number: string; size: string; count: number; no_name: boolean; no_number: boolean }

/**
 * Starts a reorder from an order of the caller's own whose proof is signed. Body (all optional):
 * `{ take?, team_name?, region_id?, need_by_date?, rush_requested? }`. `take` is `"all"` (the
 * default), `"none"` or a list of positions in the SIGNED list (0 is the first line of the signed
 * proof's snapshot). The new order has the same design version and product; its region is the
 * source's unless `region_id` says another. It is a full team order: its region's ordinary minimum
 * applies and its numbers are checked within itself only. The players taken over can be changed
 * with the existing team-list route before the proof.
 */
export async function createReorder(container: MedusaContainer, customerId: string, id: string, body: Record<string, unknown>) {
  const source = await loadOwnTeamOrder(container, customerId, id)
  const why = whyNoReorder({ kind: kindOf(source), status: statusOf(source) })
  if (why) {
    throw notAllowed(why.code, why.message, { status: source.status })
  }
  const signed = currentProofOf(await loadProofs(container, source.id))
  if (!signed || signed.status !== "signed") {
    throw notAllowed("team_order_not_signed", "The order has no signed proof to take players from.", { status: source.status })
  }
  const snapshot = JSON.parse(signed.snapshot_text) as { lines: SignedLine[] }
  const take = readTake(body.take, snapshot.lines.length)
  if (!take.ok) {
    throw badRequest(take.code, take.message, { lines: snapshot.lines.length })
  }
  const teamName = readOptionalTeamName(body, source.team_name)
  const needBy = await readOptionalNeedBy(container, body)
  if (body.rush_requested !== undefined && typeof body.rush_requested !== "boolean") {
    throw badRequest("rush_requested_invalid", "`rush_requested` must be true or false.")
  }
  const region = await loadRegion(container, body.region_id === undefined ? source.region_id : body.region_id)
  regionMinimum(region)
  const sizes = (await loadProductSizes(container, source.product_id)) ?? []
  const lines: RosterLine[] = normalizeLines(
    take.indexes.map((i): RosterLine => {
      const line = snapshot.lines[i]!
      return {
        id: `ln_${randomUUID()}`,
        name: line.name,
        number: line.number,
        size: line.size,
        count: line.count,
        noName: line.no_name,
        noNumber: line.no_number,
      }
    }),
    { sizes }
  )
  const teams = service(container)
  const created = (await teams.createTeamOrders({
    customer_id: customerId,
    team_name: teamName,
    design_id: source.design_id,
    design_version_id: source.design_version_id,
    product_id: source.product_id,
    region_id: region.id,
    need_by_date: needBy,
    status: "draft",
    prints_name: source.prints_name,
    prints_number: source.prints_number,
    list_version: 1,
    rush_requested: body.rush_requested === true,
    kind: "reorder",
    linked_order_id: source.id,
  })) as TeamOrderRow
  if (lines.length > 0) {
    await teams.replaceRoster({
      teamOrderId: created.id,
      expectedVersion: 1,
      productId: created.product_id,
      lines: lines.map((line) => ({
        line_id: line.id ?? `ln_${randomUUID()}`,
        name: line.name,
        number: line.number,
        size: line.size,
        count: line.count,
        no_name: line.noName,
        no_number: line.noNumber,
      })),
    })
  }
  return describeTeamOrder(container, (await teams.listTeamOrders({ id: created.id }))[0] as TeamOrderRow)
}
