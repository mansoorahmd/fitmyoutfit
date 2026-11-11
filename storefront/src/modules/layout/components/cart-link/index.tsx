"use client"

import { ShoppingBag } from "@medusajs/icons"

import { cartContent } from "@content/cart"
import { countWords } from "@lib/util/wording"
import LocalizedClientLink from "@modules/common/components/localized-client-link"

/** "Cart, 1 item" / "Cart, 3 items", or "Cart, empty": the link's accessible name. */
export const cartLinkLabel = (count: number) =>
  count > 0 ? countWords(count, cartContent.badge.label) : cartContent.badge.empty

/**
 * The header's cart button: a bag icon with the item count as a number
 * badge, 44 x 44, linking to the cart page at every width (docs/design/
 * 05-m1-pages.md, 4.7). At 0 the badge is hidden.
 */
const CartLink = ({ count }: { count: number }) => (
  <LocalizedClientLink
    href="/cart"
    aria-label={cartLinkLabel(count)}
    className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-control text-brand-on-inverse transition-colors duration-150 ease-out hover:bg-brand-on-inverse/10"
    data-testid="nav-cart-link"
  >
    <ShoppingBag width={24} height={24} aria-hidden="true" />
    {count > 0 && (
      <span
        aria-hidden="true"
        className="absolute right-0 top-0.5 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-brand-on-inverse px-1 text-[13px] font-bold leading-none text-brand-ink"
        data-testid="nav-cart-count"
      >
        {count}
      </span>
    )}
  </LocalizedClientLink>
)

export default CartLink
