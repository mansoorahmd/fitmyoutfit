// Answers copied from the real backend (task S1-5, 12 Nov 2026, a backend
// at commit fb88f3e with the seed data, on port 9006), trimmed to the
// fields the account reads. Ids are the ones it gave. Not invented: each is
// what the route answered for the case named.

import { orderGb, orderPk } from "./m1-checkout"

/** POST /auth/customer/emailpass with a wrong password, or an unknown email: both HTTP 401. */
export const loginWrong = { type: "unauthorized", message: "Invalid email or password" }

/** POST /auth/customer/emailpass/register for an email that already has an identity: HTTP 401. */
export const registerExists = { type: "unauthorized", message: "Identity with email already exists" }

/** POST /auth/customer/emailpass/update with a signed-in (not reset) token: HTTP 401. */
export const passwordUpdateRefused = { type: "unauthorized", message: "Invalid token" }

/** GET /store/customers/me with the registration token (no customer yet): HTTP 401. */
export const meWithoutCustomer = { message: "Unauthorized" }

/** GET /store/customers/me?fields=*addresses after an address was saved (trimmed). */
export const customer = {
  id: "cus_01M7678BDE3S1G121B0R09BE1Z",
  email: "probe1794431526934@example.com",
  company_name: null,
  first_name: "محمد علی",
  last_name: "",
  phone: "0300 1234567",
  metadata: null,
  has_account: true,
  created_at: "2026-11-11T21:12:08.367Z",
  addresses: [
    {
      id: "cuaddr_01M7678DBMDWFFATJ1Q7K2J6S5",
      address_name: null,
      is_default_shipping: true,
      is_default_billing: true,
      company: null,
      first_name: "Ali",
      last_name: "Raza",
      address_1: "12 Mall Road",
      address_2: null,
      city: "Lahore",
      country_code: "pk",
      province: "pk-pb",
      postal_code: "",
      phone: "0300 1234567",
      created_at: "2026-11-11T21:12:09.900Z",
    },
  ],
} as any

/**
 * GET /store/orders with the history's fields (`*items`), one Pakistan
 * order (trimmed). The list returns `metadata` to its customer when no
 * fields are given; the storefront asks for fields, so it never comes.
 */
export const orderListPk = {
  orders: [
    {
      id: "order_01M768NPZTPMSBTP33ES97Z3KX",
      display_id: 1,
      created_at: "2026-11-11T21:36:54.785Z",
      status: "pending",
      total: 2250,
      currency_code: "pkr",
      payment_status: "authorized",
      fulfillment_status: "not_fulfilled",
      items: [
        {
          id: "ordli_01M768NPZXTWSJDE29731BH5KW",
          title: "T-Shirt",
          subtitle: "M",
          thumbnail:
            "https://www.spized.com/thumbnail/ec/18/b3/1752243175/e3ad4da2-a889-3963-c6e8-f7a0582cff6f_781001-V2_600x600.png?ts=1752243175",
          product_title: "T-Shirt",
          variant_title: "M",
          quantity: 1,
          unit_price: 2000,
          metadata: {},
        },
      ],
    },
  ],
  count: 1,
  offset: 0,
  limit: 10,
} as any

/** GET /store/orders without fields: the same order, with its metadata (what must never be shown). */
export const orderListDefaultMetadata = {
  delivery_promise: { date: "2026-11-27", days: 15, applies: "standard", based_on: "2026-11-12" },
}

/** GET /store/orders/:id/delivery-promise for that order. */
export const promisePk = {
  delivery_promise: { date: "2026-11-27", days: 15, based_on: "2026-11-12", applies: "standard" },
}

/**
 * The Pakistan order after staff recorded the cash as collected (POST
 * /admin/orders/:id/cash-collection): GET /store/orders/:id then answered
 * payment_status "captured" and the payment's captured_at.
 */
export const orderPkCollected = {
  ...orderPk,
  customer_id: customer.id,
  status: "pending",
  fulfillment_status: "not_fulfilled",
  payment_status: "captured",
  payment_collections: [
    {
      status: "completed",
      captured_amount: 2250,
      payments: [{ provider_id: "pp_cod_cod", captured_at: "2026-11-11T21:39:28.472Z" }],
    },
  ],
} as any

/** The same order before collection: payment_status "authorized", no captured_at. */
export const orderPkDue = {
  ...orderPk,
  customer_id: customer.id,
  status: "pending",
  fulfillment_status: "not_fulfilled",
  payment_status: "authorized",
  payment_collections: [{ status: "authorized", payments: [{ provider_id: "pp_cod_cod", captured_at: null }] }],
} as any

/** The UK order of 10 jerseys (GBP 220, duty-paid delivery at 0, the placeholder payment). */
export const orderGbAccount = {
  ...orderGb,
  customer_id: customer.id,
  status: "pending",
  fulfillment_status: "not_fulfilled",
  payment_status: "authorized",
} as any

/** GET /store/regions, the countries only (trimmed; the region ids shortened). */
export const regions = [
  { id: "reg_pk", countries: [{ iso_2: "pk", display_name: "Pakistan" }] },
  { id: "reg_gb", countries: [{ iso_2: "gb", display_name: "United Kingdom" }] },
  { id: "reg_ae", countries: [{ iso_2: "ae", display_name: "United Arab Emirates" }] },
  { id: "reg_us", countries: [{ iso_2: "us", display_name: "United States" }] },
]
