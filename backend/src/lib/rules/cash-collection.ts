/**
 * Cash on delivery collected: when staff may record that the courier collected the cash, what a
 * valid slip reference is, and what is kept on the order. Plain TypeScript, no Medusa imports.
 *
 * The founders' process: the courier hands over a slip against the order number once the cash is
 * collected; staff then record it in the admin. Recording it captures the cash-on-delivery payment
 * (through Medusa's own payment flow, in workflows/cash-collection/) and then keeps the slip
 * reference and the time in the order's metadata. Who captured is Medusa's own capture record;
 * it is not copied into the metadata, which a signed-in customer can read.
 *
 * Capture first, then write: Medusa refuses a second capture of the same payment, so of several
 * presses at once exactly one captures, and only that one writes the reference. A payment that is
 * fully captured without a reference (Medusa's own "Capture payment" button, or a write that
 * failed after the capture) can get its reference recorded once, without a second capture.
 */
import { COD_PAYMENT_PROVIDER_ID } from "../../modules/cod/constants"

/** Order metadata keys. `cod_slip_reference` is named by docs/contracts/m1-checkout.md, section 8. */
export const COD_SLIP_REFERENCE_KEY = "cod_slip_reference"
export const COD_COLLECTED_AT_KEY = "cod_collected_at"

/** Longest slip reference kept. Courier slip and consignment numbers are far shorter. */
export const SLIP_REFERENCE_MAX_LENGTH = 64

type Metadata = Readonly<Record<string, unknown>> | null | undefined

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
  /** The order's metadata. */
  metadata: Metadata
}

/**
 * Where the order is:
 * - `not_collected`: the payment is open; recording the slip captures it.
 * - `partly_captured`: part of the amount was captured (Medusa's own button); the rest must be
 *   captured there before a slip can be recorded.
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
  | "partly_captured"
  | "order_canceled"
  | "payment_canceled"
  | "several_payments"

/** What the admin panel shows, and whether it may be submitted. */
export type CashCollectionState = {
  /** True when the order is paid by cash on delivery; the panel is shown only then. */
  applies: boolean
  stage: CashCollectionStage
  /** True when the whole amount of the cash-on-delivery payment is captured. */
  collected: boolean
  /** True when staff may record the slip reference now. */
  can_record: boolean
  /** True when recording the slip also captures the payment. */
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

/** The slip reference recorded on an order, or null. */
export function recordedSlipReference(metadata: Metadata): string | null {
  return stringOrNull(metadata?.[COD_SLIP_REFERENCE_KEY])
}

export function cashCollectionState(input: CashCollectionInput): CashCollectionState {
  const cod = input.payments.filter((p) => p.provider_id === COD_PAYMENT_PROVIDER_ID)
  const live = cod.filter((p) => !p.canceled)
  const payment = live.length === 1 ? live[0] : null
  const latestCapture = payment
    ? [...payment.captures].sort((a, b) => (a.created_at ?? "").localeCompare(b.created_at ?? "")).at(-1)
    : undefined
  const base = {
    slip_reference: recordedSlipReference(input.metadata),
    collected_at: stringOrNull(input.metadata?.[COD_COLLECTED_AT_KEY]),
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

  if (cod.length === 0) {
    return refuse("unavailable", "not_cash_on_delivery", false)
  }
  if (base.slip_reference !== null) {
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
    return { ...base, applies: true, stage: "captured_without_slip", can_record: true, capture_needed: false, reason: null }
  }
  if (payment.captured_amount > 0) {
    return refuse("partly_captured", "partly_captured")
  }
  return { ...base, applies: true, stage: "not_collected", can_record: true, capture_needed: true, reason: null }
}

export type SlipReferenceResult =
  | { ok: true; value: string }
  | { ok: false; error: string }

/**
 * Characters a slip reference may not contain: control characters (C0 and C1, which include the
 * tab and line breaks), invisible format characters (Unicode category Cf, such as the
 * right-to-left override U+202E and the zero-width space U+200B), lone surrogates (they cannot be
 * stored), and the line and paragraph separators. They are refused, never removed or replaced.
 */
const FORBIDDEN_RE = /[\p{Cc}\p{Cf}\p{Cs}\p{Zl}\p{Zp}]/u
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
        "The slip reference contains a line break, a tab, or an invisible or control character. " +
        "Type it again by hand, without pasting.",
    }
  }
  const value = raw.replace(SPACES_RE, " ").trim()
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
  partly_captured:
    "Only part of this payment is captured. Capture the rest in the order's Payments section " +
    "(Capture payment), then record the slip reference here.",
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
      /** The payment, captured first when `captureNeeded`. */
      paymentId: string
      captureNeeded: boolean
    }
  | { ok: false; reason: CashCollectionRefusal | "invalid_reference"; message: string }

/** Whether staff may record the slip now, with this reference, and whether to capture first. */
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
    captureNeeded: state.capture_needed,
  }
}

/**
 * What staff are told when the capture failed. `after` is the order's state read again after the
 * failure: when another press captured the payment at the same moment, that is what happened;
 * otherwise the payment could not be captured, and nothing was recorded.
 */
export function captureFailureMessage(after: CashCollectionState, cause: string): string {
  if (after.stage === "recorded" || after.stage === "captured_without_slip") {
    return (
      "The payment was captured by another request at the same moment, so this slip reference " +
      "was not recorded. Reload the order to see what is recorded."
    )
  }
  const detail = cause.trim() === "" ? "" : ` (${cause.trim().replace(/\.$/, "")})`
  return (
    `The payment could not be captured${detail}. Nothing was recorded. Reload the order and ` +
    "try again; if it fails again, check the Payments section of the order."
  )
}

/** The keys written into the order's metadata when the slip reference is recorded. */
export function cashCollectedMetadata(record: {
  slipReference: string
  collectedAt: Date
}): Record<string, string> {
  return {
    [COD_SLIP_REFERENCE_KEY]: record.slipReference,
    [COD_COLLECTED_AT_KEY]: record.collectedAt.toISOString(),
  }
}
