/**
 * The money of a team order: the deposit and the balance (CLAUDE.md, "Team orders": the organizer
 * pays a 50% deposit at proof approval and the 50% balance before shipping). Plain TypeScript, no
 * Medusa imports; the Medusa glue is workflows/team-order/payments.ts (decision 016).
 *
 * - The split: the deposit is the share set in the store setting `team_order_deposit_percentage`
 *   (seed 50) of the order's total, rounded HALF UP to the currency's smallest unit; the balance is
 *   the total less the deposit, so the two always add up to the total exactly.
 * - The state of each part, read from its Medusa payment collection.
 * - When the organizer may pay each part, and the refusal codes.
 * - Which status step a payment causes (`approved -> deposit_paid` when the deposit is captured; as
 *   the system, or as an admin by hand when the capture names one), and the balance's record.
 * - The gate of shipping (the balance captured, less refunds) and of going back to draft.
 * - The payment link of the emails.
 */
import {
  compare,
  div,
  exact,
  max,
  mul,
  roundHalfUp,
  sub,
  ZERO,
  type AmountInput,
  type Exact,
} from "./exact-amount"
import type { TeamOrderStatus } from "./team-order-status"

export const PAYMENT_PARTS = ["deposit", "balance"] as const
export type PaymentPart = (typeof PAYMENT_PARTS)[number]

export function isPaymentPart(value: unknown): value is PaymentPart {
  return typeof value === "string" && (PAYMENT_PARTS as readonly string[]).includes(value)
}

/**
 * The payment providers the organizer may pay a team order with. Today only Medusa's placeholder
 * (`pp_system_default`); a real gateway (Stripe, JazzCash, Easypaisa) is added here when it exists.
 * Cash on delivery is not one: a deposit is paid before anything is made.
 */
export const TEAM_ORDER_PAYMENT_PROVIDERS = ["pp_system_default"] as const
export const DEFAULT_TEAM_ORDER_PAYMENT_PROVIDER = "pp_system_default"

export function isTeamOrderPaymentProvider(value: unknown): boolean {
  return typeof value === "string" && (TEAM_ORDER_PAYMENT_PROVIDERS as readonly string[]).includes(value)
}

// ---------------------------------------------------------------------------------------------
// What the order is made of

/** The key on a Medusa order (its `metadata`) that names the team order it was made for. */
export const TEAM_ORDER_ID_KEY = "team_order_id"

/** True when a Medusa order was made for a team order (its metadata names one). */
export function isTeamOrderOrder(metadata: Readonly<Record<string, unknown>> | null | undefined): boolean {
  const id = metadata?.[TEAM_ORDER_ID_KEY]
  return typeof id === "string" && id !== ""
}

/**
 * The pieces per size of a signed (or sent) proof's lines, in the product's size order: one entry
 * per size that has pieces. A line's pieces are its count (`piecesOf` of the rules package: a count
 * that is not a whole number of 1 or more counts as 1). Throws for a size that is not the product's
 * (a proof is only made from a list without problems, so this is a programming error).
 */
export function piecesBySize(
  lines: readonly { size: string; count: number }[],
  sizes: readonly string[],
  piecesOf: (line: { count: number }) => number
): { size: string; quantity: number }[] {
  const bySize = new Map<string, number>()
  for (const line of lines) {
    if (!sizes.includes(line.size)) {
      throw new Error(`A proof line has a size that is not the product's: ${JSON.stringify(line.size)}`)
    }
    bySize.set(line.size, (bySize.get(line.size) ?? 0) + piecesOf(line))
  }
  return sizes.filter((size) => (bySize.get(size) ?? 0) > 0).map((size) => ({ size, quantity: bySize.get(size)! }))
}

// ---------------------------------------------------------------------------------------------
// The split

export type Split = { total: Exact; deposit: Exact; balance: Exact }

/**
 * Splits `total` into the deposit and the balance. `percentage` is the deposit's share (1 to 100);
 * `currencyDigits` the currency's decimal digits (0 for PKR, 2 for GBP, AED and USD). The deposit
 * is rounded half up to that unit; the balance is exactly the rest. A total below 0 is an error.
 */
export function splitTotal(total: AmountInput, percentage: number, currencyDigits: number): Split {
  if (!Number.isFinite(percentage) || percentage <= 0 || percentage > 100) {
    throw new Error(`Expected a deposit percentage above 0 and at most 100, got ${percentage}`)
  }
  if (!Number.isInteger(currencyDigits) || currencyDigits < 0) {
    throw new Error(`Expected a whole number of currency digits, got ${currencyDigits}`)
  }
  const whole = exact(total, "total")
  if (compare(whole, ZERO) < 0) {
    throw new Error("A team order's total cannot be below 0")
  }
  const share = div(exact(percentage, "percentage"), { num: 100n, den: 1n })
  // Never above the total (a total with more digits than the currency rounds up at most to it).
  let deposit = roundHalfUp(mul(whole, share), currencyDigits)
  if (compare(deposit, whole) > 0) deposit = whole
  return { total: whole, deposit, balance: sub(whole, deposit) }
}

/** The balance still to be paid: the total less what the deposit's payment captured (net of refunds), never below 0. */
export function balanceAfterDeposit(total: AmountInput, depositNet: AmountInput): Exact {
  return max(sub(exact(total, "total"), exact(depositNet, "deposit")), ZERO)
}

// ---------------------------------------------------------------------------------------------
// The state of a part

/** A Medusa payment collection, as far as these rules read it. */
export type CollectionInput = {
  amount: AmountInput
  /** Medusa's collection status: not_paid, awaiting, authorized, partially_authorized, canceled, failed, completed. */
  status: string
  capturedAmount?: AmountInput | null
  refundedAmount?: AmountInput | null
  authorizedAmount?: AmountInput | null
  /** The collection's payment sessions (Medusa keeps one active session per collection). */
  sessions?: readonly { status: string }[]
}

/**
 * - `unpaid`: nothing started.
 * - `started`: a session was started and nothing is taken (placeholder `pending`): it can be dropped.
 * - `awaiting`: a gateway is working on it (`requires_more`, `pending_authorization`): money may be on its way.
 * - `authorized`: authorised, not captured.
 * - `paid`: captured in full, nothing refunded.
 * - `refunded`: captured and then refunded, in part or in full (counts as not paid for the gates).
 * - `canceled`: Medusa canceled the collection (the order was canceled).
 */
export type PartState = "unpaid" | "started" | "awaiting" | "authorized" | "paid" | "refunded" | "canceled"

const amountOrZero = (value: AmountInput | null | undefined): Exact => (value === null || value === undefined ? ZERO : exact(value))

export function partState(collection: CollectionInput): PartState {
  const amount = exact(collection.amount, "amount")
  const captured = amountOrZero(collection.capturedAmount)
  const refunded = amountOrZero(collection.refundedAmount)
  if (compare(refunded, ZERO) > 0) return "refunded"
  if (compare(captured, ZERO) > 0 && compare(captured, amount) >= 0) return "paid"
  if (collection.status === "canceled") return "canceled"
  if (collection.status === "completed") return "paid"
  const authorized = amountOrZero(collection.authorizedAmount)
  if (collection.status === "authorized" || (compare(authorized, ZERO) > 0 && compare(authorized, amount) >= 0)) {
    return "authorized"
  }
  const sessions = collection.sessions ?? []
  if (sessions.some((s) => s.status === "requires_more" || s.status === "pending_authorization" || s.status === "authorized")) {
    return "awaiting"
  }
  if (sessions.some((s) => s.status === "pending")) return "started"
  return "unpaid"
}

/** The part is paid: captured in full and nothing of it refunded. */
export const isPaid = (state: PartState | null | undefined): boolean => state === "paid"

/** Money may have been taken, or may be on its way, for this part. */
export const holdsMoney = (state: PartState | null | undefined): boolean =>
  state === "awaiting" || state === "authorized" || state === "paid" || state === "refunded"

/** What is captured of a collection, less its refunds, never below 0. */
export function netCaptured(collection: Pick<CollectionInput, "capturedAmount" | "refundedAmount">): Exact {
  return max(sub(amountOrZero(collection.capturedAmount), amountOrZero(collection.refundedAmount)), ZERO)
}

// ---------------------------------------------------------------------------------------------
// When the organizer may pay

export type PayRefusal =
  | "deposit_not_due"
  | "deposit_already_paid"
  | "balance_not_due"
  | "balance_already_paid"
  | "payment_in_progress"
  | "order_canceled"

/**
 * Why the organizer may not start (or complete) paying `part` now, or null when they may.
 * The deposit is due while the order is `approved` (the proof is signed); the balance while it is
 * `balance_due`. A part that is paid is "already paid"; one that a gateway is working on is "in
 * progress" (for starting a new payment only: `forStart`).
 */
export function whyNoPayment(input: {
  part: PaymentPart
  status: TeamOrderStatus
  state: PartState | null
  orderCanceled?: boolean
  forStart?: boolean
}): PayRefusal | null {
  const { part, status, state } = input
  if (part === "deposit") {
    if (state === "paid" || state === "refunded" || isAfter(status, "approved")) return "deposit_already_paid"
    if (status !== "approved") return "deposit_not_due"
  } else {
    if (state === "paid" || state === "refunded" || status === "shipped") return "balance_already_paid"
    if (status !== "balance_due") return "balance_not_due"
  }
  if (input.orderCanceled || state === "canceled") return "order_canceled"
  if (input.forStart && (state === "awaiting" || state === "authorized")) return "payment_in_progress"
  return null
}

const ORDER: readonly TeamOrderStatus[] = ["draft", "proof_sent", "approved", "deposit_paid", "in_production", "balance_due", "shipped"]

/** True when `status` comes after `than` in the flow. */
export function isAfter(status: TeamOrderStatus, than: TeamOrderStatus): boolean {
  return ORDER.indexOf(status) > ORDER.indexOf(than)
}

/** Whether a part is due now, for the answers (`due: true` shows the "Pay" button). */
export function isDue(part: PaymentPart, status: TeamOrderStatus, state: PartState | null): boolean {
  return whyNoPayment({ part, status, state }) === null
}

// ---------------------------------------------------------------------------------------------
// The steps the money causes

/** Who captured a part: the admin user named on the capture, or nobody (the organizer's payment, a gateway). */
export type CapturedBy = { userId: string | null }

/** Admin user ids are Medusa's `user_...`; anything else on a capture is not taken as an admin. */
export const isAdminUserId = (value: unknown): value is string => typeof value === "string" && /^user_[A-Za-z0-9]+$/u.test(value)

export type PaymentStep =
  | { kind: "status"; from: "approved"; to: "deposit_paid"; actor: "system"; actorId: null; byHand: false }
  | { kind: "status"; from: "approved"; to: "deposit_paid"; actor: "admin"; actorId: string; byHand: true }

/**
 * The status step the deposit causes, or null: an order that is `approved` and whose deposit is
 * paid moves to `deposit_paid`, recorded as the system's step, or as an admin's by-hand step when
 * the capture names an admin user (the by-hand button, or Medusa's own "Mark as paid").
 */
export function depositStep(status: TeamOrderStatus, deposit: PartState | null, capturedBy: CapturedBy): PaymentStep | null {
  if (status !== "approved" || deposit !== "paid") return null
  if (isAdminUserId(capturedBy.userId)) {
    return { kind: "status", from: "approved", to: "deposit_paid", actor: "admin", actorId: capturedBy.userId, byHand: true }
  }
  return { kind: "status", from: "approved", to: "deposit_paid", actor: "system", actorId: null, byHand: false }
}

/** The step name of the system's record that the balance was paid (no status change). */
export const BALANCE_PAID = "balance_paid"

/**
 * The record the balance causes (no status change), or null: once, on an order in `balance_due`
 * whose balance is paid. By an admin by hand (`balance_received_by_hand`) when the capture names
 * an admin user, else by the system (`balance_paid`). `recorded`: a balance record exists already.
 */
export function balanceRecord(
  status: TeamOrderStatus,
  balance: PartState | null,
  capturedBy: CapturedBy,
  recorded: boolean
): { actor: "system"; actorId: null; byHand: false } | { actor: "admin"; actorId: string; byHand: true } | null {
  if (recorded || status !== "balance_due" || balance !== "paid") return null
  if (isAdminUserId(capturedBy.userId)) return { actor: "admin", actorId: capturedBy.userId, byHand: true }
  return { actor: "system", actorId: null, byHand: false }
}

/** Shipping needs the balance paid: captured in full and nothing refunded. */
export function mayShip(balance: PartState | null): boolean {
  return isPaid(balance)
}

/**
 * Whether the organizer may go back to draft from `approved`, as far as money goes: refused
 * (`payment_in_progress`) when anything of the deposit is authorised, captured, refunded, or a
 * gateway is working on it. A session that was only started (nothing taken) does not block: going
 * back drops it with the order.
 */
export function whyNoReopenForMoney(deposit: PartState | null): "payment_in_progress" | null {
  return holdsMoney(deposit) ? "payment_in_progress" : null
}

// ---------------------------------------------------------------------------------------------
// The payment link

/**
 * The storefront's payment page for an order: `pattern` (the store setting
 * `team_order_payment_path`, seed `/[countryCode]/account/team-orders/[id]/pay`) with `[countryCode]`
 * and `[id]` filled in, after the storefront's origin. Null when the pattern is not a path that
 * names the order (`[id]`).
 */
export function paymentLink(origin: string, pattern: string, values: { countryCode: string; id: string }): string | null {
  if (!isPaymentPathPattern(pattern)) return null
  const path = pattern
    .replace(/\[countryCode\]/gu, encodeURIComponent(values.countryCode.toLowerCase()))
    .replace(/\[id\]/gu, encodeURIComponent(values.id))
  return `${origin.replace(/\/+$/u, "")}${path}`
}

/** A path that starts with one `/`, names the order with `[id]`, and has no scheme, host, query or fragment. */
export function isPaymentPathPattern(pattern: unknown): pattern is string {
  return (
    typeof pattern === "string" &&
    pattern.length <= 200 &&
    /^\/(?!\/)/u.test(pattern) &&
    pattern.includes("[id]") &&
    !/[\s?#\\]|:\/\//u.test(pattern)
  )
}
