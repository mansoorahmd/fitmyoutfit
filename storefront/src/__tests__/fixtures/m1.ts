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
