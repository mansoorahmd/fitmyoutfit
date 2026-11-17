// Everything the cart page shows (docs/design/05-m1-pages.md, section 4),
// worked out from the cart, the backend's rules (null when they didn't
// load) and the region's shipping options. Plain data in and out.

import { HttpTypes } from "@medusajs/types"

import {
  CartLineView,
  DeliveryRow,
  ShippingMethodLike,
  ShippingOptionLike,
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
import {
  RushControlView,
  codHintMentionsRush,
  rushControlView,
  summaryAmounts,
  withoutRush,
} from "./rush"

export type CartPageView = {
  lines: CartLineView[]
  pieces: number
  /** Formatted amounts. `itemSubtotal` is the garments and the fit kit, never rush. */
  itemSubtotal: string
  /** The "Rush production" row, formatted, or null when the cart holds no rush line. */
  rush: string | null
  total: string
  delivery: DeliveryRow | null
  /** Formatted, when the delivery row has an amount. */
  deliveryAmount?: string
  showTaxNote: boolean
  /** "YYYY-MM-DD" from the rules, or null. */
  deliveryDate: string | null
  /** Formatted cash on delivery limit, when the cart is over it (Pakistan). */
  codLimit: string | null
  /** Over the limit with rush in the cart: the hint says Standard lowers the total. */
  codRushHint: boolean
  /** The "Delivery speed" control, or null when rush isn't offered. */
  rushControl: RushControlView | null
  /** The page took off a rush line that is no longer offered: a quiet line says so. */
  rushDropped: boolean
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
  rushDropped = false,
}: {
  cart: HttpTypes.StoreCart
  rules: CheckoutRules | null
  shippingOptions: ShippingOptionLike[] | null
  countryCode: string
  isGuest: boolean
  rushDropped?: boolean
}): CartPageView => {
  const currency = cart.currency_code
  const amounts = summaryAmounts(cart.item_subtotal, cart.items)
  const delivery = deliveryRow({
    shippingMethods: cart.shipping_methods as ShippingMethodLike[] | null | undefined,
    shippingSubtotal: cart.shipping_subtotal,
    shippingOptions,
  })

  return {
    lines: newestFirst(withoutRush(cart.items)).map((item) =>
      cartLineView(item, currency, maxQuantityFor(item.variant))
    ),
    pieces: pieceCount(cart.items),
    itemSubtotal: money(amounts.items, currency),
    rush: amounts.rush === null ? null : money(amounts.rush, currency),
    total: money(cart.total, currency),
    delivery,
    deliveryAmount:
      delivery?.kind === "amount" ? money(delivery.amount, currency) : undefined,
    showTaxNote: cartShowsTaxNote(cart),
    deliveryDate: promisedDate(rules),
    codLimit: codLimitNote(rules),
    codRushHint: codHintMentionsRush(rules),
    rushControl: rushControlView(rules, currency, cart.items),
    rushDropped,
    minimum: rules ? minimumView(rules) : null,
    rulesFailed: rules === null,
    exportRegion: isExportRegion(countryCode),
    checkoutHref: checkoutHref(cart),
    isGuest,
  }
}
