/**
 * Cash on delivery: in Pakistan only, and only up to a cart total limit. Plain TypeScript, no
 * Medusa imports.
 *
 * The limit is a store setting (`cod_max_total`, in PKR, read by lib/settings/cod-max-total.ts).
 * "Pakistan" is the founders' decision (CLAUDE.md), so it is a rule here, not data: a region is
 * Pakistan when one of its countries is `pk`.
 */

/** ISO 3166-1 alpha-2 code of the only country with cash on delivery. */
export const CASH_ON_DELIVERY_COUNTRY_CODE = "pk"

/** Why cash on delivery is not available: not Pakistan, or the total is above the limit. */
export type CashOnDeliveryReason = "region" | "over_limit"

export type CashOnDeliveryInput = {
  /** Country codes of the cart's region. */
  regionCountryCodes: readonly (string | null | undefined)[]
  /** The cart's currency. */
  currencyCode: string
  /** The cart total, in major units of the cart's currency. */
  total: number
  /** The limit, in major units of `limitCurrencyCode`. */
  limit: number
  limitCurrencyCode: string
}

export type CashOnDeliveryResult = {
  available: boolean
  reason: CashOnDeliveryReason | null
}

export function isCashOnDeliveryRegion(countryCodes: CashOnDeliveryInput["regionCountryCodes"]) {
  return countryCodes.some((code) => code?.toLowerCase() === CASH_ON_DELIVERY_COUNTRY_CODE)
}

/**
 * Available when the region is Pakistan and the cart total is at or below the limit.
 * A cart in another currency than the limit's cannot be compared with it, so it counts as the
 * wrong region too (a Pakistan cart is in PKR unless created otherwise on purpose).
 */
export function checkCashOnDelivery(input: CashOnDeliveryInput): CashOnDeliveryResult {
  const sameCurrency =
    input.currencyCode.toLowerCase() === input.limitCurrencyCode.toLowerCase()
  if (!isCashOnDeliveryRegion(input.regionCountryCodes) || !sameCurrency) {
    return { available: false, reason: "region" }
  }
  if (!(input.total <= input.limit)) {
    return { available: false, reason: "over_limit" }
  }
  return { available: true, reason: null }
}
