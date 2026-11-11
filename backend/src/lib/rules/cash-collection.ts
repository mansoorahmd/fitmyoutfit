/**
 * Cash on delivery collected: when staff may record that the courier collected the cash, what a
 * valid slip reference is, and what is kept on the order. Plain TypeScript, no Medusa imports.
 *
 * The founders' process: the courier hands over a slip against the order number once the cash is
 * collected; staff then record it in the admin. Recording it captures the cash-on-delivery payment
 * (through Medusa's own payment flow, in workflows/cash-collection/) and keeps the slip reference,
 * who recorded it and when in the order's metadata.
 */
import { COD_PAYMENT_PROVIDER_ID } from "../../modules/cod/constants"

/** Order metadata keys. `cod_slip_reference` is named by docs/contracts/m1-checkout.md, section 8. */
export const COD_SLIP_REFERENCE_KEY = "cod_slip_reference"
export const COD_COLLECTED_AT_KEY = "cod_collected_at"
export const COD_COLLECTED_BY_KEY = "cod_collected_by"

/** Longest slip reference kept. Courier slip and consignment numbers are far shorter. */
export const SLIP_REFERENCE_MAX_LENGTH = 64

type Metadata = Readonly<Record<string, unknown>> | null | undefined

/** One payment of the order, as far as this rule needs it. */
export type CollectionPayment = {
  id: string
  provider_id: string
  captured: boolean
  canceled: boolean
}

export type CashCollectionInput = {
  /** The order's status (`canceled` stops collection). */
  orderStatus?: string | null
  /** Every payment of the order. */
  payments: readonly CollectionPayment[]
  /** The order's metadata. */
  metadata: Metadata
}

export type CashCollectionRefusal =
  | "not_cash_on_delivery"
  | "already_collected"
  | "order_canceled"
  | "payment_canceled"
  | "several_payments"

/** What the admin panel shows, and whether it may be submitted. */
export type CashCollectionState = {
  /** True when the order is paid by cash on delivery; the panel is shown only then. */
  applies: boolean
  /** True once the cash-on-delivery payment is captured or a slip reference is recorded. */
  collected: boolean
  /** True when staff may record the cash as collected now. */
  can_collect: boolean
  /** Why it may not, or null. */
  reason: CashCollectionRefusal | null
  slip_reference: string | null
  collected_at: string | null
  collected_by: string | null
  /** The cash-on-delivery payment to capture when the cash is recorded as collected. */
  payment_id: string | null
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null
}

export function cashCollectionState(input: CashCollectionInput): CashCollectionState {
  const cod = input.payments.filter((p) => p.provider_id === COD_PAYMENT_PROVIDER_ID)
  const recorded = {
    slip_reference: stringOrNull(input.metadata?.[COD_SLIP_REFERENCE_KEY]),
    collected_at: stringOrNull(input.metadata?.[COD_COLLECTED_AT_KEY]),
    collected_by: stringOrNull(input.metadata?.[COD_COLLECTED_BY_KEY]),
  }
  const base = { ...recorded, payment_id: null }

  if (cod.length === 0) {
    return { ...base, applies: false, collected: false, can_collect: false, reason: "not_cash_on_delivery" }
  }
  const open = cod.filter((p) => !p.captured && !p.canceled)
  // Captured in Medusa's own admin, or recorded by us: either way the cash is in.
  const collected = recorded.slip_reference !== null || cod.some((p) => p.captured)
  if (collected) {
    return { ...base, applies: true, collected: true, can_collect: false, reason: "already_collected" }
  }
  if (input.orderStatus === "canceled") {
    return { ...base, applies: true, collected: false, can_collect: false, reason: "order_canceled" }
  }
  if (open.length === 0) {
    return { ...base, applies: true, collected: false, can_collect: false, reason: "payment_canceled" }
  }
  // Completing a cart makes one payment. Several open ones mean the order was changed by hand;
  // staff then capture in Medusa's own payment section, which shows each payment.
  if (open.length > 1) {
    return { ...base, applies: true, collected: false, can_collect: false, reason: "several_payments" }
  }
  return {
    ...base,
    applies: true,
    collected: false,
    can_collect: true,
    reason: null,
    payment_id: open[0].id,
  }
}

export type SlipReferenceResult =
  | { ok: true; value: string }
  | { ok: false; error: string }

/** Control characters (C0, DEL, C1) and line or paragraph separators. */
const CONTROL_RE = /[\p{Cc}\p{Zl}\p{Zp}]/u
const LETTER_OR_DIGIT_RE = /[\p{L}\p{N}]/u

/**
 * A valid slip reference: text with at least one letter or digit, no control characters, at most
 * SLIP_REFERENCE_MAX_LENGTH characters. Spaces at the ends are dropped and runs of spaces inside
 * become one, so " TCS  12345 " is kept as "TCS 12345". The format is otherwise free, because
 * each courier numbers its slips its own way.
 */
export function readSlipReference(raw: unknown): SlipReferenceResult {
  if (typeof raw !== "string" || raw.trim() === "") {
    return { ok: false, error: "Enter the slip reference from the courier's slip." }
  }
  if (CONTROL_RE.test(raw.replace(/[\t\r\n]/g, " "))) {
    return { ok: false, error: "The slip reference contains characters that cannot be stored." }
  }
  const value = raw.replace(/\s+/gu, " ").trim()
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
  already_collected: "The cash for this order is already recorded as collected.",
  order_canceled: "This order is canceled.",
  payment_canceled: "The cash-on-delivery payment of this order is canceled.",
  several_payments:
    "This order has more than one open cash-on-delivery payment. Capture it in the order's payment section.",
}

export type CashCollectionDecision =
  | {
      ok: true
      /** The cleaned slip reference. */
      slipReference: string
      /** The payment to capture. */
      paymentId: string
    }
  | { ok: false; reason: CashCollectionRefusal | "invalid_reference"; message: string }

/** Whether staff may record the cash as collected now, with this slip reference. */
export function decideCashCollection(
  state: CashCollectionState,
  rawReference: unknown
): CashCollectionDecision {
  if (!state.can_collect || state.payment_id === null) {
    const reason = state.reason ?? "not_cash_on_delivery"
    return { ok: false, reason, message: REFUSAL_MESSAGES[reason] }
  }
  const reference = readSlipReference(rawReference)
  if (!reference.ok) {
    return { ok: false, reason: "invalid_reference", message: reference.error }
  }
  return { ok: true, slipReference: reference.value, paymentId: state.payment_id }
}

/** The keys written into the order's metadata when the cash is recorded as collected. */
export function cashCollectedMetadata(record: {
  slipReference: string
  collectedAt: Date
  collectedBy: string
}): Record<string, string> {
  return {
    [COD_SLIP_REFERENCE_KEY]: record.slipReference,
    [COD_COLLECTED_AT_KEY]: record.collectedAt.toISOString(),
    [COD_COLLECTED_BY_KEY]: record.collectedBy,
  }
}
