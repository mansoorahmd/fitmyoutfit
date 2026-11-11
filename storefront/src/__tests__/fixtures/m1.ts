// Fixtures in the shapes of docs/contracts/m1-checkout.md, for the M1 tests.
// The backend's routes don't exist in this working copy yet; these stand in
// for them in tests only.

const SIZES = ["YS", "YM", "YL", "YXL", "XS", "S", "M", "L", "XL", "2XL", "3XL"]

/** metadata.size_chart (contract section 2). */
export const chartFixture = (over: Record<string, unknown> = {}) => ({
  draft: true,
  unit: "cm",
  columns: [
    { key: "chest", label: "Chest width" },
    { key: "length", label: "Body length" },
  ],
  rows: SIZES.map((size, i) => ({
    size,
    values: { chest: 38 + i * 2, length: 52 + i * 2 },
  })),
  ...over,
})

/** GET /store/carts/:id/checkout-rules (contract section 6). */
export const rulesFixture = (over: Record<string, unknown> = {}) => ({
  minimum_quantity: { required: 10, counted: 4, ok: false },
  cash_on_delivery: {
    available: false,
    reason: "region",
    limit: 20000,
    limit_currency_code: "pkr",
  },
  delivery_promise: {
    based_on: "2026-11-11",
    standard: { days: 15, date: "2026-11-26" },
    rush: { days: 10, date: "2026-11-21" },
  },
  ...over,
})

type Market = "pk" | "us"

/**
 * GET /store/shipping-options?cart_id= (contract section 3), trimmed to the
 * fields the storefront reads, as the backend returned them on 11 Nov 2026
 * (task S1-3b, a cart of 10 pieces in each region).
 */
export const shippingOptionsFixture = (market: Market) =>
  market === "pk"
    ? [{ id: "so_01M75TYKSNQCNFW2NHG4X8V7J2", name: "Delivery in Pakistan", amount: 250, price_type: "flat", data: {} }]
    : [{ id: "so_01M75TYKSPCRF6EY96EH7XT3W3", name: "Shipping & duties included", amount: 0, price_type: "flat", data: { ddp: true } }]

/**
 * `cart.shipping_methods` with the cart page's fields, after POST
 * /store/carts/:id/shipping-methods, exactly as the backend returned them
 * on the same day. The method carries no duty-paid marker of its own (with
 * `*shipping_methods` its `data` is {}): only its option says so.
 */
export const shippingMethodsFixture = (market: Market) => [
  market === "pk"
    ? {
        amount: 250,
        is_tax_inclusive: false,
        shipping_option_id: "so_01M75TYKSNQCNFW2NHG4X8V7J2",
        name: "Delivery in Pakistan",
        id: "casm_01M75VAK4SFT36EX1Y4S759P4V",
        tax_lines: [],
        adjustments: [],
      }
    : {
        amount: 0,
        is_tax_inclusive: false,
        shipping_option_id: "so_01M75TYKSPCRF6EY96EH7XT3W3",
        name: "Shipping & duties included",
        id: "casm_01M75VAH3VDJ5NZ8KGMZQ5NB4D",
        tax_lines: [],
        adjustments: [],
      },
]

/** A cart line as the store API returns it (the fields the storefront reads). */
export const lineFixture = (over: Record<string, unknown> = {}) =>
  ({
    id: "cali_1",
    title: "Jersey",
    product_title: "Jersey",
    product_handle: "jersey",
    variant_id: "var_M",
    variant_title: "M",
    variant_option_values: null,
    thumbnail: null,
    quantity: 4,
    unit_price: 22,
    total: 88,
    created_at: "2026-11-11T10:00:00.000Z",
    product: { metadata: { kind: "garment" } },
    variant: { manage_inventory: false, allow_backorder: false },
    ...over,
  }) as any

export const cartFixture = (over: Record<string, unknown> = {}) =>
  ({
    id: "cart_1",
    currency_code: "gbp",
    email: null,
    shipping_address: null,
    shipping_methods: [],
    items: [lineFixture()],
    item_subtotal: 88,
    shipping_subtotal: 0,
    total: 88,
    region: { metadata: { tax_final: false } },
    ...over,
  }) as any
