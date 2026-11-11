import "server-only"
import { revalidateTag } from "next/cache"

import { CART_CACHE_TAGS } from "@lib/util/cart-cache"

import { getCacheTag } from "./cookies"

/**
 * Drops every cached read that belongs to the visitor's cart (the cart and
 * the shipping options worked out for it), so the next page shows the cart
 * as the backend now has it. Call it after every change to the cart.
 */
export const revalidateCartCaches = async (): Promise<void> => {
  for (const tag of CART_CACHE_TAGS) {
    const cacheTag = await getCacheTag(tag)
    if (cacheTag) {
      revalidateTag(cacheTag)
    }
  }
}
