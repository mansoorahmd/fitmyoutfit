/**
 * Cash on delivery collected: when staff may record that the courier collected the cash, what a
 * valid slip reference is, what the order's payment figures mean, and what staff are told. Plain
 * TypeScript, no Medusa imports.
 *
 * The founders' process: the courier hands over a slip against the order number once the cash is
 * collected; staff then record it in the admin. Recording it captures what is still open of the
 * cash-on-delivery payment (through Medusa's own payment flow, in workflows/cash-collection/) and
 * then keeps the slip reference and the time as the order's cash-collection record, a row of its
 * own (modules/cash-collection), never in the order's metadata, which a signed-in customer can
 * read and Medusa's admin saves as a whole. Who captured is Medusa's own capture record.
 *
 * Capture first, then record: the capture runs to its end on its own; the record is then one
 * insert, made only if, at that moment and under the order's and the payment's row locks, the
 * order is not canceled and the payment neither canceled nor refunded (recordRefusalAtInsert). The
 * database allows one record per order, so of several presses at once exactly one records, on any
 * number of server instances. A payment that is fully captured without a record (Medusa's own
 * "Capture payment" button, or a record that failed after the capture) can get its record once,
 * without a second capture.
 *
 * Money is worked out exactly (exact-amount.ts): Medusa keeps amounts as decimal strings, and a
 * remainder such as 1124.995 less 333.5 must be captured to the last digit, never rounded.
 */
import { COD_PAYMENT_PROVIDER_ID } from "../../modules/cod/constants"
import {
  compare,
  readExact,
  sub,
  sum,
  toDecimalString,
  toNumber,
  ZERO,
  type AmountInput,
  type Exact,
} from "./exact-amount"

/** Longest slip reference kept. Courier slip and consignment numbers are far shorter. */
export const SLIP_REFERENCE_MAX_LENGTH = 64

/** The order's cash-collection record, as kept (modules/cash-collection). */
export type CashCollectionRecord = {
  slip_reference: string
  /** When it was recorded, as an ISO time (UTC). */
  collected_at: string | null
}

/** One capture of a payment, from Medusa's own capture record. */
export type CollectionCapture = {
  /** The captured amount, as Medusa keeps it (a decimal string, a number or `{ value }`). */
  amount: AmountInput | null | undefined
  /** The admin user (or API key) that captured, as Medusa recorded it. */
  created_by: string | null
  /** When, as an ISO time. */
  created_at: string | null
}

/** One payment of the order, as far as this rule needs it. */
export type CollectionPayment = {
  id: string
  provider_id: string
  /** The payment's amount, as Medusa keeps it. */
  amount: AmountInput | null | undefined
  /** Medusa's `captured_at`: set once the whole amount is captured. */
  captured_at: string | null
  canceled: boolean
  captures: readonly CollectionCapture[]
  /** The amounts of the payment's refunds that were not abandoned (Medusa soft-deletes failed ones). */
  refunds: readonly (AmountInput | null | undefined)[]
}

export type CashCollectionInput = {
  /** The order's status (`canceled` stops collection). */
  orderStatus?: string | null
  /** The order's currency, for the figures in sentences ("PKR 2250"). */
  currencyCode?: string | null
  /** Every payment of the order. */
  payments: readonly CollectionPayment[]
  /** The order's cash-collection record, or null when none is kept. */
  record: CashCollectionRecord | null
  /**
   * The amounts of the order's capture transactions (Medusa's `order_transaction` rows with
   * reference "capture"), compared with the payments' captures (captureMismatch); not compared
   * when left out.
   */
  orderCaptureTransactions?: readonly (AmountInput | null | undefined)[]
}

// --- Money ---

function amountOf(value: AmountInput | null | undefined): Exact {
  return readExact(value ?? 0) ?? ZERO
}

/** The sum of a payment's captures, exactly. */
export function capturedAmount(payment: Pick<CollectionPayment, "captures">): Exact {
  return sum(payment.captures.map((capture) => amountOf(capture.amount)))
}

/** The sum of a payment's refunds, exactly. */
export function refundedAmount(payment: Pick<CollectionPayment, "refunds">): Exact {
  return sum(payment.refunds.map(amountOf))
}

/**
 * Whether the whole amount of the payment is captured: Medusa set `captured_at`, or the captures
 * add up to the amount (Medusa sets `captured_at` a moment after it saves the capture that
 * completes the amount; the captures say so already in between). A payment of 0 is never captured
 * by its captures alone.
 */
export function isFullyCaptured(payment: Pick<CollectionPayment, "amount" | "captured_at" | "captures">): boolean {
  if (payment.captured_at) {
    return true
  }
  const amount = amountOf(payment.amount)
  return compare(amount, ZERO) > 0 && compare(capturedAmount(payment), amount) >= 0
}

/**
 * What is still open of the payment (its amount less its captures, never below 0), exactly, as the
 * decimal string Medusa's capture takes ("1124.995" less "333.5" is "791.495").
 */
export function remainingToCapture(payment: Pick<CollectionPayment, "amount" | "captures">): string {
  const rest = sub(amountOf(payment.amount), capturedAmount(payment))
  return toDecimalString(compare(rest, ZERO) > 0 ? rest : ZERO)
}

/** The order's capture transactions against the payments' captures, when they differ. */
export type CaptureMismatch = {
  /** What the order's payment transactions say was captured. */
  order_transactions: number
  /** What the payments' own captures add up to. */
  payment_captures: number
}

/**
 * Medusa keeps a capture twice: on the payment (its captures) and on the order (a "capture"
 * transaction each). They must add up to the same figure. Two captures of one payment at the same
 * moment can leave an extra transaction on the order (a Medusa fault, QA's tenth review: 8 of 40
 * rounds), and the order then shows more paid than was captured. Null when they agree.
 */
export function captureMismatch(
  orderCaptureTransactions: readonly (AmountInput | null | undefined)[],
  payments: readonly Pick<CollectionPayment, "captures">[]
): CaptureMismatch | null {
  const transactions = sum(orderCaptureTransactions.map(amountOf))
  const captures = sum(payments.map(capturedAmount))
  if (compare(transactions, captures) === 0) {
    return null
  }
  return { order_transactions: toNumber(transactions), payment_captures: toNumber(captures) }
}

function money(currencyCode: string | null | undefined, amount: number): string {
  return `${(currencyCode ?? "").toUpperCase()} ${amount.toLocaleString("en-GB", { maximumFractionDigits: 20 })}`.trim()
}

/** The warning staff see when the order's capture transactions and the payment's captures differ. */
export function captureMismatchWarning(mismatch: CaptureMismatch, currencyCode?: string | null): string {
  return (
    `Medusa's payment figures for this order disagree: the order's payment history shows ` +
    `${money(currencyCode, mismatch.order_transactions)} captured, but the payment's captures add up ` +
    `to ${money(currencyCode, mismatch.payment_captures)}. This is a known Medusa fault when two ` +
    `captures run at the same moment. Do not refund or chase payment from the order's paid ` +
    `figure; tell the developer, with the order number.`
  )
}

// --- The state of an order ---

/**
 * Where the order is:
 * - `not_collected`: nothing is captured; recording the slip captures the whole amount.
 * - `partly_captured`: part of the amount was captured (Medusa's own payment section); recording
 *   the slip captures the rest, because the courier's slip is for the whole order.
 * - `captured_without_slip`: the whole amount is captured but no slip is recorded; recording the
 *   slip does not capture again.
 * - `recorded`: the slip reference is recorded (what happened after, a cancel or a refund, is in
 *   `order_canceled` and `refunded_amount`, and in the label).
 * - `unavailable`: none of these; `reason` says why.
 */
export type CashCollectionStage =
  | "not_collected"
  | "partly_captured"
  | "captured_without_slip"
  | "recorded"
  | "unavailable"

export type CashCollectionRefusal =
  | "not_cash_on_delivery"
  | "already_recorded"
  | "order_canceled"
  | "payment_canceled"
  | "payment_refunded"
  | "several_payments"

/**
 * What recording the slip captures first: nothing, the whole amount (Medusa's capture with no
 * amount), or what is still open (remainingToCapture).
 */
export type CaptureNeeded = "none" | "full" | "remainder"

/** The badge's colour in the admin panel. */
export type CashCollectionTone = "green" | "orange" | "red" | "grey"

/** What the admin panel shows, and whether it may be submitted. */
export type CashCollectionState = {
  /** True when the order is paid by cash on delivery; the panel is shown only then. */
  applies: boolean
  stage: CashCollectionStage
  /** True when the whole amount of the cash-on-delivery payment is captured. */
  collected: boolean
  /** True when staff may record the slip reference now. */
  can_record: boolean
  /** True when recording the slip also captures (all or the rest of) the payment. */
  capture_needed: boolean
  /** Why the slip may not be recorded now, or null. */
  reason: CashCollectionRefusal | null
  slip_reference: string | null
  collected_at: string | null
  /** The cash-on-delivery payment (null when there is none, or several). */
  payment_id: string | null
  amount: number | null
  captured_amount: number | null
  /** What is refunded of the cash-on-delivery payment (null when there is no such payment). */
  refunded_amount: number | null
  /** True when the order is canceled. */
  order_canceled: boolean
  /** Exactly what recording the slip would capture, as a decimal string, or null. */
  remaining: string | null
  /** Who captured and when, from Medusa's capture record (the latest capture). */
  captured_by: string | null
  captured_at: string | null
  /** The badge: a few words for the state, true to what happened, and its colour. */
  label: string
  tone: CashCollectionTone
  /** A sentence on what happened after the cash was recorded (a cancel, a refund), or null. */
  note: string | null
  /** The order's capture transactions against the payments' captures, when they differ. */
  capture_mismatch: CaptureMismatch | null
  /** The warning staff see for capture_mismatch, or null. */
  capture_warning: string | null
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null
}

/** The badge of a recorded collection, from what happened to the order and payment since. */
function recordedBadge(
  orderCanceled: boolean,
  captured: Exact,
  refunded: Exact,
  currencyCode: string | null | undefined
): { label: string; tone: CashCollectionTone; note: string | null } {
  const refundedSome = compare(refunded, ZERO) > 0
  const refundedAll = refundedSome && compare(refunded, captured) >= 0
  const figures = `${money(currencyCode, toNumber(refunded))} of the ${money(currencyCode, toNumber(captured))} captured is refunded.`
  if (orderCanceled) {
    if (refundedAll) {
      return {
        label: "Collected, then canceled and refunded",
        tone: "grey",
        note: `The cash was recorded as collected; the order was canceled afterwards and the payment refunded. ${figures}`,
      }
    }
    if (refundedSome) {
      return {
        label: "Collected, then canceled, partly refunded",
        tone: "red",
        note: `The cash was recorded as collected; the order was canceled afterwards. ${figures} Refund the rest in the order's Payments section if the customer is owed it.`,
      }
    }
    return {
      label: "Collected, then canceled, not refunded",
      tone: "red",
      note: "The cash was recorded as collected; the order was canceled afterwards and nothing is refunded. Refund it in the order's Payments section if the customer is owed it.",
    }
  }
  if (refundedAll) {
    return {
      label: "Collected, then refunded",
      tone: "grey",
      note: `The cash was recorded as collected and the payment was refunded afterwards. ${figures}`,
    }
  }
  if (refundedSome) {
    return {
      label: "Collected, partly refunded",
      tone: "orange",
      note: `The cash was recorded as collected; part of the payment was refunded afterwards. ${figures}`,
    }
  }
  return { label: "Collected", tone: "green", note: null }
}

const UNAVAILABLE_BADGES: Record<CashCollectionRefusal, { label: string; tone: CashCollectionTone }> = {
  not_cash_on_delivery: { label: "Not cash on delivery", tone: "grey" },
  already_recorded: { label: "Collected", tone: "green" },
  order_canceled: { label: "Canceled, not collected", tone: "grey" },
  payment_canceled: { label: "Payment canceled, not collected", tone: "grey" },
  payment_refunded: { label: "Refunded, not collected", tone: "grey" },
  several_payments: { label: "Not collected", tone: "grey" },
}

const OPEN_BADGES: Record<"not_collected" | "partly_captured" | "captured_without_slip", string> = {
  not_collected: "Not collected",
  partly_captured: "Partly captured",
  captured_without_slip: "Captured, no slip",
}

/**
 * The order's state. The checks run in this order, and the order matters (unit tests pin it):
 * 1. no cash-on-delivery payment: the panel does not apply;
 * 2. a record exists: "recorded", always shown, with what happened since (a cancel, a refund) in
 *    its label; a record is never hidden by a later cancel or refund;
 * 3. the order is canceled: nothing may be recorded;
 * 4. the cash-on-delivery payment is canceled;
 * 5. several live cash-on-delivery payments;
 * 6. the payment is (partly) refunded: a refunded payment is not collected cash;
 * 7. otherwise open: captured without slip, partly captured, or not collected.
 */
export function cashCollectionState(input: CashCollectionInput): CashCollectionState {
  const cod = input.payments.filter((p) => p.provider_id === COD_PAYMENT_PROVIDER_ID)
  const live = cod.filter((p) => !p.canceled)
  const payment = live.length === 1 ? live[0] : null
  // The payment the figures are shown for: the live one, or the only one there is (a recorded
  // collection whose payment was canceled afterwards still shows what was captured).
  const shown = payment ?? (cod.length === 1 ? cod[0] : null)
  const latestCapture = shown
    ? [...shown.captures].sort((a, b) => (a.created_at ?? "").localeCompare(b.created_at ?? "")).at(-1)
    : undefined
  const captured = shown ? capturedAmount(shown) : ZERO
  const refunded = shown ? refundedAmount(shown) : ZERO
  const slipReference = stringOrNull(input.record?.slip_reference)
  const orderCanceled = input.orderStatus === "canceled"
  // Compared only when the caller read the order's transactions (the admin route always does).
  const mismatch =
    input.orderCaptureTransactions === undefined
      ? null
      : captureMismatch(input.orderCaptureTransactions, input.payments)
  const base = {
    slip_reference: slipReference,
    collected_at: slipReference === null ? null : stringOrNull(input.record?.collected_at),
    payment_id: payment?.id ?? null,
    amount: shown ? toNumber(amountOf(shown.amount)) : null,
    captured_amount: shown ? toNumber(captured) : null,
    refunded_amount: shown ? toNumber(refunded) : null,
    order_canceled: orderCanceled,
    captured_by: latestCapture?.created_by ?? null,
    captured_at: latestCapture?.created_at ?? null,
    collected: shown ? isFullyCaptured(shown) : cod.some(isFullyCaptured),
    capture_mismatch: mismatch,
    capture_warning: mismatch ? captureMismatchWarning(mismatch, input.currencyCode) : null,
  }
  const refuse = (stage: CashCollectionStage, reason: CashCollectionRefusal, applies = true) => ({
    ...base,
    applies,
    stage,
    can_record: false,
    capture_needed: false,
    reason,
    remaining: null,
    ...UNAVAILABLE_BADGES[reason],
    note: null,
  })
  const open = (stage: keyof typeof OPEN_BADGES, open: CollectionPayment) => ({
    ...base,
    applies: true,
    stage,
    can_record: true,
    capture_needed: stage !== "captured_without_slip",
    reason: null,
    remaining: stage === "captured_without_slip" ? null : remainingToCapture(open),
    label: OPEN_BADGES[stage],
    tone: "orange" as const,
    note: null,
  })

  // 1.
  if (cod.length === 0) {
    return refuse("unavailable", "not_cash_on_delivery", false)
  }
  // 2.
  if (slipReference !== null) {
    return {
      ...refuse("recorded", "already_recorded"),
      ...recordedBadge(orderCanceled, captured, refunded, input.currencyCode),
    }
  }
  // 3.
  if (orderCanceled) {
    return refuse("unavailable", "order_canceled")
  }
  // 4.
  if (live.length === 0) {
    return refuse("unavailable", "payment_canceled")
  }
  // 5. Completing a cart makes one payment. Several mean the order was changed by hand; staff then
  // capture in Medusa's own payment section, which shows each payment.
  if (!payment) {
    return refuse("unavailable", "several_payments")
  }
  // 6.
  if (compare(refunded, ZERO) > 0) {
    return refuse("unavailable", "payment_refunded")
  }
  // 7.
  if (isFullyCaptured(payment)) {
    return open("captured_without_slip", payment)
  }
  if (compare(captured, ZERO) > 0) {
    return open("partly_captured", payment)
  }
  return open("not_collected", payment)
}

/**
 * The last check before the record is inserted, on what the database holds at that moment under
 * the order's and the payment's row locks (workflows/cash-collection/record-cash-collection.ts):
 * Medusa's cancel and refund change those rows, so each of them either finished before this check
 * (and is seen here) or waits until the record is saved (and the panel then says "Collected, then
 * canceled" or "then refunded"). Checked in the same order as cashCollectionState. Null: record it.
 */
export function recordRefusalAtInsert(input: {
  orderStatus: string | null | undefined
  paymentCanceled: boolean
  refunds: number
}): CashCollectionRefusal | null {
  if (input.orderStatus === "canceled") {
    return "order_canceled"
  }
  if (input.paymentCanceled) {
    return "payment_canceled"
  }
  if (input.refunds > 0) {
    return "payment_refunded"
  }
  return null
}

// --- The slip reference ---

export type SlipReferenceResult =
  | { ok: true; value: string }
  | { ok: false; error: string }

/** What a slip reference may hold, in words staff understand; every refusal starts with it. */
export const SLIP_REFERENCE_ALLOWED =
  `A slip reference can have letters, digits, spaces and punctuation such as - / # . ( ), ` +
  `up to ${SLIP_REFERENCE_MAX_LENGTH} characters, with at least one letter or digit.`

/**
 * A zero-width non-joiner (U+200C) between two letters of the Arabic script (Urdu, Persian), where
 * it is part of how a word is spelt (some keyboards type it): kept as typed. Marks on the first
 * letter may come between. Anywhere else it is refused like any invisible character.
 */
const ARABIC_ZWNJ_RE = /(?<=(?=\p{L})\p{Script=Arabic}\p{M}*)‌(?=(?=\p{L})\p{Script=Arabic})/gu

/**
 * Characters a slip reference may not contain. They are refused, never removed or replaced:
 * - control characters (Cc: C0 and C1, which include the tab and line breaks), the line and
 *   paragraph separators (Zl, Zp), and lone surrogates (Cs, which cannot be stored);
 * - invisible format characters (Cf), such as the right-to-left override U+202E, the zero-width
 *   space U+200B, the zero-width joiners (the non-joiner only outside Arabic-script words, see
 *   ARABIC_ZWNJ_RE) and the byte order mark;
 * - every Unicode default-ignorable code point (Default_Ignorable_Code_Point), the characters
 *   Unicode says render as nothing: besides the Cf ones above, the Hangul fillers (U+115F, U+1160,
 *   U+3164, U+FFA0, letters that show as blank), the variation selectors and the like;
 * - private-use (Co) and unassigned (Cn) code points, which have no agreed glyph.
 */
const INVISIBLE_RE = /[\p{Cf}\p{Cs}\p{Default_Ignorable_Code_Point}\p{Co}\p{Cn}]/u
const LINE_BREAK_OR_TAB_RE = /[\p{Cc}\p{Zl}\p{Zp}]/u
/**
 * "Other" symbols (So): emoji, dingbats, pictographs, box drawing, and the placeholders that show
 * as an empty box or nothing at all, such as the object replacement character U+FFFC, the Braille
 * blank U+2800 and musical null noteheads. A slip reference has no use for them. Mathematical and
 * currency symbols (+ = $ Rs) and modifier symbols stay allowed.
 */
const OTHER_SYMBOL_RE = /\p{So}/u
/**
 * A combining mark is allowed only on a letter or digit (or after another mark): Arabic and Urdu
 * vowel marks, accents (and see FOREIGN_MARK_RE).
 */
const LOOSE_MARK_RE = /(?:^|[^\p{L}\p{N}\p{M}])\p{M}/u
const LETTER_OR_DIGIT_RE = /[\p{L}\p{N}]/u
/** Visible spaces (Unicode category Zs, such as the ordinary and the no-break space). */
const SPACES_RE = /\p{Zs}+/gu

/**
 * A combining mark that belongs to one writing system (not one of the marks Unicode shares between
 * scripts, filed as "Inherited", such as the accents and the Arabic vowel marks) on a Latin letter
 * or a digit, where it has no use: the Khitan filler U+16FE4 hung on "A" or "1" shows as nothing.
 * Such a mark on a letter of another script (a Devanagari vowel sign on a Devanagari letter) stays
 * allowed.
 */
const FOREIGN_MARK_RE = /[\p{Script=Latin}\p{N}](?:\p{M})*(?=\p{M})(?!\p{Script=Inherited})(?!\p{Script=Common})\p{M}/u

function refusal(problem: string): SlipReferenceResult {
  return { ok: false, error: `${SLIP_REFERENCE_ALLOWED} ${problem}` }
}

/**
 * A valid slip reference: 1 to SLIP_REFERENCE_MAX_LENGTH characters after trimming, with at least
 * one letter or digit and none of the refused characters. Spaces at the ends are dropped and a
 * run of spaces inside becomes one, so " TCS  12345 " is kept as "TCS 12345". The format is
 * otherwise free, because each courier numbers its slips its own way (the founders' decision).
 * Characters are counted as the person sees them typed (code points, not UTF-16 units).
 */
export function readSlipReference(raw: unknown): SlipReferenceResult {
  if (typeof raw !== "string" || raw.replace(SPACES_RE, "") === "") {
    return refusal("Enter the reference from the courier's slip.")
  }
  if (LINE_BREAK_OR_TAB_RE.test(raw)) {
    return refusal(
      "This one has a line break, a tab or another control character in it. Type it on one " +
        "line, by hand, without pasting."
    )
  }
  if (INVISIBLE_RE.test(raw.replace(ARABIC_ZWNJ_RE, ""))) {
    return refusal(
      "This one has a character in it that is invisible or shows as blank (often pasted along " +
        "with the text). Type it again by hand, without pasting."
    )
  }
  if (OTHER_SYMBOL_RE.test(raw)) {
    return refusal(
      "This one has a symbol in it that is not punctuation, such as an emoji, a box or a blank " +
        "placeholder. Type it again by hand, without pasting."
    )
  }
  const value = raw.replace(SPACES_RE, " ").trim()
  if (LOOSE_MARK_RE.test(value) || FOREIGN_MARK_RE.test(value)) {
    return refusal(
      "This one has an accent or vowel mark that is not on a letter of its own writing system. " +
        "Type it again by hand, without pasting."
    )
  }
  if (!LETTER_OR_DIGIT_RE.test(value)) {
    return refusal("This one has no letter or digit.")
  }
  const length = [...value].length
  if (length > SLIP_REFERENCE_MAX_LENGTH) {
    return refusal(`This one has ${length}.`)
  }
  return { ok: true, value }
}

// --- What staff are told ---

const REFUSAL_MESSAGES: Record<CashCollectionRefusal, string> = {
  not_cash_on_delivery: "This order is not paid by cash on delivery.",
  already_recorded: "The cash for this order is already recorded as collected.",
  order_canceled: "This order is canceled, so the cash cannot be recorded as collected.",
  payment_canceled:
    "The cash-on-delivery payment of this order is canceled, so the cash cannot be recorded as collected.",
  payment_refunded:
    "The cash-on-delivery payment of this order has been refunded, so the cash cannot be recorded as collected.",
  several_payments:
    "This order has more than one open cash-on-delivery payment. Capture it in the order's payment section.",
}

export function refusalMessage(reason: CashCollectionRefusal): string {
  return REFUSAL_MESSAGES[reason]
}

export type CashCollectionDecision =
  | {
      ok: true
      /** The cleaned slip reference. */
      slipReference: string
      /** The payment, captured first unless `capture` is "none". */
      paymentId: string
      capture: CaptureNeeded
      /** For "remainder": exactly what is still open, as a decimal string. */
      amount?: string
    }
  | { ok: false; reason: CashCollectionRefusal | "invalid_reference"; message: string }

/** Whether staff may record the slip now, with this reference, and what to capture first. */
export function decideCashCollection(
  state: CashCollectionState,
  rawReference: unknown
): CashCollectionDecision {
  if (!state.can_record || state.payment_id === null) {
    const reason = state.reason ?? "not_cash_on_delivery"
    return { ok: false, reason, message: REFUSAL_MESSAGES[reason] }
  }
  const reference = readSlipReference(rawReference)
  if (!reference.ok) {
    return { ok: false, reason: "invalid_reference", message: reference.error }
  }
  if (!state.capture_needed) {
    return { ok: true, slipReference: reference.value, paymentId: state.payment_id, capture: "none" }
  }
  if (state.stage === "partly_captured" && state.remaining !== null) {
    return {
      ok: true,
      slipReference: reference.value,
      paymentId: state.payment_id,
      capture: "remainder",
      amount: state.remaining,
    }
  }
  return { ok: true, slipReference: reference.value, paymentId: state.payment_id, capture: "full" }
}

/**
 * What staff are told when the capture failed. `after` is the order's state read again after the
 * failure: when the whole amount is captured now (another press, or Medusa's own button, at the
 * same moment), that is what happened; when the order or payment was canceled or refunded at the
 * same moment, that; otherwise the payment could not be captured, and nothing was recorded. Never
 * the underlying error: it can hold SQL or internal ids, and is logged instead.
 */
export function captureFailureMessage(after: CashCollectionState): string {
  if (after.stage === "recorded" || after.stage === "captured_without_slip") {
    return (
      "The payment was captured by another request at the same moment, so this slip reference " +
      "was not recorded. Reload the order to see what is recorded."
    )
  }
  if (after.reason === "order_canceled" || after.reason === "payment_canceled" || after.reason === "payment_refunded") {
    return `${REFUSAL_MESSAGES[after.reason]} It happened at the same moment as this press; nothing was recorded.`
  }
  return (
    "The payment could not be captured. Nothing was recorded. Reload the order and try again; " +
    "if it fails again, check the Payments section of the order."
  )
}

/**
 * What staff are told when the order was canceled, or the payment canceled or refunded, between
 * the check and the record (the record is then not made).
 */
export function recordedNothingMessage(reason: CashCollectionRefusal): string {
  return (
    `${REFUSAL_MESSAGES[reason]} It changed at the same moment as this press, so the slip ` +
    "reference was not recorded. Reload the order to see what happened to the payment."
  )
}

/** What staff are told when the payment is captured but the record could not be saved. */
export const RECORD_FAILURE_MESSAGE =
  "The payment is captured, but the slip reference could not be saved. Reload the order and " +
  "enter the slip reference again; the payment will not be captured a second time."

/** What staff are told when something unexpected failed (the error itself is logged). */
export const UNEXPECTED_FAILURE_MESSAGE =
  "The cash could not be recorded because of an unexpected error. Reload the order to see " +
  "what is captured and recorded, and try again."

/** What staff are told when the state could not be read (the panel then hides itself). */
export const STATE_READ_FAILURE_MESSAGE =
  "The cash-on-delivery state of this order could not be loaded because of an unexpected " +
  "error. Reload the order."

/** What staff are told when the cash was recorded but the new state could not be read. */
export const RECORDED_BUT_NOT_SHOWN_MESSAGE =
  "The cash is recorded as collected, but the panel could not be refreshed. Reload the order " +
  "to see it."

/** What staff are told for an order that does not exist (or was deleted). */
export const ORDER_NOT_FOUND_MESSAGE = "This order was not found. It may have been deleted."
