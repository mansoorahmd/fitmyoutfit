/**
 * THE WORDS OF THE EMAILS A TEAM ORDER'S ORGANIZER GETS. DRAFT WORDING: the founders confirm it.
 *
 * This is the one content file for them. Each email is a plain function from data to
 * `{ subject, text, html }` (the html is simple paragraphs, every value escaped). Nothing here is
 * read from a request or the database; the caller passes the data (lib/rules/team-order-emails.ts
 * says which email goes when).
 *
 * What the wording promises: only what the plan does. No prices and no amounts (payments are not
 * built: the payment emails say what is due in words and that payment details follow from us), no
 * date other than the ones the need-by schedule computes (the latest day to sign). Delivery
 * promises (15 days, 10 with rush) are not repeated here.
 *
 * An add-on (a late joiner's order) and a reorder have a sentence of their own that says which
 * order the email is about; the rest is the same.
 */
import type { TeamOrderEmailKind } from "../rules/team-order-emails"
import type { TeamOrderKind } from "../rules/team-order-links"

/** The wording is a draft until the founders confirm it. */
export const WORDING_IS_DRAFT = true

export type EmailContent = { subject: string; text: string; html: string }

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
]

/** `2026-12-03` as `3 December 2026` (plain arithmetic, no locale and no time zone). */
export function formatDay(day: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(day)
  const month = match ? MONTHS[Number(match[2]) - 1] : undefined
  if (!match || !month) return day
  return `${Number(match[3])} ${month} ${match[1]}`
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/"/gu, "&quot;")
    .replace(/'/gu, "&#39;")
}

/** The email as plain text paragraphs, and the same as simple html. */
function compose(subject: string, paragraphs: readonly string[]): EmailContent {
  return {
    subject,
    text: paragraphs.join("\n\n") + "\n",
    html: paragraphs.map((p) => `<p>${escapeHtml(p)}</p>`).join("\n"),
  }
}

/** The order the email is about, in words: "the team order", "the add-on order" or "the reorder". */
export function orderPhrase(kind: TeamOrderKind): string {
  return kind === "add_on" ? "the add-on order" : kind === "reorder" ? "the reorder" : "the team order"
}

function orderSentence(kind: TeamOrderKind, teamName: string): string[] {
  if (kind === "add_on") return [`This is about the add-on order for late players of "${teamName}".`]
  if (kind === "reorder") return [`This is about the reorder for "${teamName}".`]
  return []
}

function greeting(firstName: string | null): string {
  return firstName ? `Hello ${firstName},` : "Hello,"
}

const CLOSING = "FitMyOutfit"

/** What the sign-by day is, as the schedule works it out (lib/rules/team-order-emails.ts). */
export type SignDeadline = {
  /** The latest day to sign, YYYY-MM-DD; null when the order has no need-by date. */
  day: string | null
  /** True when `day` is the latest day to sign with paid rush (standard delivery is already too late). */
  rush: boolean
  /** True when even rush would be too late for the need-by date. */
  cannotBeMet: boolean
}

function deadlineSentences(deadline: SignDeadline): string[] {
  if (deadline.day === null) return []
  if (deadline.cannotBeMet) {
    return [
      `The need-by date you gave is closer than our delivery time allows (the latest day to sign with rush was ${formatDay(deadline.day)}), so we cannot promise it. Please contact us.`,
    ]
  }
  return deadline.rush
    ? [
        `For your need-by date, standard delivery is already too late. With paid rush, the latest day to sign the proof is ${formatDay(deadline.day)}.`,
      ]
    : [`For your need-by date, the latest day to sign the proof is ${formatDay(deadline.day)}.`]
}

export type ProofReadyData = {
  firstName: string | null
  teamName: string
  orderKind: TeamOrderKind
  proofNumber: number
  deadline: SignDeadline
}

/** The proof is ready (sent when a proof is made). */
export function proofReadyEmail(data: ProofReadyData): EmailContent {
  return compose(`Proof ${data.proofNumber} for ${data.teamName} is ready to sign`, [
    greeting(data.firstName),
    `Proof ${data.proofNumber} for "${data.teamName}" is ready. It lists every player with the name, number and size as it will be made. Please check it carefully and sign it in your account.`,
    ...orderSentence(data.orderKind, data.teamName),
    ...deadlineSentences(data.deadline),
    "Once you sign, the list is locked. If something is wrong, go back and change it before signing.",
    CLOSING,
  ])
}

export type ReminderData = {
  firstName: string | null
  teamName: string
  orderKind: TeamOrderKind
  /** 3 or 1. */
  daysLeft: number
  deadline: SignDeadline
}

/** The reminder 3 days or 1 day before the latest day to sign. */
export function reminderEmail(data: ReminderData): EmailContent {
  const when = data.daysLeft === 1 ? "1 day" : `${data.daysLeft} days`
  const day = data.deadline.day === null ? "" : formatDay(data.deadline.day)
  const lead = data.deadline.rush
    ? `Standard delivery can no longer meet your need-by date, but paid rush still can. The latest day to sign the proof for "${data.teamName}" with rush is ${day}, ${when} from now.`
    : `The latest day to sign the proof for "${data.teamName}" for your need-by date is ${day}, ${when} from now.`
  return compose(`${when} left to sign the proof for ${data.teamName}`, [
    greeting(data.firstName),
    lead,
    ...orderSentence(data.orderKind, data.teamName),
    "If the team list is not finished, finish it and make the proof. If the proof is ready, sign it in your account.",
    CLOSING,
  ])
}

export type PaymentDueData = {
  firstName: string | null
  teamName: string
  orderKind: TeamOrderKind
  which: "deposit" | "balance"
}

/** Payment due: the deposit (the proof is signed) or the balance (the order is ready). No amounts. */
export function paymentDueEmail(data: PaymentDueData): EmailContent {
  const order = orderPhrase(data.orderKind)
  if (data.which === "deposit") {
    return compose(`Deposit due for ${data.teamName}`, [
      greeting(data.firstName),
      `Thank you for signing the proof for "${data.teamName}". The deposit for ${order} is now due.`,
      ...orderSentence(data.orderKind, data.teamName),
      "We will send you the payment details separately.",
      CLOSING,
    ])
  }
  return compose(`Balance due for ${data.teamName}`, [
    greeting(data.firstName),
    `The balance for ${order} for "${data.teamName}" is now due, before the order is shipped.`,
    ...orderSentence(data.orderKind, data.teamName),
    "We will send you the payment details separately.",
    CLOSING,
  ])
}

/** What each kind of email is made from, as stored on the email's row (no address, no signature). */
export type EmailPayload = {
  teamName: string
  orderKind: TeamOrderKind
  proofNumber?: number
  deadline?: SignDeadline
  daysLeft?: number
}

/** The email of a kind from its stored payload and the organizer's first name. */
export function emailFor(kind: TeamOrderEmailKind, payload: EmailPayload, firstName: string | null): EmailContent {
  const deadline: SignDeadline = payload.deadline ?? { day: null, rush: false, cannotBeMet: false }
  switch (kind) {
    case "proof_ready":
      return proofReadyEmail({
        firstName,
        teamName: payload.teamName,
        orderKind: payload.orderKind,
        proofNumber: payload.proofNumber ?? 1,
        deadline,
      })
    case "reminder_3d":
    case "reminder_1d":
      return reminderEmail({
        firstName,
        teamName: payload.teamName,
        orderKind: payload.orderKind,
        daysLeft: kind === "reminder_1d" ? 1 : 3,
        deadline,
      })
    case "deposit_due":
      return paymentDueEmail({ firstName, teamName: payload.teamName, orderKind: payload.orderKind, which: "deposit" })
    case "balance_due":
      return paymentDueEmail({ firstName, teamName: payload.teamName, orderKind: payload.orderKind, which: "balance" })
  }
}
