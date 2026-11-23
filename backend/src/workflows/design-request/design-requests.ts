/**
 * Medusa glue of the design-help queue: making a request from the open store form, the one
 * confirmation email, the customer's own list, and the admin's list, detail and changes. The rules
 * (what a valid request is, the statuses, the limits) are lib/rules/design-request.ts; the words of
 * the email are lib/content/design-request-emails.ts. Nothing here decides a business rule.
 *
 * Privacy: an email address, a phone number, a name or what a team wrote never goes into a log line
 * (outside development and tests the module's database errors are cleaned too:
 * lib/rules/statement-privacy.ts), and nothing a stranger sent is returned to anyone but staff and,
 * for a signed-in customer, to that customer.
 */
import { createHash, randomInt } from "node:crypto"
import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { EMAIL_CHANNEL, emailDelivery } from "../../lib/config/email-delivery"
import { receivedEmail } from "../../lib/content/design-request-emails"
import { badRequest, conflict, notFound, Refusal } from "../../lib/http/refusal"
import { calendarDateIn, DELIVERY_TIME_ZONE } from "../../lib/rules/delivery-promise"
import {
  CUSTOMER_STATUS_LABELS,
  DESIGN_REQUEST_STATUSES,
  emailKey,
  isDesignRequestStatus,
  makeReference,
  mayChangeStatus,
  nextStatuses,
  readDesignRequest,
  readStaffNotes,
  STATUS_LABELS,
  toOwnDesignRequest,
  trapFilled,
  type DesignRequestStatus,
  type StoredDesignRequest,
} from "../../lib/rules/design-request"
import { DESIGN_REQUEST_MODULE } from "../../modules/design-request/constants"
import DesignRequestModuleService, { DesignRequestChanged } from "../../modules/design-request/service"
import { TEAM_ORDER_MODULE } from "../../modules/team-order/constants"

const service = (container: MedusaContainer) => container.resolve<DesignRequestModuleService>(DESIGN_REQUEST_MODULE)

/** A reference for a request that is thrown away (the trap), made the same way as a real one. */
const newReference = () => makeReference((below) => randomInt(below))

/** The name of an error, never its message (a message could quote what a requester typed). */
const errorName = (error: unknown): string => (error instanceof Error && error.name ? error.name : "Error")

// ---------------------------------------------------------------------------------------------
// The store form

/**
 * The hash a requester's network address is limited by: the address with this store's secret, so the
 * database never holds the address itself. null when the address is unknown.
 */
export function addressHash(ip: string | null): string | null {
  if (!ip) return null
  const secret = process.env.JWT_SECRET ?? "fitmyoutfit-dev"
  return createHash("sha256").update(`design-request-address|${secret}|${ip}`).digest("hex").slice(0, 32)
}

export type CreateInput = {
  body: Record<string, unknown>
  /** The signed-in customer's id, or null. */
  customerId: string | null
  ip: string | null
  now?: Date
}

/** The answer of a received request: the same shape for a real one and for a discarded one. */
export type ReceivedAnswer = { design_request: { reference: string; status: "new"; status_label: string } }

const received = (reference: string): ReceivedAnswer => ({
  design_request: { reference, status: "new", status_label: CUSTOMER_STATUS_LABELS.new },
})

const RATE_LIMITED_MESSAGE = "Too many requests. Please try again later."

/**
 * Makes a request. The trap field is checked first: a request that fills it in is dropped without
 * a word (nothing stored, no email, the same answer). Otherwise every field is checked (400 with a
 * code), then the limits (429 `rate_limited`, the same answer for every limit), then the request is
 * stored and the confirmation email is sent once (never failing the request).
 */
export async function createDesignRequest(container: MedusaContainer, input: CreateInput): Promise<ReceivedAnswer> {
  if (trapFilled(input.body)) {
    return received(newReference())
  }
  const today = calendarDateIn(input.now ?? new Date(), DELIVERY_TIME_ZONE)
  const read = readDesignRequest(input.body, today)
  if (!read.ok) {
    throw badRequest(read.code, read.message, { field: read.field, ...(read.index === undefined ? {} : { index: read.index }) })
  }
  const customerId = await existingCustomerId(container, input.customerId)
  const key = emailKey(read.value.email)
  for (let attempt = 0; attempt < 4; attempt++) {
    const reference = newReference()
    let outcome
    try {
      outcome = await service(container).createUnderLimits({
        reference,
        input: read.value,
        emailKey: key,
        customerId,
        ipHash: addressHash(input.ip),
      })
    } catch (error) {
      // Two references the same: try another. Anything else is not ours to handle.
      if (attempt < 3 && /design_request_reference|unique|duplicate/iu.test(String((error as { message?: unknown })?.message ?? ""))) continue
      throw error
    }
    if (!outcome.ok) {
      throw new Refusal(429, "not_allowed", "rate_limited", RATE_LIMITED_MESSAGE)
    }
    await sendReceivedEmail(container, {
      id: outcome.id,
      reference,
      email: read.value.email,
      contactName: read.value.contactName,
      teamName: read.value.teamName,
    })
    return received(reference)
  }
  throw new Refusal(500, "not_allowed", "reference_unavailable", "The request could not be stored. Please try again.")
}

/** The customer's id if that customer still exists; a deleted customer is treated as a visitor. */
async function existingCustomerId(container: MedusaContainer, customerId: string | null): Promise<string | null> {
  if (!customerId) return null
  const found = await container.resolve(Modules.CUSTOMER).listCustomers({ id: customerId }, { select: ["id"], take: 1 })
  return found.length > 0 ? customerId : null
}

// ---------------------------------------------------------------------------------------------
// The confirmation email

/**
 * Sends the confirmation once: the email's row (module design_request_email) is claimed BEFORE the
 * send under a unique key, so it is never made twice. Where no email provider takes the channel
 * (everywhere but development and tests: decisions 002 and 015) nothing is sent and nothing is
 * recorded as sent. Never throws; the address goes only to the Notification Module, never to our
 * rows or log lines.
 */
export async function sendReceivedEmail(
  container: MedusaContainer,
  request: { id: string; reference: string; email: string; contactName: string; teamName: string }
): Promise<"sent" | "skipped" | "failed" | "withheld"> {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER) as unknown as { warn: (m: string) => void; error: (m: string) => void }
  try {
    if (emailDelivery(process.env) === "none") {
      logger.warn("A design-request email was not sent: no email provider is configured for this environment.")
      return "withheld"
    }
    const rowId = await service(container).claimEmail({ designRequestId: request.id, kind: "received", dedupeKey: `received:${request.id}` })
    if (rowId === null) return "skipped"
    try {
      await service(container).updateDesignRequestEmails({ id: rowId, status: "pending", attempts: 1, last_attempt_at: new Date() })
      const content = receivedEmail({ contactName: request.contactName, teamName: request.teamName, reference: request.reference })
      await container.resolve(Modules.NOTIFICATION).createNotifications({
        to: request.email,
        channel: EMAIL_CHANNEL,
        template: "design-request-received",
        trigger_type: "design-request",
        resource_id: request.id,
        resource_type: "design_request",
        data: { subject: content.subject, text: content.text, html: content.html },
      })
      await service(container).updateDesignRequestEmails({ id: rowId, status: "sent", sent_at: new Date(), last_error: null })
      return "sent"
    } catch (error) {
      try {
        await service(container).updateDesignRequestEmails({ id: rowId, status: "failed", last_error: errorName(error) })
      } catch {
        // The record could not be written either.
      }
      return "failed"
    }
  } catch (error) {
    logger.error(`A design-request email could not be recorded (${errorName(error)}).`)
    return "failed"
  }
}

// ---------------------------------------------------------------------------------------------
// The customer's own requests

/** The signed-in customer's own requests, newest first; nothing of staff's in them. */
export async function listOwnDesignRequests(container: MedusaContainer, customerId: string) {
  const rows = (await service(container).listDesignRequests({ customer_id: customerId }, { order: { created_at: "DESC" }, take: 100 })) as unknown as StoredDesignRequest[]
  const requests = rows.map(toOwnDesignRequest)
  return { design_requests: requests, count: requests.length }
}

// ---------------------------------------------------------------------------------------------
// The admin's queue

type Row = StoredDesignRequest & {
  id: string
  contact_name: string
  email: string
  phone: string | null
  customer_id: string | null
  staff_notes: string | null
  assigned_to: string | null
}

const iso = (value: unknown): string | null => {
  if (value === undefined || value === null) return null
  const date = value instanceof Date ? value : new Date(String(value))
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

/** A request as staff see it: everything the requester sent, as text, and the staff's own fields. */
function toStaffView(row: Row) {
  return {
    id: row.id,
    reference: row.reference,
    status: row.status,
    status_label: STATUS_LABELS[row.status],
    team_name: row.team_name,
    contact_name: row.contact_name,
    email: row.email,
    phone: row.phone,
    product: row.product,
    pieces: row.pieces,
    need_by_date: row.need_by_date,
    region: row.region,
    message: row.message,
    reference_links: row.reference_links ?? [],
    customer_id: row.customer_id,
    staff_notes: row.staff_notes,
    assigned_to: row.assigned_to,
    created_at: iso(row.created_at),
    updated_at: iso(row.updated_at),
  }
}

export async function userEmails(container: MedusaContainer, ids: readonly (string | null | undefined)[]): Promise<Record<string, string>> {
  const wanted = [...new Set(ids.filter((id): id is string => Boolean(id)))]
  if (wanted.length === 0) return {}
  const users = await container.resolve(Modules.USER).listUsers({ id: wanted }, { select: ["id", "email"] })
  return Object.fromEntries(users.map((user) => [user.id, user.email]))
}

export type AdminListInput = { status?: unknown; limit?: unknown; offset?: unknown }

/** The queue, newest first, with the count of each status (the `new` ones are the number to watch). */
export async function listDesignRequestsForStaff(container: MedusaContainer, input: AdminListInput) {
  const status = input.status === undefined || input.status === "" ? null : input.status
  if (status !== null && !isDesignRequestStatus(status)) {
    throw badRequest("status_invalid", `The status must be one of: ${DESIGN_REQUEST_STATUSES.join(", ")}.`)
  }
  const limit = readWhole(input.limit, 20, 1, 100)
  const offset = readWhole(input.offset, 0, 0, 100000)
  const svc = service(container)
  const [rows, count] = (await svc.listAndCountDesignRequests(status === null ? {} : { status }, {
    order: { created_at: "DESC" },
    take: limit,
    skip: offset,
  })) as unknown as [Row[], number]
  const counts = {} as Record<DesignRequestStatus, number>
  for (const each of DESIGN_REQUEST_STATUSES) {
    const [, n] = (await svc.listAndCountDesignRequests({ status: each }, { take: 1 })) as unknown as [unknown[], number]
    counts[each] = n
  }
  const emails = await userEmails(container, rows.map((row) => row.assigned_to))
  return {
    design_requests: rows.map((row) => ({
      ...toStaffView(row),
      message: undefined,
      assigned_to_email: row.assigned_to ? (emails[row.assigned_to] ?? null) : null,
    })),
    count,
    limit,
    offset,
    counts,
    new_count: counts.new,
  }
}

function readWhole(value: unknown, fallback: number, min: number, max: number): number {
  if (value === undefined || value === "") return fallback
  const number = typeof value === "string" && /^\d{1,7}$/u.test(value) ? Number(value) : Number.NaN
  if (!Number.isInteger(number) || number < min || number > max) {
    throw badRequest("paging_invalid", "limit (1 to 100) and offset (0 or more) must be whole numbers.")
  }
  return number
}

async function loadRow(container: MedusaContainer, id: string): Promise<Row> {
  if (id.includes("\u0000")) throw notFound("design_request_not_found", "Design request not found.")
  const [row] = (await service(container).listDesignRequests({ id }, { take: 1 })) as unknown as Row[]
  if (!row) throw notFound("design_request_not_found", "Design request not found.")
  return row
}

/** One request for staff: the request, the record of changes, the customer and their team orders. */
export async function designRequestForStaff(container: MedusaContainer, id: string) {
  const row = await loadRow(container, id)
  const steps = (await service(container).listDesignRequestSteps({ design_request_id: id }, { order: { created_at: "ASC" } })) as unknown as {
    from_status: DesignRequestStatus
    to_status: DesignRequestStatus
    actor_id: string
    created_at: unknown
  }[]
  const emails = await userEmails(container, [row.assigned_to, ...steps.map((step) => step.actor_id)])
  let customer: { id: string; email: string | null; name: string } | null = null
  let teamOrders: { id: string; team_name: string; status: string; created_at: string | null }[] = []
  if (row.customer_id) {
    const [found] = await container.resolve(Modules.CUSTOMER).listCustomers({ id: row.customer_id }, { select: ["id", "email", "first_name", "last_name"], take: 1 })
    if (found) {
      customer = { id: found.id, email: found.email ?? null, name: [found.first_name, found.last_name].filter(Boolean).join(" ") }
      const orders = (await container.resolve<{ listTeamOrders: (f: object, o: object) => Promise<unknown[]> }>(TEAM_ORDER_MODULE).listTeamOrders(
        { customer_id: row.customer_id },
        { order: { created_at: "DESC" }, take: 20 }
      )) as { id: string; team_name: string; status: string; created_at: unknown }[]
      teamOrders = orders.map((order) => ({ id: order.id, team_name: order.team_name, status: order.status, created_at: iso(order.created_at) }))
    }
  }
  return {
    design_request: { ...toStaffView(row), assigned_to_email: row.assigned_to ? (emails[row.assigned_to] ?? null) : null },
    steps: steps.map((step) => ({
      from: step.from_status,
      to: step.to_status,
      by: step.actor_id,
      by_email: emails[step.actor_id] ?? null,
      at: iso(step.created_at),
    })),
    allowed_next: nextStatuses(row.status).map((to) => ({ to, label: STATUS_LABELS[to] })),
    customer,
    team_orders: teamOrders,
  }
}

/** Moves a request to `to` as the admin user `actorId`. Refusals carry a code. */
export async function changeDesignRequestStatus(container: MedusaContainer, id: string, to: unknown, actorId: string) {
  if (!isDesignRequestStatus(to)) {
    throw badRequest("status_invalid", `The status must be one of: ${DESIGN_REQUEST_STATUSES.join(", ")}.`)
  }
  const row = await loadRow(container, id)
  if (!mayChangeStatus(row.status, to)) {
    throw new Refusal(400, "not_allowed", "status_not_allowed", `A request that is "${STATUS_LABELS[row.status]}" cannot be moved to "${STATUS_LABELS[to]}".`, {
      from: row.status,
      to,
      allowed: nextStatuses(row.status),
    })
  }
  try {
    await service(container).changeStatus({ id, from: row.status, to, actorId, assign: to === "in_progress" })
  } catch (error) {
    if (error instanceof DesignRequestChanged) {
      throw conflict("request_changed", "Someone else changed this request at the same moment. Reload it and try again.")
    }
    throw error
  }
  return designRequestForStaff(container, id)
}

/** Sets the staff notes (an empty text clears them). */
export async function setStaffNotes(container: MedusaContainer, id: string, notes: unknown) {
  const read = readStaffNotes(notes)
  if (read === undefined) {
    throw badRequest("staff_notes_invalid", "Notes must be text of up to 5000 characters.")
  }
  await loadRow(container, id)
  await service(container).updateDesignRequests({ id, staff_notes: read })
  return designRequestForStaff(container, id)
}

/** Takes the request (`true`: the admin user is who works on it) or lets it go (`false`). */
export async function setAssignment(container: MedusaContainer, id: string, assign: unknown, actorId: string) {
  if (typeof assign !== "boolean") {
    throw badRequest("assign_invalid", "assign must be true or false.")
  }
  await loadRow(container, id)
  await service(container).updateDesignRequests({ id, assigned_to: assign ? actorId : null })
  return designRequestForStaff(container, id)
}
