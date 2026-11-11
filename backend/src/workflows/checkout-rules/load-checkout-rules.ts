/**
 * Medusa glue for the checkout rules: loads one cart, its region and the store's settings with
 * Query, and hands them to the plain rules in lib/rules/checkout-rules.ts. Used by the
 * `GET /store/carts/:id/checkout-rules` route, the cart-completion hook and the payment-session
 * middleware, so all three apply the same rules to the same data.
 *
 * No business rule lives here.
 */
import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, MathBN, MedusaError } from "@medusajs/framework/utils"
import {
  checkoutRefusals,
  evaluateCheckoutRules,
  type CheckoutRules,
} from "../../lib/rules/checkout-rules"
import {
  appliedDeliverySpeed,
  calendarDateIn,
  DELIVERY_TIME_ZONE,
} from "../../lib/rules/delivery-promise"

type Metadata = Record<string, unknown> | null | undefined

type CartRow = {
  id: string
  currency_code: string
  total?: unknown
  completed_at?: unknown
  region?: {
    name?: string | null
    metadata?: Metadata
    countries?: ({ iso_2?: string | null } | null)[] | null
  } | null
  items?: ({ quantity?: unknown; product?: { metadata?: Metadata } | null } | null)[] | null
}

export type LoadedCheckoutRules = {
  rules: CheckoutRules
  cart: { id: string; currencyCode: string; total: number }
}

function toNumber(value: unknown): number {
  if (value === undefined || value === null) {
    return 0
  }
  return MathBN.convert(value as number).toNumber()
}

/**
 * The checkout rules of the cart. `now` is the moment "today" is taken from (today's date in
 * Asia/Karachi is the base date of the delivery promise in M1).
 * Throws NOT_FOUND for an unknown cart, and UNEXPECTED_STATE (HTTP 500) with a readable message
 * when a setting is missing or invalid.
 */
export async function loadCheckoutRules(
  container: MedusaContainer,
  cartId: string,
  now: Date = new Date()
): Promise<LoadedCheckoutRules> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data: carts } = await query.graph({
    entity: "cart",
    fields: [
      "id",
      "currency_code",
      "total",
      "region.name",
      "region.metadata",
      "region.countries.iso_2",
      "items.quantity",
      "items.product.metadata",
    ],
    filters: { id: cartId },
  })
  const cart = (carts as unknown as CartRow[])[0]
  if (!cart) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, `Cart id not found: ${cartId}`)
  }
  if (!cart.region) {
    throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "The cart has no region.")
  }

  const { data: stores } = await query.graph({ entity: "store", fields: ["metadata"] })
  const storeSettings = (stores as unknown as { metadata?: Metadata }[])[0]?.metadata

  const total = toNumber(cart.total)
  const result = evaluateCheckoutRules({
    lines: (cart.items ?? []).flatMap((item) =>
      item
        ? [
            {
              quantity: toNumber(item.quantity),
              // Passed on as it is: the rule counts a missing or unknown kind as a garment.
              kind: item.product?.metadata?.kind,
            },
          ]
        : []
    ),
    region: {
      name: cart.region.name,
      countryCodes: (cart.region.countries ?? []).map((c) => c?.iso_2),
      metadata: cart.region.metadata,
    },
    currencyCode: cart.currency_code,
    total,
    storeSettings,
    baseDate: calendarDateIn(now, DELIVERY_TIME_ZONE),
    // The same answer the order's kept promise uses (workflows/delivery-promise/).
    deliverySpeed: appliedDeliverySpeed(),
  })
  if (!result.ok) {
    throw new MedusaError(
      MedusaError.Types.UNEXPECTED_STATE,
      `The store's checkout settings are incomplete: ${result.error}`
    )
  }
  return { rules: result.value, cart: { id: cart.id, currencyCode: cart.currency_code, total } }
}

/**
 * Throws NOT_ALLOWED (HTTP 400, Medusa's usual `type` and `message` body) when the cart breaks a
 * rule: below the minimum (only when `checkMinimum`), or cash on delivery when it is not available.
 * Returns the rules it checked.
 */
export async function assertCheckoutAllowed(
  container: MedusaContainer,
  cartId: string,
  options: { usesCashOnDelivery: boolean; checkMinimum: boolean }
): Promise<LoadedCheckoutRules> {
  const loaded = await loadCheckoutRules(container, cartId)
  const refusals = checkoutRefusals(loaded.rules, {
    ...options,
    currencyCode: loaded.cart.currencyCode,
    total: loaded.cart.total,
  })
  if (refusals.length > 0) {
    throw new MedusaError(MedusaError.Types.NOT_ALLOWED, refusals.join(" "))
  }
  return loaded
}
