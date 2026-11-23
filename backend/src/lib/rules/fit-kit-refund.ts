/**
 * The fit kit's refund: "Kit returned: refund the deposit" (CLAUDE.md, "Promises": fit kits are a
 * refundable deposit; dev-plan.md, M3). Plain TypeScript, no Medusa imports; the Medusa glue is
 * workflows/fit-kit/ and the admin route and widget around it (decision 017 when filed).
 *
 * The fit kit is a product with `metadata.kind` `fit_kit` (the seed; the same kind the minimum
 * quantity and the rush charge recognise, lib/rules/minimum-quantity.ts). Nothing here names a
 * product, a handle or a price.
 *
 * What may be refunded
 * - Only the kit lines' own money: each line's `total` (what the customer pays for that line: after
 *   its discounts, tax included), never a garment's, never delivery, never rush. Whether delivery
 *   paid for a kit should be refunded too is not settled (a question for the founders).
 * - Only when the order's payment is captured in full (the captured amounts of its payments, not
 *   cancelled, add up to the order's total) and the order is not cancelled. An unpaid order is
 *   refused; so is one whose cash on delivery was not collected yet (it is not captured).
 * - Once per kit: the kits come back by quantity (two kits on one order may come back on different
 *   days). The state is worked out from the record of earlier returns: how many kits came back and
 *   what was refunded for them. A third return of two kits is refused (`nothing_to_refund`).
 * - Never more than was paid: the amount of a return is the share of the kit lines' total that those
 *   kits made, worked out exactly (a line of 3 kits that cost 100 refunds 33.33, 33.34 and 33.33 at
 *   two decimals: the shares add up to the line's total), rounded half up to the currency's
 *   smallest unit (0 decimals in PKR, 2 in GBP, AED and USD). The amount is never read from a
 *   request. And never more than the payment still holds (captured less refunded): a refund made
 *   by hand in Medusa's own payment section that left too little is refused
 *   (`payment_refunded_elsewhere`) rather than guessed.
 * - Optionally within a return window: the store setting `fit_kit_return_days` (0 or absent: no
 *   limit; not settled, a question for the founders).
 *
 * How: a payment of a provider that has no money to hand back (cash on delivery, `pp_cod_cod`) is
 * refunded "by hand": the action records the amount and who, and moves no money. Every other
 * payment is refunded through Medusa's own refund workflow on the payment that paid.
 */
import {
  add,
  compare,
  exact,
  mul,
  readExact,
  roundHalfUp,
  sub,
  sum,
  toNumber,
  ZERO,
  div,
  type AmountInput,
  type Exact,
} from "./exact-amount"

/** The `metadata.kind` of the fit kit (compared exactly, like every kind). */
export const FIT_KIT_KIND = "fit_kit"

export function isFitKitKind(kind: unknown): boolean {
  return kind === FIT_KIT_KIND
}

/** The provider whose payments have no money to give back (modules/cod/constants.ts). */
export const BY_HAND_PROVIDER_ID = "pp_cod_cod"

/** Key of the store setting: days after the order within which a kit may come back (0: no limit). */
export const RETURN_DAYS_KEY = "fit_kit_return_days"

export const REFUND_METHODS = ["medusa", "by_hand"] as const
export type RefundMethod = (typeof REFUND_METHODS)[number]

/** Every refusal, as a code. */
export const REFUSAL_CODES = [
  "no_fit_kit",
  "order_canceled",
  "not_paid",
  "nothing_to_refund",
  "invalid_quantity",
  "return_window_over",
  "payment_refunded_elsewhere",
] as const
export type RefusalCode = (typeof REFUSAL_CODES)[number]

export const REFUSAL_MESSAGES: Record<RefusalCode, string> = {
  no_fit_kit: "This order has no fit kit.",
  order_canceled: "This order is canceled, so a fit kit cannot be refunded here.",
  not_paid:
    "This order is not paid yet (its payment is not captured in full), so there is nothing to refund. " +
    "For cash on delivery, record the courier's slip first.",
  nothing_to_refund: "Every fit kit on this order is already refunded.",
  invalid_quantity: "Enter how many kits came back: a whole number from 1 up to the kits still to refund.",
  return_window_over: "The time allowed for sending the kit back is over.",
  payment_refunded_elsewhere:
    "The payment holds less than this refund: part of it was refunded in the Payments section. " +
    "Check the refunds before refunding the kit.",
}

export const ORDER_NOT_FOUND_MESSAGE = "Order not found."
export const ORDER_BUSY_MESSAGE =
  "Another request on this order (a refund, a cash collection or a cancel) is still running. Try again in a moment."
export const REFUND_FAILED_MESSAGE =
  "The refund could not be made through the payment. Nothing was recorded. Check the payment in the Payments section."
export const RECORD_FAILED_MESSAGE =
  "The payment was refunded, but the record of the return could not be saved. Do not press again: tell the developer."
export const STATE_READ_FAILURE_MESSAGE = "The fit kit's state could not be read."
export const UNEXPECTED_FAILURE_MESSAGE = "The refund could not be made. Tell the developer."

/** One order line, as the rule reads it. */
export type KitOrderLine = {
  id: string
  /** The product's `metadata.kind`, whatever it holds. */
  kind?: unknown
  quantity: unknown
  /** What the line costs in all: after its discounts, tax included. */
  total: AmountInput | null | undefined
}

/** One payment of the order, with its captured and refunded sums (already added up). */
export type KitPayment = {
  id: string
  provider_id: string
  canceled: boolean
  captured: AmountInput | null | undefined
  refunded: AmountInput | null | undefined
}

/** One earlier return, from the record. */
export type PriorReturn = {
  quantity: number
  amount: AmountInput
}

export type KitRefundInput = {
  /** The order's status as Medusa has it (`canceled` is refused). */
  orderStatus: string | null | undefined
  orderCanceledAt?: string | null
  /** Decimal digits of the order's currency (0 for PKR, 2 for GBP, AED, USD). */
  currencyDigits: number
  orderTotal: AmountInput | null | undefined
  lines: readonly KitOrderLine[]
  payments: readonly KitPayment[]
  prior: readonly PriorReturn[]
  orderCreatedAt?: string | null
  now: Date
  /** The setting: 0 or null for no limit. */
  returnDays?: number | null
}

export type KitRefundState = {
  /** The order has a fit kit line: the panel is shown only then. */
  applies: boolean
  kits_total: number
  kits_returned: number
  kits_left: number
  /** What was refunded for kits so far. */
  refunded_amount: number
  /** `amounts_by_quantity[n - 1]` is what returning `n` more kits refunds (n = 1 up to kits_left). */
  amounts_by_quantity: number[]
  can_refund: boolean
  reason: RefusalCode | null
  /** How a refund would be made now, when it can be. */
  method: RefundMethod | null
  payment_id: string | null
  /** The refusal's sentence, or null. */
  message: string | null
}

/** A positive whole number, or 0 for anything else (a number, a decimal string or Medusa's big-number object). */
function wholeQuantity(value: unknown): number {
  const read = readExact(value)
  return read !== null && read.den === 1n && read.num > 0n && read.num < 1_000_000n ? Number(read.num) : 0
}

/** The amount of each kit, in the order of the lines: a line's shares add up to its total exactly. */
export function kitAmounts(lines: readonly KitOrderLine[], digits: number): Exact[] {
  const amounts: Exact[] = []
  for (const line of lines) {
    if (!isFitKitKind(line.kind)) continue
    const quantity = wholeQuantity(line.quantity)
    const total = readExact(line.total)
    if (quantity === 0 || total === null) continue
    const cumulative = (kits: number): Exact =>
      kits >= quantity ? roundHalfUp(total, digits) : roundHalfUp(div(mul(total, exact(kits)), exact(quantity)), digits)
    for (let kit = 1; kit <= quantity; kit++) {
      amounts.push(sub(cumulative(kit), cumulative(kit - 1)))
    }
  }
  return amounts
}

const exactOrZero = (value: AmountInput | null | undefined): Exact => readExact(value) ?? ZERO

/** The payment that can carry a refund of `amount`: the first, not canceled, with that much left. */
function paymentFor(payments: readonly KitPayment[], amount: Exact): KitPayment | null {
  for (const payment of payments) {
    if (payment.canceled) continue
    const left = sub(exactOrZero(payment.captured), exactOrZero(payment.refunded))
    if (compare(left, amount) >= 0) return payment
  }
  return null
}

function isPaidInFull(input: KitRefundInput): boolean {
  const total = readExact(input.orderTotal)
  if (total === null) return false
  const captured = sum(input.payments.filter((p) => !p.canceled).map((p) => exactOrZero(p.captured)))
  return compare(captured, ZERO) > 0 && compare(captured, total) >= 0
}

function windowOver(input: KitRefundInput): boolean {
  const days = input.returnDays
  if (!days || days <= 0 || !input.orderCreatedAt) return false
  const placed = new Date(input.orderCreatedAt).getTime()
  if (Number.isNaN(placed)) return false
  return input.now.getTime() - placed > days * 24 * 60 * 60 * 1000
}

/** The state of the order's fit kits, and whether (and how) a return may be refunded now. */
export function kitRefundState(input: KitRefundInput): KitRefundState {
  const all = kitAmounts(input.lines, input.currencyDigits)
  const returned = input.prior.reduce((count, p) => count + wholeQuantity(p.quantity), 0)
  const left = Math.max(0, all.length - returned)
  const refunded = sum(input.prior.map((p) => exactOrZero(p.amount)))
  const remaining = all.slice(Math.min(returned, all.length))
  const amounts: Exact[] = []
  let running = ZERO
  for (const amount of remaining) {
    running = add(running, amount)
    amounts.push(running)
  }
  const state: KitRefundState = {
    applies: all.length > 0,
    kits_total: all.length,
    kits_returned: Math.min(returned, all.length),
    kits_left: left,
    refunded_amount: toNumber(refunded),
    amounts_by_quantity: amounts.map(toNumber),
    can_refund: false,
    reason: null,
    method: null,
    payment_id: null,
    message: null,
  }
  const refuse = (reason: RefusalCode): KitRefundState => ({
    ...state,
    can_refund: false,
    reason,
    message: REFUSAL_MESSAGES[reason],
  })
  if (!state.applies) return refuse("no_fit_kit")
  if (input.orderStatus === "canceled" || input.orderCanceledAt) return refuse("order_canceled")
  if (left === 0) return refuse("nothing_to_refund")
  if (!isPaidInFull(input)) return refuse("not_paid")
  if (windowOver(input)) return refuse("return_window_over")
  // The most a return could be is every kit left; the payment must hold at least the next kit.
  const payment = paymentFor(input.payments, amounts[0]!)
  if (!payment) return refuse("payment_refunded_elsewhere")
  return {
    ...state,
    can_refund: true,
    method: payment.provider_id === BY_HAND_PROVIDER_ID ? "by_hand" : "medusa",
    payment_id: payment.id,
  }
}

export type KitRefundDecision =
  | {
      ok: true
      quantity: number
      /** The amount, worked out here: never read from a request. */
      amount: number
      amountExact: Exact
      method: RefundMethod
      paymentId: string
    }
  | { ok: false; code: RefusalCode; message: string }

/**
 * Decides one return of `quantity` kits. `quantity` is what the request says; the amount is worked
 * out from the order. A refusal comes with its code.
 */
export function decideKitRefund(input: KitRefundInput, quantity: unknown): KitRefundDecision {
  const state = kitRefundState(input)
  const refuse = (code: RefusalCode): KitRefundDecision => ({ ok: false, code, message: REFUSAL_MESSAGES[code] })
  if (!state.can_refund) {
    return refuse(state.reason ?? "not_paid")
  }
  const count = typeof quantity === "number" && Number.isInteger(quantity) ? quantity : Number.NaN
  if (!(count >= 1 && count <= state.kits_left)) return refuse("invalid_quantity")
  const amounts = kitAmounts(input.lines, input.currencyDigits)
  const returned = state.kits_returned
  const amount = sum(amounts.slice(returned, returned + count))
  const payment = paymentFor(input.payments, amount)
  if (!payment) return refuse("payment_refunded_elsewhere")
  return {
    ok: true,
    quantity: count,
    amount: toNumber(amount),
    amountExact: amount,
    method: payment.provider_id === BY_HAND_PROVIDER_ID ? "by_hand" : "medusa",
    paymentId: payment.id,
  }
}
