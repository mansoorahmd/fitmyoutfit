// Everything the cart page shows (docs/design/05-m1-pages.md, section 4),
// worked out from the cart, the backend's rules (null when they didn't
// load) and the region's shipping options. Plain data in and out.

import { HttpTypes } from "@medusajs/types"

import {
  CartLineView,
  DeliveryRow,
  cartLineView,
  cartShowsTaxNote,
  checkoutHref,
  deliveryRow,
  isExportRegion,
  money,
  newestFirst,
  pieceCount,
} from "./cart-view"
import {
  CheckoutRules,
  MinimumView,
  codLimitNote,
  minimumView,
  promisedDate,
} from "./checkout-rules"
import { maxQuantityFor } from "./quantity"

type ShippingOptionLike = { name?: string | null; data?: Record<string, unknown> | null }

export type CartPageView = {
  lines: CartLineView[]
  pieces: number
  /** Formatted amounts. */
  itemSubtotal: string
  total: string
  delivery: DeliveryRow | null
  /** Formatted, when the delivery row has an amount. */
  deliveryAmount?: string
  showTaxNote: boolean
  /** "YYYY-MM-DD" from the rules, or null. */
  deliveryDate: string | null
  /** Formatted cash on delivery limit, when the cart is over it (Pakistan). */
  codLimit: string | null
  minimum: MinimumView | null
  /** The rules didn't load: the date and the minimum are left out. */
  rulesFailed: boolean
  exportRegion: boolean
  checkoutHref: string
  isGuest: boolean
}

export const cartPageView = ({
  cart,
  rules,
  shippingOptions,
  countryCode,
  isGuest,
}: {
  cart: HttpTypes.StoreCart
  rules: CheckoutRules | null
  shippingOptions: ShippingOptionLike[] | null
  countryCode: string
  isGuest: boolean
}): CartPageView => {
  const currency = cart.currency_code
  const delivery = deliveryRow({
    shippingMethods: cart.shipping_methods as ShippingOptionLike[] | null | undefined,
    shippingSubtotal: cart.shipping_subtotal,
    shippingOptions,
    rulesSayDdp: rules?.shipping?.ddp === true,
  })

  return {
    lines: newestFirst(cart.items).map((item) =>
      cartLineView(item, currency, maxQuantityFor(item.variant))
    ),
    pieces: pieceCount(cart.items),
    itemSubtotal: money(cart.item_subtotal, currency),
    total: money(cart.total, currency),
    delivery,
    deliveryAmount:
      delivery?.kind === "amount" ? money(delivery.amount, currency) : undefined,
    showTaxNote: cartShowsTaxNote(cart),
    deliveryDate: promisedDate(rules),
    codLimit: codLimitNote(rules),
    minimum: rules ? minimumView(rules) : null,
    rulesFailed: rules === null,
    exportRegion: isExportRegion(countryCode),
    checkoutHref: checkoutHref(cart),
    isGuest,
  }
}
