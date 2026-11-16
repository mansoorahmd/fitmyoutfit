// Answers copied from the real backend (task S1-6c, 17 Nov 2026, master at
// 5090bed with the seed data, rush_percentage 20), trimmed to the fields the
// storefront reads. Not invented: each is what the route answered for the
// case named (scratchpad s16c/tool/probe1.mjs and probe4.mjs).

import { checkoutCartPk } from "./m1-checkout"

/** GET /store/carts/:id/checkout-rules: Pakistan, 2 T-shirts, no rush yet. */
export const rulesPkRushOffered = {
  minimum_quantity: { required: 1, counted: 2, ok: true },
  cash_on_delivery: { available: true, reason: null, limit: 20000, limit_currency_code: "pkr" },
  delivery_promise: {
    based_on: "2026-11-17",
    standard: { days: 15, date: "2026-12-02" },
    rush: { days: 10, date: "2026-11-27" },
    applies: "standard",
  },
  rush: { available: true, in_cart: false, percentage: 20, amount: 800, currency_code: "pkr" },
}

/** The same cart after POST /store/carts/:id/rush. */
export const rulesPkRushInCart = {
  ...rulesPkRushOffered,
  delivery_promise: { ...rulesPkRushOffered.delivery_promise, applies: "rush" },
  rush: { available: true, in_cart: true, percentage: 20, amount: 800, currency_code: "pkr" },
}

/** The same cart once staff set rush_percentage to 0: not offered, the line still there. */
export const rulesPkRushStale = {
  ...rulesPkRushInCart,
  rush: { available: false, in_cart: true, percentage: 0, amount: 0, currency_code: "pkr" },
}

/** A cart with only a fit kit: rush is not offered. */
export const rulesFitKitOnly = {
  ...rulesPkRushOffered,
  rush: { available: false, in_cart: false, percentage: 20, amount: 0, currency_code: "pkr" },
}

/** The rush line as the cart page's fields return it (product kind rush_add_on, with the seed's thumbnail). */
export const rushLine = (over: Record<string, unknown> = {}) => ({
  id: "cali_rush",
  title: "Rush Production",
  product_title: "Rush Production",
  product_handle: "rush-add-on",
  variant_title: "Default",
  variant_id: "variant_rush",
  thumbnail: "https://medusa-public-images.s3.eu-west-1.amazonaws.com/shorts-vintage-front.png",
  quantity: 1,
  unit_price: 800,
  subtotal: 800,
  total: 800,
  created_at: "2026-11-17T09:00:00.000Z",
  product: { metadata: { kind: "rush_add_on" } },
  ...over,
})

/** A T-shirt line, 2 pieces at PKR 2,000. */
export const tshirtLine = (over: Record<string, unknown> = {}) => ({
  id: "cali_tshirt",
  title: "T-Shirt",
  product_title: "T-Shirt",
  product_handle: "t-shirt",
  variant_title: "M",
  variant_id: "variant_tshirt_m",
  thumbnail: "https://example.com/t-shirt.png",
  quantity: 2,
  unit_price: 2000,
  subtotal: 4000,
  total: 4000,
  created_at: "2026-11-17T08:00:00.000Z",
  product: { metadata: { kind: "garment" } },
  ...over,
})

/** Pakistan, 2 T-shirts and rush, delivery chosen: PKR 4,000 + 800 + 250. */
export const checkoutCartPkRush = (over: Record<string, unknown> = {}) =>
  checkoutCartPk({
    items: [tshirtLine(), rushLine()],
    item_subtotal: 4800,
    total: 5050,
    ...over,
  })

/** POST /store/carts/:id/complete after the percentage changed from 20 to 25 at that moment: HTTP 400. */
export const noSessionAfterPriceChange = {
  type: "invalid_data",
  message: "Payment sessions are required to complete cart",
}
