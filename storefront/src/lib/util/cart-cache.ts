// The cached reads that belong to the visitor's cart. Next.js caches each
// under `<tag>-<cache id>`, and every change to the cart (its items, its
// address, its delivery method or its region) must revalidate all of them.
// A tag left out keeps showing the cart as it was: for example the old
// region's delivery row after a region switch (QA, task S1-3b, D1).

/**
 * - `carts`: the cart itself (lib/data/cart.ts).
 * - `fulfillment`: the shipping options the checkout lists (lib/data/fulfillment.ts).
 * - `shippingOptions`: the shipping options the cart page and the layout read
 *   (lib/data/cart.ts, `listCartOptions`). They change with the cart's region.
 */
export const CART_CACHE_TAGS = ["carts", "fulfillment", "shippingOptions"] as const

export type CartCacheTag = (typeof CART_CACHE_TAGS)[number]
