// Answers copied from the real backend (task S1-4, 12 Nov 2026, a backend
// at commit 8a5d3c7 with the seed data), trimmed to the fields the
// storefront reads. Ids are the ones it gave. Not invented: each is what
// the route answered for the case named.

/** GET /store/carts/:id/checkout-rules: Pakistan, 1 T-shirt, delivery chosen (PKR 2,250). */
export const rulesPkAvailable = {
  minimum_quantity: { required: 1, counted: 1, ok: true },
  cash_on_delivery: { available: true, reason: null, limit: 20000, limit_currency_code: "pkr" },
  delivery_promise: {
    based_on: "2026-11-12",
    standard: { days: 15, date: "2026-11-27" },
    rush: { days: 10, date: "2026-11-22" },
    applies: "standard",
  },
}

/** The same route: Pakistan, 3 jackets and delivery (PKR 22,750). */
export const rulesPkOverLimit = {
  minimum_quantity: { required: 1, counted: 3, ok: true },
  cash_on_delivery: { available: false, reason: "over_limit", limit: 20000, limit_currency_code: "pkr" },
  delivery_promise: rulesPkAvailable.delivery_promise,
}

/** The same route: United Kingdom, 9 jerseys. */
export const rulesGb9 = {
  minimum_quantity: { required: 10, counted: 9, ok: false },
  cash_on_delivery: { available: false, reason: "region", limit: 20000, limit_currency_code: "pkr" },
  delivery_promise: rulesPkAvailable.delivery_promise,
}

/** The same route: United Kingdom, 10 jerseys. */
export const rulesGb10 = {
  ...rulesGb9,
  minimum_quantity: { required: 10, counted: 10, ok: true },
}

/** GET /store/payment-providers?region_id= for Pakistan, then for the United Kingdom. */
export const providersPk = ["pp_cod_cod", "pp_system_default"]
export const providersGb = ["pp_system_default"]

/** GET /store/shipping-options?cart_id= (trimmed). */
export const optionPk = { id: "so_01M75ZSKNW4D35QG0CR69DEAH5", name: "Delivery in Pakistan", amount: 250, data: {} }
export const optionGb = { id: "so_01M75ZSKNXQ6NKD0X24WP0FBWC", name: "Shipping & duties included", amount: 0, data: { ddp: true } }

/** Refusals, exactly as answered (the storefront reads the status, never the message). */
export const refusals = {
  /** POST /store/carts/:id/complete, United Kingdom, 9 jerseys: HTTP 400. */
  minimum: { type: "not_allowed", message: "The minimum order in this region is 10 garment pieces; this cart has 9." },
  /** POST /store/payment-collections/:id/payment-sessions with pp_cod_cod in the UK: HTTP 400. */
  codRegion: { type: "not_allowed", message: "Cash on delivery is available in Pakistan only." },
  /** The same in Pakistan, PKR 22,750: HTTP 400. */
  codOverLimit: { type: "not_allowed", message: "Cash on delivery is available up to 20000 PKR. This cart's total is 22750 PKR." },
  /** POST /store/carts/:id/complete after a quantity change dropped the session: HTTP 400. */
  noSession: { type: "invalid_data", message: "Payment sessions are required to complete cart" },
  /** POST /store/carts/cart_nope/complete: HTTP 404. */
  unknownCart: { type: "not_found", message: "Cart with id 'cart_nope' not found" },
}

/** POST /store/carts/:id/complete, Pakistan, 1 T-shirt, cash on delivery (trimmed). */
export const completedPk = {
  type: "order",
  order: {
    id: "order_01M75ZX01HAMSFCPZ3CD6HF5TA",
    display_id: 1,
    currency_code: "pkr",
    total: 2250,
    shipping_address: { country_code: "pk" },
  },
}

/** GET /store/orders/:id/delivery-promise for that order. */
export const orderPromisePk = {
  delivery_promise: { date: "2026-11-27", days: 15, based_on: "2026-11-12", applies: "standard" },
}

/** GET /store/orders/:id with the confirmation's fields, Pakistan, cash on delivery (trimmed). */
export const orderPk = {
  id: "order_01M75ZX01HAMSFCPZ3CD6HF5TA",
  display_id: 1,
  currency_code: "pkr",
  email: "ali@example.com",
  created_at: "2026-11-11T19:03:36.246Z",
  total: 2250,
  item_subtotal: 2000,
  shipping_subtotal: 250,
  items: [
    {
      id: "ordli_01M75ZX01KMPVQ3ANW8JZKJ653",
      title: "T-Shirt",
      subtitle: "M",
      product_title: "T-Shirt",
      variant_title: "M",
      variant_option_values: null,
      thumbnail: null,
      quantity: 1,
      unit_price: 2000,
      total: 2000,
      created_at: "2026-11-11T19:03:36.246Z",
    },
  ],
  shipping_address: {
    first_name: "محمد علی",
    last_name: "",
    company: "",
    address_1: "House 1, Street 2",
    address_2: "Block C",
    city: "Lahore",
    country_code: "pk",
    province: "pk-pb",
    postal_code: "",
    phone: "0300 1234567",
  },
  shipping_methods: [
    {
      id: "ordsm_01M75ZX01GXJW31WYFZ1Q8YTXN",
      name: "Delivery in Pakistan",
      shipping_option_id: "so_01M75ZSKNW4D35QG0CR69DEAH5",
      data: {},
      amount: 250,
    },
  ],
  payment_collections: [{ status: "authorized", payments: [{ provider_id: "pp_cod_cod", amount: 2250 }] }],
} as any

/** The same, United Kingdom, 10 jerseys, the placeholder payment (GBP 220). */
export const orderGb = {
  ...orderPk,
  id: "order_01M75ZYT3B36R1RA94TS5W5XBW",
  display_id: 2,
  currency_code: "gbp",
  total: 220,
  item_subtotal: 220,
  shipping_subtotal: 0,
  items: [{ ...orderPk.items[0], id: "ordli_gb", title: "Jersey", product_title: "Jersey", quantity: 10, unit_price: 22, total: 220 }],
  shipping_address: {
    ...orderPk.shipping_address,
    first_name: "Ali",
    last_name: "Raza",
    address_1: "1 High Street",
    address_2: "",
    city: "London",
    country_code: "gb",
    province: "",
    postal_code: "SW1A 1AA",
    phone: "07700 900123",
  },
  shipping_methods: [
    {
      id: "ordsm_gb",
      name: "Shipping & duties included",
      shipping_option_id: "so_01M75ZSKNXQ6NKD0X24WP0FBWC",
      data: {},
      amount: 0,
    },
  ],
  payment_collections: [{ status: "authorized", payments: [{ provider_id: "pp_system_default", amount: 220 }] }],
} as any

/**
 * A checkout cart (GET /store/carts/:id with the checkout's fields), as the
 * backend answered for Pakistan after the address and delivery were saved
 * and cash on delivery chosen (trimmed).
 */
export const checkoutCartPk = (over: Record<string, unknown> = {}) =>
  ({
    id: "cart_01M75ZWX85DTXMB6TB4V040ZCC",
    currency_code: "pkr",
    email: "ali@example.com",
    region_id: "reg_01M75ZSJCEAN5W09D9MF1WAPCB",
    completed_at: null,
    total: 2250,
    item_subtotal: 2000,
    shipping_subtotal: 250,
    region: {
      id: "reg_01M75ZSJCEAN5W09D9MF1WAPCB",
      metadata: { tax_final: false, min_garment_quantity: 1 },
      countries: [{ iso_2: "pk", display_name: "Pakistan", name: "PAKISTAN" }],
    },
    items: [
      {
        id: "cali_01M75ZWXRXC72CQWG2N0ADNY5G",
        title: "T-Shirt",
        product_title: "T-Shirt",
        product_handle: "t-shirt",
        variant_title: "M",
        variant_id: "variant_01M75ZSJQHZP2H3GYYTJZBW5GR",
        thumbnail: null,
        quantity: 1,
        unit_price: 2000,
        total: 2000,
        created_at: "2026-11-11T19:03:33.917Z",
        product: { metadata: { kind: "garment" } },
      },
    ],
    shipping_methods: [
      { amount: 250, shipping_option_id: optionPk.id, name: "Delivery in Pakistan", id: "casm_01M75ZWYXES5GG7KG948B1ZX0N" },
    ],
    shipping_address: {
      first_name: "محمد علی",
      last_name: "",
      company: "",
      address_1: "House 1, Street 2",
      address_2: "Block C",
      city: "Lahore",
      postal_code: "",
      country_code: "pk",
      province: "pk-pb",
      phone: "0300 1234567",
    },
    billing_address: {
      first_name: "محمد علی",
      last_name: "",
      company: "",
      address_1: "House 1, Street 2",
      address_2: "Block C",
      city: "Lahore",
      postal_code: "",
      country_code: "pk",
      province: "pk-pb",
      phone: "0300 1234567",
    },
    payment_collection: {
      id: "pay_col_01M75ZWZHM4NYV6RB9ACGQNRZW",
      payment_sessions: [{ id: "payses_01M75ZWZP29ZSJVD9B9NB5AECX", provider_id: "pp_cod_cod", status: "pending" }],
    },
    ...over,
  }) as any

/** The United Kingdom's cart: 10 jerseys, address and the duty-paid delivery saved, no payment yet. */
export const checkoutCartGb = (over: Record<string, unknown> = {}) =>
  checkoutCartPk({
    id: "cart_01M75ZYP6PJNQ300ZZVYBH5A4F",
    currency_code: "gbp",
    region_id: "reg_01M75ZSJCE2QZWPBV7WMV88P97",
    total: 220,
    item_subtotal: 220,
    shipping_subtotal: 0,
    region: {
      id: "reg_01M75ZSJCE2QZWPBV7WMV88P97",
      metadata: { tax_final: false, min_garment_quantity: 10 },
      countries: [{ iso_2: "gb", display_name: "United Kingdom", name: "UNITED KINGDOM" }],
    },
    items: [
      {
        id: "cali_gb",
        title: "Jersey",
        product_title: "Jersey",
        product_handle: "jersey",
        variant_title: "M",
        variant_id: "var_M",
        thumbnail: null,
        quantity: 10,
        unit_price: 22,
        total: 220,
        created_at: "2026-11-11T19:04:31.703Z",
        product: { metadata: { kind: "garment" } },
      },
    ],
    shipping_methods: [
      { amount: 0, shipping_option_id: optionGb.id, name: "Shipping & duties included", id: "casm_gb" },
    ],
    shipping_address: {
      first_name: "Ali",
      last_name: "Raza",
      company: "",
      address_1: "1 High Street",
      address_2: "",
      city: "London",
      postal_code: "SW1A 1AA",
      country_code: "gb",
      province: "",
      phone: "07700 900123",
    },
    billing_address: null,
    payment_collection: null,
    ...over,
  })
