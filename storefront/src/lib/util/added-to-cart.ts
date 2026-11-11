// What the "Added to your cart" panel shows after an add (docs/design/
// 05-m1-pages.md, 4.7), built on the server from the cart the add returned
// and the backend's rules. A plain, serialisable object, so the server
// action can hand it to the product page and the header.

import { HttpTypes } from "@medusajs/types"

import { amountFor, lineSize, money, pieceCount } from "./cart-view"
import { CheckoutRules, MinimumView, minimumView } from "./checkout-rules"

export type AddedToCartView = {
  /** Changes with every add, so a second add of the same size shows afresh. */
  key: string
  title: string
  size: string | null
  /** How many were just added ("× 4"). */
  quantity: number
  /** The amount for what was just added, formatted ("PKR 14,000"). */
  amount: string
  thumbnail: string | null
  productHandle: string | null
  /** Pieces in the whole cart, and its total, formatted. */
  pieces: number
  total: string
  /** Export regions only; null when it doesn't show (05, section 5). */
  minimum: MinimumView | null
  /** Garment pieces the backend counted, for "You have N in your cart". Null without rules. */
  counted: number | null
}

/**
 * The view for an add of `quantity` of `variantId`, or null when the cart
 * doesn't hold that variant (the add didn't land).
 */
export const addedToCartView = ({
  cart,
  variantId,
  quantity,
  rules,
  key,
}: {
  cart: Pick<HttpTypes.StoreCart, "items" | "total" | "currency_code">
  variantId: string
  quantity: number
  rules: CheckoutRules | null
  key: string
}): AddedToCartView | null => {
  const line = cart.items?.find((item) => item.variant_id === variantId)
  if (!line) {
    return null
  }
  return {
    key,
    title: line.product_title || line.title,
    size: lineSize(line),
    quantity,
    amount: money(amountFor(line.unit_price, quantity), cart.currency_code),
    thumbnail: line.thumbnail ?? null,
    productHandle: line.product_handle ?? null,
    pieces: pieceCount(cart.items),
    total: money(cart.total, cart.currency_code),
    minimum: minimumView(rules),
    counted: rules?.minimum_quantity?.counted ?? null,
  }
}

/**
 * Where the confirmation goes (05, 4.7): a popover under the header's cart
 * icon from 1024 px, inline under the main button below that.
 */
export type AddedPlacement = "popover" | "inline"

export const addedPlacement = (wide: boolean): AddedPlacement =>
  wide ? "popover" : "inline"

/** The snackbar shows too only when the add came from the phone's sticky bar. */
export const showsSnackbar = (
  placement: AddedPlacement,
  source: "main" | "sticky-bar"
): boolean => placement === "inline" && source === "sticky-bar"
