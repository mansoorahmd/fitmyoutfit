/**
 * The emails to a team order's organizer: Medusa glue around the plain rules
 * (lib/rules/team-order-emails.ts: which email, when, the keys) and the words
 * (lib/content/team-order-emails.ts). Sent through Medusa's Notification Module on the `email`
 * channel (decision 002); in development and test its local provider writes the email to the log,
 * as for the password reset. Outside them no provider takes the channel (lib/config/email-delivery.ts):
 * nothing is sent, nothing is recorded as sent, and one warning without any personal data is logged.
 *
 * Sent once: an email's row (module team_order_email) is claimed BEFORE the send, under a unique
 * key, so the same email is never made twice, also when two requests, or the reminder job twice,
 * or a restart, reach it. A failed send is recorded (the error's name only) and is tried again by
 * the job, up to a limit; a send never fails the request that caused it.
 *
 * Personal data: the organizer's address is read at send time and goes only to the Notification
 * Module; it is not stored on our rows and not written to our log lines.
 */
import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { EMAIL_CHANNEL, emailDelivery } from "../../lib/config/email-delivery"
import { emailFor, type EmailPayload, type SignDeadline } from "../../lib/content/team-order-emails"
import {
  dedupeKey,
  mayRetry,
  reminderDue,
  MAX_EMAIL_ATTEMPTS,
  type TeamOrderEmailKind,
} from "../../lib/rules/team-order-emails"
import type { Schedule } from "../../lib/rules/team-order-schedule"
import { isKind, type TeamOrderKind } from "../../lib/rules/team-order-links"
import { loadStoreSettings, scheduleOf, service, type TeamOrderRow } from "./team-orders"

type Logger = { warn: (message: string) => void; error: (message: string) => void }

const loggerOf = (container: MedusaContainer) => container.resolve(ContainerRegistrationKeys.LOGGER) as unknown as Logger

export type SendResult = "sent" | "skipped" | "failed" | "withheld"

/** The name of an error, never its message (a message could quote the notification's data). */
const errorName = (error: unknown): string => (error instanceof Error && error.name ? error.name : "Error")

/** The latest day to sign, as the email says it, from the schedule. */
export function deadlineOf(schedule: Schedule): SignDeadline {
  if (schedule.state === "none") return { day: null, rush: false, cannotBeMet: false }
  if (schedule.state === "ok") return { day: schedule.latest_sign_standard, rush: false, cannotBeMet: false }
  if (schedule.state === "needs_rush") return { day: schedule.latest_sign_rush, rush: true, cannotBeMet: false }
  return { day: schedule.latest_sign_rush, rush: true, cannotBeMet: true }
}

const kindOf = (order: Pick<TeamOrderRow, "kind">): TeamOrderKind => (isKind(order.kind) ? order.kind : "order")

type EmailRow = {
  id: string
  team_order_id: string
  kind: TeamOrderEmailKind
  dedupe_key: string
  status: "pending" | "sent" | "failed"
  attempts: number
  payload: EmailPayload
  last_attempt_at: Date | string | null
}

/** The organizer's first name and address, from the customer record; null when there is no address. */
async function organizerOf(container: MedusaContainer, customerId: string): Promise<{ email: string; firstName: string | null } | null> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({ entity: "customer", fields: ["id", "email", "first_name"], filters: { id: customerId } })
  const customer = (data as unknown as { email?: string | null; first_name?: string | null }[])[0]
  if (!customer?.email) return null
  const first = customer.first_name?.trim()
  return { email: customer.email, firstName: first ? first : null }
}

/**
 * One attempt to send a claimed email. Never throws: the outcome is written on the row (`sent`, or
 * `failed` with the error's name). The row's team order is read again, so a retry sends the same
 * email to the organizer as of now.
 */
async function attempt(container: MedusaContainer, row: EmailRow, now: Date): Promise<"sent" | "failed"> {
  const teams = service(container)
  try {
    await teams.updateTeamOrderEmails({
      id: row.id,
      status: "pending",
      attempts: row.attempts + 1,
      last_attempt_at: now,
    })
    const [order] = (await teams.listTeamOrders({ id: row.team_order_id })) as TeamOrderRow[]
    if (!order) throw Object.assign(new Error("team order gone"), { name: "TeamOrderGone" })
    const organizer = await organizerOf(container, order.customer_id)
    if (!organizer) throw Object.assign(new Error("no address"), { name: "NoOrganizerAddress" })
    const content = emailFor(row.kind, row.payload, organizer.firstName)
    await container.resolve(Modules.NOTIFICATION).createNotifications({
      to: organizer.email,
      channel: EMAIL_CHANNEL,
      template: `team-order-${row.kind.replace(/_/gu, "-")}`,
      trigger_type: "team-order",
      resource_id: order.id,
      resource_type: "team_order",
      data: { subject: content.subject, text: content.text, html: content.html, team_order_id: order.id },
    })
    await teams.updateTeamOrderEmails({ id: row.id, status: "sent", sent_at: new Date(), last_error: null })
    return "sent"
  } catch (error) {
    try {
      await teams.updateTeamOrderEmails({ id: row.id, status: "failed", last_error: errorName(error) })
    } catch {
      // The record could not be written either; the next job run finds the row as it was.
    }
    return "failed"
  }
}

/**
 * Makes one email, once. `payload` is what the text is made from (never an address). Returns
 * `skipped` when the key was claimed before, `withheld` where no email is sent at all (outside
 * development and test, until a provider exists). Never throws.
 */
export async function sendTeamOrderEmail(
  container: MedusaContainer,
  input: { order: Pick<TeamOrderRow, "id" | "kind">; kind: TeamOrderEmailKind; key: string; payload: EmailPayload },
  options: { now?: Date; warnWhenWithheld?: boolean } = {}
): Promise<SendResult> {
  try {
    if (emailDelivery(process.env) === "none") {
      if (options.warnWhenWithheld !== false) {
        loggerOf(container).warn("A team-order email was not sent: no email provider is configured for this environment.")
      }
      return "withheld"
    }
    const rowId = await service(container).claimEmail({
      teamOrderId: input.order.id,
      kind: input.kind,
      dedupeKey: input.key,
      payload: input.payload as unknown as Record<string, unknown>,
    })
    if (rowId === null) return "skipped"
    const [row] = (await service(container).listTeamOrderEmails({ id: rowId })) as unknown as EmailRow[]
    return row ? await attempt(container, row, options.now ?? new Date()) : "failed"
  } catch (error) {
    loggerOf(container).error(`A team-order email could not be recorded (${errorName(error)}).`)
    return "failed"
  }
}

const payloadOf = (order: TeamOrderRow, extra: Partial<EmailPayload> = {}): EmailPayload => ({
  teamName: order.team_name,
  orderKind: kindOf(order),
  ...extra,
})

/** "The proof is ready": when a proof is made. `proofId` and `proofNumber` are the new proof's. */
export async function sendProofReady(
  container: MedusaContainer,
  order: TeamOrderRow,
  proof: { id: string; proof_number: number },
  now: Date = new Date()
): Promise<SendResult> {
  try {
    const schedule = scheduleOf(order, await loadStoreSettings(container), now)
    return await sendTeamOrderEmail(
      container,
      {
        order,
        kind: "proof_ready",
        key: dedupeKey("proof_ready", { orderId: order.id, proofId: proof.id }),
        payload: payloadOf(order, { proofNumber: proof.proof_number, deadline: deadlineOf(schedule) }),
      },
      { now }
    )
  } catch (error) {
    loggerOf(container).error(`A team-order email could not be prepared (${errorName(error)}).`)
    return "failed"
  }
}

/** "Payment due: the deposit": when the proof is signed. */
export async function sendDepositDue(container: MedusaContainer, order: TeamOrderRow, proofId: string, now: Date = new Date()) {
  return sendTeamOrderEmail(
    container,
    { order, kind: "deposit_due", key: dedupeKey("deposit_due", { orderId: order.id, proofId }), payload: payloadOf(order) },
    { now }
  )
}

/** "Payment due: the balance": when the order becomes `balance_due`. */
export async function sendBalanceDue(container: MedusaContainer, order: TeamOrderRow, now: Date = new Date()) {
  return sendTeamOrderEmail(
    container,
    { order, kind: "balance_due", key: dedupeKey("balance_due", { orderId: order.id }), payload: payloadOf(order) },
    { now }
  )
}

export type ReminderRun = {
  today: string
  considered: number
  due: number
  sent: number
  skipped: number
  failed: number
  withheld: number
  retried: number
  retriedSent: number
}

/**
 * The reminder job's work, for the instant `now`: "today" is the store's day in the store's time
 * zone. Finds the orders in `draft` or `proof_sent` with a need-by date that are due a reminder
 * today (exactly 3 days or exactly 1 day before the latest day to sign; the rush day when the
 * standard one is past and rush still works), sends each once, then tries again the emails that
 * failed. Safe to run twice: a reminder already claimed is skipped.
 */
export async function runReminders(container: MedusaContainer, now: Date = new Date()): Promise<ReminderRun> {
  const settings = await loadStoreSettings(container)
  const orders = (await service(container).listTeamOrders({
    status: ["draft", "proof_sent"],
    need_by_date: { $ne: null },
  })) as TeamOrderRow[]
  const run: ReminderRun = {
    today: "",
    considered: orders.length,
    due: 0,
    sent: 0,
    skipped: 0,
    failed: 0,
    withheld: 0,
    retried: 0,
    retriedSent: 0,
  }
  for (const order of orders) {
    const schedule = scheduleOf(order, settings, now)
    run.today = schedule.today
    const due = reminderDue(order, schedule)
    if (!due) continue
    run.due += 1
    const result = await sendTeamOrderEmail(
      container,
      {
        order,
        kind: due.kind,
        key: dedupeKey(due.kind, { orderId: order.id, latestSignDay: due.latestSignDay }),
        payload: payloadOf(order, { deadline: deadlineOf(schedule), daysLeft: due.daysLeft }),
      },
      { now, warnWhenWithheld: false }
    )
    run[result === "sent" ? "sent" : result] += 1
  }
  if (run.withheld > 0) {
    loggerOf(container).warn(`${run.withheld} team-order reminder(s) were not sent: no email provider is configured for this environment.`)
  }
  const retry = await retryFailedEmails(container, now)
  run.retried = retry.tried
  run.retriedSent = retry.sent
  if (run.today === "") run.today = scheduleOf({ need_by_date: null }, settings, now).today
  return run
}

/** Tries again the emails whose send failed, or never finished (see `mayRetry`). Never throws. */
export async function retryFailedEmails(container: MedusaContainer, now: Date = new Date()): Promise<{ tried: number; sent: number }> {
  const result = { tried: 0, sent: 0 }
  if (emailDelivery(process.env) === "none") return result
  const rows = (await service(container).listTeamOrderEmails({
    status: ["failed", "pending"],
  })) as unknown as EmailRow[]
  for (const row of rows) {
    if (
      !mayRetry(
        {
          status: row.status,
          attempts: row.attempts,
          lastAttemptAt: row.last_attempt_at ? new Date(row.last_attempt_at) : null,
        },
        now
      )
    ) {
      continue
    }
    result.tried += 1
    if ((await attempt(container, row, now)) === "sent") result.sent += 1
  }
  return result
}

export { MAX_EMAIL_ATTEMPTS }
