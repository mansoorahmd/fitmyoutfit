/**
 * What placing an order keeps in the order's metadata, and the check that it is right. Plain
 * TypeScript, no Medusa imports.
 *
 * Medusa builds the order from the cart and copies the cart's `metadata` into the order's
 * `metadata` in the same step that creates the order. So the promised delivery date is written
 * into the cart's metadata just before completion (api/middlewares.ts), and the completion hook
 * (workflows/hooks/complete-cart-checkout-rules.ts) checks the cart it completes before the order
 * is created: an order can then not be created without its promise, or with a wrong one.
 *
 * A customer can write a cart's metadata through the store API, and everything in it reaches the
 * order. The keys staff write on an order (cash on delivery collected) must therefore never come
 * from the cart: they are emptied before completion and refused at completion.
 */
import {
  COD_COLLECTED_AT_KEY,
  COD_COLLECTED_BY_KEY,
  COD_SLIP_REFERENCE_KEY,
} from "./cash-collection"
import {
  addCalendarDays,
  DELIVERY_SPEEDS,
  promisedDelivery,
  type DeliveryPromise,
  type DeliverySpeed,
  type PromisedDelivery,
} from "./delivery-promise"

type Metadata = Readonly<Record<string, unknown>> | null | undefined

/** Key of the promised delivery in the order's (and, just before completion, the cart's) metadata. */
export const DELIVERY_PROMISE_KEY = "delivery_promise"

/** Order metadata keys that only staff write, never the cart. */
export const STAFF_ONLY_ORDER_KEYS: readonly string[] = [
  COD_SLIP_REFERENCE_KEY,
  COD_COLLECTED_AT_KEY,
  COD_COLLECTED_BY_KEY,
]

function isSet(value: unknown): boolean {
  return value !== undefined && value !== null && value !== ""
}

/**
 * The keys to write into the cart's metadata just before it is completed: the promised delivery
 * for this moment, and every staff-only key the cart has set to null (Medusa merges metadata on
 * update, so a key cannot be removed, only emptied).
 */
export function completionMetadataPatch(
  cartMetadata: Metadata,
  promise: DeliveryPromise
): Record<string, unknown> {
  const patch: Record<string, unknown> = { [DELIVERY_PROMISE_KEY]: promisedDelivery(promise) }
  for (const key of STAFF_ONLY_ORDER_KEYS) {
    if (cartMetadata && key in cartMetadata && cartMetadata[key] !== null) {
      patch[key] = null
    }
  }
  return patch
}

export type CompletionMetadataCheck = { ok: true } | { ok: false; error: string }

/** The promised delivery kept in metadata, or null when it is missing or malformed. */
export function readPromisedDelivery(value: unknown): PromisedDelivery | null {
  if (typeof value !== "object" || value === null) {
    return null
  }
  const kept = value as Record<string, unknown>
  if (
    typeof kept.date !== "string" ||
    typeof kept.based_on !== "string" ||
    typeof kept.days !== "number" ||
    !DELIVERY_SPEEDS.includes(kept.applies as DeliverySpeed)
  ) {
    return null
  }
  return {
    date: kept.date,
    days: kept.days,
    based_on: kept.based_on,
    applies: kept.applies as DeliverySpeed,
  }
}

/**
 * Whether the cart about to become an order carries the right promise and no staff-only key.
 * `current` is the promise worked out at completion. The kept promise must be the same rule's
 * answer: the same option and days, its date its base date plus its days, and its base date today
 * or, when completion crosses midnight in Asia/Karachi, yesterday.
 */
export function checkCompletionMetadata(
  cartMetadata: Metadata,
  current: DeliveryPromise
): CompletionMetadataCheck {
  const staffKeys = STAFF_ONLY_ORDER_KEYS.filter((key) => isSet(cartMetadata?.[key]))
  if (staffKeys.length > 0) {
    return { ok: false, error: `The cart must not carry ${staffKeys.join(", ")}.` }
  }
  const kept = readPromisedDelivery(cartMetadata?.[DELIVERY_PROMISE_KEY])
  if (!kept) {
    return { ok: false, error: "The cart carries no promised delivery date." }
  }
  const option = current[kept.applies]
  let consistent = false
  try {
    consistent =
      kept.applies === current.applies &&
      kept.days === option.days &&
      kept.date === addCalendarDays(kept.based_on, kept.days) &&
      (kept.based_on === current.based_on ||
        kept.based_on === addCalendarDays(current.based_on, -1))
  } catch {
    consistent = false
  }
  if (!consistent) {
    return {
      ok: false,
      error: "The cart's promised delivery date does not match the delivery rule.",
    }
  }
  return { ok: true }
}
