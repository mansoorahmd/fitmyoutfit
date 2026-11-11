// The backend's checkout rules for a cart (docs/contracts/m1-checkout.md,
// section 6: GET /store/carts/:id/checkout-rules), read into plain views for
// the cart, the cart panel and the product page. The backend decides; this
// only reads what it said. Nothing here makes up a rule: when the rules are
// missing, every view is null and the page leaves the piece out.

import { convertToLocale } from "./money"

export type MinimumQuantity = {
  required: number
  counted: number
  ok: boolean
}

export type CashOnDelivery = {
  available: boolean
  reason: "region" | "over_limit" | null
  /** Whole currency units, like Medusa v2 prices (20000 = PKR 20,000). */
  limit: number
  limit_currency_code: string
}

export type DeliveryDate = { days: number; date: string }

export type DeliveryPromise = {
  based_on: string
  standard: DeliveryDate
  rush?: DeliveryDate | null
  /** Contract section 8: which date applies. Always "standard" until rush exists. */
  applies?: "standard" | "rush"
}

export type CheckoutRules = {
  minimum_quantity: MinimumQuantity | null
  cash_on_delivery: CashOnDelivery | null
  delivery_promise: DeliveryPromise | null
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const isCount = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= 0

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

const readMinimum = (value: unknown): MinimumQuantity | null => {
  if (
    !isObject(value) ||
    !isCount(value.required) ||
    !isCount(value.counted) ||
    typeof value.ok !== "boolean"
  ) {
    return null
  }
  return { required: value.required, counted: value.counted, ok: value.ok }
}

const readCod = (value: unknown): CashOnDelivery | null => {
  if (
    !isObject(value) ||
    typeof value.available !== "boolean" ||
    typeof value.limit !== "number" ||
    typeof value.limit_currency_code !== "string"
  ) {
    return null
  }
  const reason =
    value.reason === "region" || value.reason === "over_limit"
      ? value.reason
      : null
  return {
    available: value.available,
    reason,
    limit: value.limit,
    limit_currency_code: value.limit_currency_code,
  }
}

const readDate = (value: unknown): DeliveryDate | null =>
  isObject(value) &&
  isCount(value.days) &&
  typeof value.date === "string" &&
  ISO_DATE.test(value.date)
    ? { days: value.days, date: value.date }
    : null

const readPromise = (value: unknown): DeliveryPromise | null => {
  if (!isObject(value)) {
    return null
  }
  const standard = readDate(value.standard)
  if (!standard) {
    return null
  }
  return {
    based_on: typeof value.based_on === "string" ? value.based_on : "",
    standard,
    rush: readDate(value.rush),
    applies: value.applies === "rush" ? "rush" : "standard",
  }
}

/**
 * The route's JSON as CheckoutRules, or null when it is not an object.
 * Each part is read on its own: a malformed part is null (left out of the
 * page), and the others still show.
 */
export const parseCheckoutRules = (json: unknown): CheckoutRules | null => {
  if (!isObject(json)) {
    return null
  }
  return {
    minimum_quantity: readMinimum(json.minimum_quantity),
    cash_on_delivery: readCod(json.cash_on_delivery),
    delivery_promise: readPromise(json.delivery_promise),
  }
}

/** The minimum, for MinimumProgress. */
export type MinimumView = {
  required: number
  counted: number
  /** required − counted, never below 0. */
  missing: number
  reached: boolean
  /** The bar's fill, 0 to 1. */
  fraction: number
}

/**
 * What the minimum UI shows (05, section 5): null when nothing shows. It
 * shows only when the rule is real (`required` above 1, so never in
 * Pakistan) and the cart holds at least one garment piece (a cart with only
 * a fit kit shows nothing).
 */
export const minimumView = (
  rules: Pick<CheckoutRules, "minimum_quantity"> | null | undefined
): MinimumView | null => {
  const minimum = rules?.minimum_quantity
  if (!minimum || minimum.required <= 1 || minimum.counted < 1) {
    return null
  }
  const reached = minimum.ok && minimum.counted >= minimum.required
  return {
    required: minimum.required,
    counted: minimum.counted,
    missing: Math.max(0, minimum.required - minimum.counted),
    reached,
    fraction: Math.min(minimum.counted / minimum.required, 1),
  }
}

/** True when the backend will refuse checkout for the minimum. */
export const blocksCheckout = (minimum: MinimumView | null): boolean =>
  !!minimum && !minimum.reached

/**
 * The date the cart promises, as "YYYY-MM-DD": the standard date, or the
 * rush date when the backend says rush applies. Null when missing, and the
 * line is then left out, never guessed.
 */
export const promisedDate = (
  rules: Pick<CheckoutRules, "delivery_promise"> | null | undefined
): string | null => {
  const promise = rules?.delivery_promise
  if (!promise) {
    return null
  }
  if (promise.applies === "rush" && promise.rush) {
    return promise.rush.date
  }
  return promise.standard.date
}

/**
 * The cash on delivery limit to show in the cart, formatted ("PKR 20,000"),
 * or null. Only when the backend says the cart is over the limit; nothing
 * when it is available, and nothing outside Pakistan (`reason: "region"`).
 */
export const codLimitNote = (
  rules: Pick<CheckoutRules, "cash_on_delivery"> | null | undefined
): string | null => {
  const cod = rules?.cash_on_delivery
  if (!cod || cod.available || cod.reason !== "over_limit") {
    return null
  }
  return convertToLocale({
    amount: cod.limit,
    currency_code: cod.limit_currency_code,
  })
}

/**
 * A minimum the product page can show before there is a cart: the region's
 * `min_garment_quantity` (contract section 1). Null when it is missing or 1.
 */
export const regionMinimum = (
  region: { metadata?: Record<string, unknown> | null } | null | undefined
): number | null => {
  const value = Number(region?.metadata?.min_garment_quantity)
  return Number.isInteger(value) && value > 1 ? value : null
}
