/**
 * The checkout rules of one cart, put together: minimum quantity, cash on delivery and the
 * delivery promise. Plain TypeScript, no Medusa imports. The Medusa code (the
 * `GET /store/carts/:id/checkout-rules` route, the cart-completion hook and the payment-session
 * check) only loads the cart and settings, calls these functions and passes the result on.
 *
 * The result has exactly the shape of the route's JSON (docs/contracts/m1-checkout.md, section 6).
 */
import { COD_LIMIT_CURRENCY_CODE, readCodMaxTotal } from "../settings/cod-max-total"
import { readDeliveryDays } from "../settings/delivery-days"
import { readMinGarmentQuantity } from "../settings/min-garment-quantity"
import type { SettingResult } from "../settings/read-number-setting"
import {
  checkCashOnDelivery,
  type CashOnDeliveryReason,
} from "./cash-on-delivery"
import { deliveryPromise, type DeliveryPromise, type DeliverySpeed } from "./delivery-promise"
import { checkMinimumQuantity, type MinimumQuantityResult, type QuantityLine } from "./minimum-quantity"

type Metadata = Readonly<Record<string, unknown>> | null | undefined

export type CheckoutRulesInput = {
  lines: readonly QuantityLine[]
  region: {
    name?: string | null
    countryCodes: readonly (string | null | undefined)[]
    metadata: Metadata
  }
  /** The cart's currency code. */
  currencyCode: string
  /** The cart total, in major units of the cart's currency. */
  total: number
  /** The Store's metadata (cod_max_total, delivery_days_standard, delivery_days_rush). */
  storeSettings: Metadata
  /** Base date of the delivery promise, YYYY-MM-DD. */
  baseDate: string
  /**
   * Which delivery date applies: "rush" when the cart pays for rush. The caller answers it; until
   * the rush charge exists (a later M1 task) the answer is always "standard".
   */
  deliverySpeed: DeliverySpeed
}

export type CheckoutRules = {
  minimum_quantity: MinimumQuantityResult
  cash_on_delivery: {
    available: boolean
    reason: CashOnDeliveryReason | null
    limit: number
    limit_currency_code: string
  }
  delivery_promise: DeliveryPromise
}

/**
 * The rules for one cart, or one readable error naming every missing or invalid setting (the
 * store cannot say what the rules are without them).
 */
export function evaluateCheckoutRules(input: CheckoutRulesInput): SettingResult<CheckoutRules> {
  const minimum = readMinGarmentQuantity(input.region.metadata, input.region.name)
  const limit = readCodMaxTotal(input.storeSettings)
  const days = readDeliveryDays(input.storeSettings)
  if (!minimum.ok || !limit.ok || !days.ok) {
    const errors = [minimum, limit, days].flatMap((r) => (r.ok ? [] : [r.error]))
    return { ok: false, error: errors.join(" ") }
  }

  const cod = checkCashOnDelivery({
    regionCountryCodes: input.region.countryCodes,
    currencyCode: input.currencyCode,
    total: input.total,
    limit: limit.value,
    limitCurrencyCode: COD_LIMIT_CURRENCY_CODE,
  })
  return {
    ok: true,
    value: {
      minimum_quantity: checkMinimumQuantity(input.lines, minimum.value),
      cash_on_delivery: {
        available: cod.available,
        reason: cod.reason,
        limit: limit.value,
        limit_currency_code: COD_LIMIT_CURRENCY_CODE,
      },
      delivery_promise: deliveryPromise(input.baseDate, days.value, input.deliverySpeed),
    },
  }
}

/**
 * Why the cart may not be completed (or may not use cash on delivery), as readable sentences.
 * Empty when it may. `usesCashOnDelivery`: the cart pays, or is about to pay, by cash on delivery.
 * `checkMinimum`: false when only the payment method is being chosen, so a customer can pick cash
 * on delivery before the cart reaches the minimum; completion checks both.
 */
export function checkoutRefusals(
  rules: CheckoutRules,
  options: { usesCashOnDelivery: boolean; checkMinimum: boolean; currencyCode?: string; total?: number }
): string[] {
  const refusals: string[] = []
  const minimum = rules.minimum_quantity
  if (options.checkMinimum && !minimum.ok) {
    refusals.push(
      `The minimum order in this region is ${minimum.required} garment pieces; this cart has ${minimum.counted}.`
    )
  }
  const cod = rules.cash_on_delivery
  if (options.usesCashOnDelivery && !cod.available) {
    if (cod.reason === "over_limit") {
      const total =
        options.total !== undefined && options.currencyCode
          ? ` This cart's total is ${options.total} ${options.currencyCode.toUpperCase()}.`
          : ""
      refusals.push(
        `Cash on delivery is available up to ${cod.limit} ${cod.limit_currency_code.toUpperCase()}.${total}`
      )
    } else {
      refusals.push("Cash on delivery is available in Pakistan only.")
    }
  }
  return refusals
}
