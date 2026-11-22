/**
 * Which emails a team order's organizer gets, and when. Plain TypeScript, no Medusa imports; the
 * clock is an argument (the schedule is worked out for a given "today", team-order-schedule.ts).
 * The words of the emails are in lib/content/team-order-emails.ts.
 *
 * - `proof_ready`: when a proof is made.
 * - `deposit_due`: when the proof is signed (the deposit is due).
 * - `balance_due`: when the order becomes `balance_due`.
 * - `reminder_3d` and `reminder_1d`: 3 days and 1 day before the latest day to sign, for an order in
 *   `draft` or `proof_sent` that has a need-by date. The latest day is the standard one; when it is
 *   already past and rush still works, it is the rush one (and the email says so).
 *
 * Every email has a `dedupe_key`; the database holds at most one row per key, so an email is made
 * once (the reminder job may run twice, the server may restart).
 */
import type { Schedule } from "./team-order-schedule"

export const TEAM_ORDER_EMAIL_KINDS = ["proof_ready", "deposit_due", "balance_due", "reminder_3d", "reminder_1d"] as const
export type TeamOrderEmailKind = (typeof TEAM_ORDER_EMAIL_KINDS)[number]

/** The most times a failed email is tried (the first send included). */
export const MAX_EMAIL_ATTEMPTS = 5

/** A claimed email whose send never finished is tried again after this many minutes. */
export const PENDING_RETRY_AFTER_MINUTES = 10

export type ReminderDue = {
  kind: "reminder_3d" | "reminder_1d"
  /** Which latest day the reminder counts to. */
  target: "standard" | "rush"
  /** That latest day to sign, YYYY-MM-DD. */
  latestSignDay: string
  /** Days from today to it: 3 or 1. */
  daysLeft: number
}

/**
 * The reminder an order is due today, or null. Exactly on the third day and on the first day
 * before the latest day to sign (the standard day, or, when that is past and rush still works,
 * the rush day). The latest day itself, and days in between, send nothing.
 */
export function reminderDue(order: { status: string }, schedule: Schedule): ReminderDue | null {
  if (order.status !== "draft" && order.status !== "proof_sent") return null
  if (schedule.state === "none" || schedule.latest_sign_standard === null || schedule.latest_sign_rush === null) return null
  const standard = schedule.days_left_standard
  const rush = schedule.days_left_rush
  if (standard === null || rush === null) return null
  let target: ReminderDue["target"]
  let latestSignDay: string
  let daysLeft: number
  if (standard >= 0) {
    target = "standard"
    latestSignDay = schedule.latest_sign_standard
    daysLeft = standard
  } else if (rush >= 0) {
    target = "rush"
    latestSignDay = schedule.latest_sign_rush
    daysLeft = rush
  } else {
    return null
  }
  if (daysLeft === 3) return { kind: "reminder_3d", target, latestSignDay, daysLeft }
  if (daysLeft === 1) return { kind: "reminder_1d", target, latestSignDay, daysLeft }
  return null
}

/**
 * The key an email is made once for. A reminder is once per order, kind and latest day (a changed
 * need-by date has a new latest day, so it can be reminded of again); the other emails are once per
 * proof, or once per order for the balance.
 */
export function dedupeKey(
  kind: TeamOrderEmailKind,
  ref: { orderId: string; proofId?: string; latestSignDay?: string }
): string {
  if (kind === "proof_ready" || kind === "deposit_due") return `${kind}:${ref.proofId ?? ref.orderId}`
  if (kind === "balance_due") return `${kind}:${ref.orderId}`
  return `${kind}:${ref.orderId}:${ref.latestSignDay ?? ""}`
}

/** True when a row in this state may be tried again now. */
export function mayRetry(
  row: { status: "pending" | "sent" | "failed"; attempts: number; lastAttemptAt: Date | null },
  now: Date
): boolean {
  if (row.status === "sent" || row.attempts >= MAX_EMAIL_ATTEMPTS) return false
  if (row.status === "failed") return true
  // pending: the send may still be running, or the process died; wait before trying again.
  const last = row.lastAttemptAt?.getTime() ?? 0
  return now.getTime() - last >= PENDING_RETRY_AFTER_MINUTES * 60_000
}
