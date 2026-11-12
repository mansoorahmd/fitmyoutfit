/**
 * Cash on delivery collected: when staff may record that the courier collected the cash, what a
 * valid slip reference is, and what staff are told. Plain TypeScript, no Medusa imports.
 *
 * The founders' process: the courier hands over a slip against the order number once the cash is
 * collected; staff then record it in the admin. Recording it captures what is still open of the
 * cash-on-delivery payment (through Medusa's own payment flow, in workflows/cash-collection/) and
 * then keeps the slip reference and the time as the order's cash-collection record, a row of its
 * own (modules/cash-collection), never in the order's metadata, which a signed-in customer can
 * read and Medusa's admin saves as a whole. Who captured is Medusa's own capture record.
 *
 * Capture first, then record: the capture runs to its end on its own; the record is then one
 * insert, and the database allows one record per order, so of several presses at once exactly one
 * records, on any number of server instances. A payment that is fully captured without a record
 * (Medusa's own "Capture payment" button, or a record that failed after the capture) can get its
 * record once, without a second capture.
 */
import { COD_PAYMENT_PROVIDER_ID } from "../../modules/cod/constants"

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
  /** The admin user (or API key) that captured, as Medusa recorded it. */
  created_by: string | null
  /** When, as an ISO time. */
  created_at: string | null
}

/** One payment of the order, as far as this rule needs it. */
export type CollectionPayment = {
  id: string
  provider_id: string
  /** The payment's amount, in major units. */
  amount: number
  /** The sum of its captures, in major units. */
  captured_amount: number
  /** Medusa sets `captured_at` once the whole amount is captured. */
  fully_captured: boolean
  canceled: boolean
  captures: readonly CollectionCapture[]
}

export type CashCollectionInput = {
  /** The order's status (`canceled` stops collection). */
  orderStatus?: string | null
  /** Every payment of the order. */
  payments: readonly CollectionPayment[]
  /** The order's cash-collection record, or null when none is kept. */
  record: CashCollectionRecord | null
}

/**
 * Where the order is:
 * - `not_collected`: nothing is captured; recording the slip captures the whole amount.
 * - `partly_captured`: part of the amount was captured (Medusa's own payment section); recording
 *   the slip captures the rest, because the courier's slip is for the whole order.
 * - `captured_without_slip`: the whole amount is captured but no slip is recorded; recording the
 *   slip does not capture again.
 * - `recorded`: the slip reference is recorded.
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
  | "several_payments"

/**
 * What recording the slip captures first: nothing, the whole amount (Medusa's capture with no
 * amount), or what is still open (the amount less the captures, worked out exactly by the caller).
 */
export type CaptureNeeded = "none" | "full" | "remainder"

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
  /** Who captured and when, from Medusa's capture record (the latest capture). */
  captured_by: string | null
  captured_at: string | null
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null
}

export function cashCollectionState(input: CashCollectionInput): CashCollectionState {
  const cod = input.payments.filter((p) => p.provider_id === COD_PAYMENT_PROVIDER_ID)
  const live = cod.filter((p) => !p.canceled)
  const payment = live.length === 1 ? live[0] : null
  const latestCapture = payment
    ? [...payment.captures].sort((a, b) => (a.created_at ?? "").localeCompare(b.created_at ?? "")).at(-1)
    : undefined
  const slipReference = stringOrNull(input.record?.slip_reference)
  const base = {
    slip_reference: slipReference,
    collected_at: slipReference === null ? null : stringOrNull(input.record?.collected_at),
    payment_id: payment?.id ?? null,
    amount: payment?.amount ?? null,
    captured_amount: payment?.captured_amount ?? null,
    captured_by: latestCapture?.created_by ?? null,
    captured_at: latestCapture?.created_at ?? null,
    collected: payment?.fully_captured ?? cod.some((p) => p.fully_captured),
  }
  const refuse = (stage: CashCollectionStage, reason: CashCollectionRefusal, applies = true) => ({
    ...base,
    applies,
    stage,
    can_record: false,
    capture_needed: false,
    reason,
  })
  const open = (stage: CashCollectionStage, captureNeeded: boolean) => ({
    ...base,
    applies: true,
    stage,
    can_record: true,
    capture_needed: captureNeeded,
    reason: null,
  })

  if (cod.length === 0) {
    return refuse("unavailable", "not_cash_on_delivery", false)
  }
  if (slipReference !== null) {
    return refuse("recorded", "already_recorded")
  }
  if (input.orderStatus === "canceled") {
    return refuse("unavailable", "order_canceled")
  }
  if (live.length === 0) {
    return refuse("unavailable", "payment_canceled")
  }
  // Completing a cart makes one payment. Several mean the order was changed by hand; staff then
  // capture in Medusa's own payment section, which shows each payment.
  if (!payment) {
    return refuse("unavailable", "several_payments")
  }
  if (payment.fully_captured) {
    return open("captured_without_slip", false)
  }
  if (payment.captured_amount > 0) {
    return open("partly_captured", true)
  }
  return open("not_collected", true)
}

export type SlipReferenceResult =
  | { ok: true; value: string }
  | { ok: false; error: string }

/**
 * Characters a slip reference may not contain. They are refused, never removed or replaced:
 * - control characters (Cc: C0 and C1, which include the tab and line breaks), the line and
 *   paragraph separators (Zl, Zp), and lone surrogates (Cs, which cannot be stored);
 * - invisible format characters (Cf), such as the right-to-left override U+202E, the zero-width
 *   space U+200B, the zero-width joiners and the byte order mark;
 * - every Unicode default-ignorable code point (Default_Ignorable_Code_Point), the characters
 *   Unicode says render as nothing: besides the Cf ones above, the Hangul fillers (U+115F, U+1160,
 *   U+3164, U+FFA0, letters that show as blank), the variation selectors (U+FE00 to U+FE0F and
 *   U+E0100 to U+E01EF) and the Mongolian free variation selectors, the combining grapheme joiner
 *   U+034F and the Khmer inherent vowels U+17B4 and U+17B5;
 * - the Braille pattern blank U+2800, a symbol that shows as a blank space;
 * - private-use (Co) and unassigned (Cn) code points, which have no agreed glyph.
 * Visible spaces (Zs) are allowed and tidied; combining marks are allowed after a letter, a digit
 * or another mark (Arabic and Urdu text uses them), and refused anywhere else.
 */
const FORBIDDEN_RE = /[\p{Cc}\p{Cf}\p{Cs}\p{Zl}\p{Zp}\p{Default_Ignorable_Code_Point}\u2800\p{Co}\p{Cn}]/u
/** A combining mark that does not follow a letter, a digit or another mark. */
const LOOSE_MARK_RE = /(?:^|[^\p{L}\p{N}\p{M}])\p{M}/u
const LETTER_OR_DIGIT_RE = /[\p{L}\p{N}]/u
/** Visible spaces (Unicode category Zs, such as the ordinary and the no-break space). */
const SPACES_RE = /\p{Zs}+/gu

/**
 * A valid slip reference: 1 to SLIP_REFERENCE_MAX_LENGTH characters after trimming, with at least
 * one letter or digit and none of the forbidden characters. Spaces at the ends are dropped and a
 * run of spaces inside becomes one, so " TCS  12345 " is kept as "TCS 12345". The format is
 * otherwise free, because each courier numbers its slips its own way (the founders' decision).
 */
export function readSlipReference(raw: unknown): SlipReferenceResult {
  if (typeof raw !== "string" || raw.replace(SPACES_RE, "") === "") {
    return { ok: false, error: "Enter the slip reference from the courier's slip." }
  }
  if (FORBIDDEN_RE.test(raw)) {
    return {
      ok: false,
      error:
        "The slip reference contains a line break, a tab, or a character that is invisible or " +
        "shows as blank. Type it again by hand, without pasting.",
    }
  }
  const value = raw.replace(SPACES_RE, " ").trim()
  if (LOOSE_MARK_RE.test(value)) {
    return {
      ok: false,
      error:
        "The slip reference has an accent or vowel mark that is not on a letter. Type it again " +
        "by hand, without pasting.",
    }
  }
  if (!LETTER_OR_DIGIT_RE.test(value)) {
    return { ok: false, error: "The slip reference must contain a letter or a digit." }
  }
  if ([...value].length > SLIP_REFERENCE_MAX_LENGTH) {
    return {
      ok: false,
      error: `The slip reference must be at most ${SLIP_REFERENCE_MAX_LENGTH} characters.`,
    }
  }
  return { ok: true, value }
}

const REFUSAL_MESSAGES: Record<CashCollectionRefusal, string> = {
  not_cash_on_delivery: "This order is not paid by cash on delivery.",
  already_recorded: "The cash for this order is already recorded as collected.",
  order_canceled: "This order is canceled.",
  payment_canceled: "The cash-on-delivery payment of this order is canceled.",
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
  return {
    ok: true,
    slipReference: reference.value,
    paymentId: state.payment_id,
    capture: !state.capture_needed ? "none" : state.stage === "partly_captured" ? "remainder" : "full",
  }
}

/**
 * What staff are told when the capture failed. `after` is the order's state read again after the
 * failure: when the whole amount is captured now (another press, or Medusa's own button, at the
 * same moment), that is what happened; otherwise the payment could not be captured, and nothing
 * was recorded. Never the underlying error: it can hold SQL or internal ids, and is logged instead.
 */
export function captureFailureMessage(after: CashCollectionState): string {
  if (after.stage === "recorded" || after.stage === "captured_without_slip") {
    return (
      "The payment was captured by another request at the same moment, so this slip reference " +
      "was not recorded. Reload the order to see what is recorded."
    )
  }
  return (
    "The payment could not be captured. Nothing was recorded. Reload the order and try again; " +
    "if it fails again, check the Payments section of the order."
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
