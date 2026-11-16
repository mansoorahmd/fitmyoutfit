"use server"

import { HttpTypes } from "@medusajs/types"
import { revalidateTag } from "next/cache"
import { RedirectType, redirect } from "next/navigation"

import { sdk } from "@lib/config"
import {
  AddressErrors,
  AddressFormValues,
  shouldSaveToAccount,
  toCartAddress,
  toCartUpdate,
  validateAddressForm,
} from "@lib/util/checkout-address"
import {
  BackendCall,
  PLACE_ORDER_SERVER_MS,
  PlaceOrderOutcome,
  RefusalView,
  explainRefusal,
  failureKind,
  placeOrderFlow,
} from "@lib/util/checkout-order"
import { sessionProviderId } from "@lib/util/checkout-payment"
import { within } from "@lib/util/deadline"
import { confirmationPath } from "@lib/util/order-status"

import { call } from "./backend-call"
import { revalidateCartCaches } from "./cart-cache"
import { getCheckoutRules } from "./checkout-rules"
import { getAuthHeaders, getCacheTag, getCartId } from "./cookies"
import { afterOrder } from "./order-status"

// The checkout's calls to the backend (docs/design/05-m1-pages.md, section
// 6; docs/contracts/m1-checkout.md). Each answers with plain data the page
// can show, never a thrown error. Every change to the cart goes through
// revalidateCartCaches(). The decisions are in lib/util/checkout-*.ts.

/**
 * The checkout's fields: the lines with their product (for the kind), the
 * region's countries (the country field), both addresses, the delivery
 * method with its option id (to tell the duty-paid one), the payment
 * sessions (the chosen method) and completed_at.
 */
const CHECKOUT_CART_FIELDS =
  "*items, *region, *region.countries, *items.product, *items.variant, *items.thumbnail, +items.total, " +
  "*shipping_address, *billing_address, +shipping_methods.name, +shipping_methods.shipping_option_id, " +
  "*payment_collection, *payment_collection.payment_sessions, +completed_at"

const headers = async () => ({ ...(await getAuthHeaders()) })

const fetchCart = async (id: string, fields = CHECKOUT_CART_FIELDS, signal?: AbortSignal) =>
  call(async () => {
    const { cart } = await sdk.client.fetch<HttpTypes.StoreCartResponse>(
      `/store/carts/${encodeURIComponent(id)}`,
      { method: "GET", query: { fields }, headers: await headers(), cache: "no-store", signal }
    )
    return cart
  })

/**
 * The visitor's cart for the checkout, read fresh (never from the cache:
 * what is placed must be what is shown). No cookie or an unknown cart is
 * "no cart"; no answer or a 5xx is a failure (the server-error block).
 */
export async function retrieveCheckoutCart(): Promise<{
  cart: HttpTypes.StoreCart | null
  failed: boolean
}> {
  const id = await getCartId()
  if (!id) {
    return { cart: null, failed: false }
  }
  const result = await fetchCart(id)
  if (result.ok) {
    return { cart: result.body, failed: false }
  }
  const status = result.status
  return { cart: null, failed: typeof status !== "number" || status >= 500 }
}

/** The region's shipping options for a cart, read fresh. */
const listOptions = async (cartId: string) =>
  call(async () => {
    const { shipping_options } = await sdk.client.fetch<{
      shipping_options: HttpTypes.StoreCartShippingOption[]
    }>("/store/shipping-options", {
      query: { cart_id: cartId },
      headers: await headers(),
      cache: "no-store",
    })
    return shipping_options
  })

/** The payment providers of the cart's region (contract section 4), or null when they didn't load. */
export async function listRegionPaymentProviders(regionId: string): Promise<string[] | null> {
  const result = await call(async () => {
    const { payment_providers } = await sdk.client.fetch<HttpTypes.StorePaymentProviderListResponse>(
      "/store/payment-providers",
      { query: { region_id: regionId }, headers: await headers(), cache: "no-store" }
    )
    return payment_providers
  })
  return result.ok ? result.body.map((p) => p.id) : null
}

/**
 * Adds the region's one delivery option to the cart (05, 6.1: it is chosen
 * automatically). False when there is no option or adding it fails.
 */
const addDelivery = async (cartId: string): Promise<boolean> => {
  const options = await listOptions(cartId)
  const option = options.ok ? options.body[0] : undefined
  if (!option) {
    return false
  }
  const added = await call(async () =>
    sdk.store.cart.addShippingMethod(cartId, { option_id: option.id }, {}, await headers())
  )
  await revalidateCartCaches()
  return added.ok
}

export type SaveAddressResult =
  /** Saved. `delivery` false: step 2 shows W-K14 with "Try again". */
  | { kind: "saved"; delivery: boolean }
  | { kind: "invalid"; errors: AddressErrors }
  | { kind: "cart_lost" }
  | { kind: "server" }
  | { kind: "no_answer" }

/**
 * Step 1's "Continue" (05, 6.4): checks the fields again, saves the email
 * and both addresses, saves a new address to the account when asked, adds
 * the delivery option, and leaves the rules to be read again by the page.
 */
export async function saveAddressStep(values: AddressFormValues): Promise<SaveAddressResult> {
  const cartId = await getCartId()
  if (!cartId) {
    return { kind: "cart_lost" }
  }

  const current = await fetchCart(cartId, "id,*region,*region.countries")
  if (!current.ok) {
    const kind = failureKind(current.status)
    return kind === "cart_lost" ? { kind } : kind === "server" ? { kind } : { kind: "no_answer" }
  }
  const countryCodes = (current.body.region?.countries ?? [])
    .map((c) => c.iso_2?.toLowerCase())
    .filter((c): c is string => !!c)

  const errors = validateAddressForm(values, countryCodes)
  if (Object.keys(errors).length > 0) {
    return { kind: "invalid", errors }
  }

  const updated = await call(async () =>
    sdk.store.cart.update(cartId, toCartUpdate(values), {}, await headers())
  )
  await revalidateCartCaches()
  if (!updated.ok) {
    const kind = failureKind(updated.status)
    if (kind === "cart_lost" || kind === "server") return { kind }
    if (kind === "refused") {
      // the backend refused the address itself: the checks above should
      // have caught it, so this is the store's fault, not the customer's
      return { kind: "server" }
    }
    return { kind: "no_answer" }
  }

  if (values.saveToAccount) {
    // A failure here never stops the order: the address is on the cart.
    // The account's first address becomes its default, as in the account
    // pages, so the checkout offers it first next time.
    const account = await call(async () =>
      sdk.client.fetch<{ customer: HttpTypes.StoreCustomer }>("/store/customers/me", {
        method: "GET",
        query: { fields: "id,*addresses" },
        headers: await headers(),
        cache: "no-store",
      })
    )
    const address = toCartAddress(values.shipping, values.phone)
    if (shouldSaveToAccount(account.ok ? account.body.customer.addresses ?? [] : null, address)) {
      const first = account.ok && (account.body.customer.addresses?.length ?? 0) === 0
      const saved = await call(async () =>
        sdk.store.customer.createAddress(
          {
            ...address,
            ...(first ? { is_default_shipping: true, is_default_billing: true } : {}),
          },
          {},
          await headers()
        )
      )
      if (saved.ok) {
        const tag = await getCacheTag("customers")
        if (tag) revalidateTag(tag)
      }
    }
  }

  return { kind: "saved", delivery: await addDelivery(cartId) }
}

/** Step 2's "Try again" when adding the delivery option failed (W-K14). */
export async function retryDelivery(): Promise<{ ok: boolean }> {
  const cartId = await getCartId()
  return { ok: !!cartId && (await addDelivery(cartId)) }
}

export type ChoosePaymentResult =
  | { ok: true }
  | { ok: false; kind: "refused" | "cart_lost" | "server" | "no_answer" }

/**
 * Starts a payment session for the chosen method (05, 6.5 b, RadioCard
 * "Loading"). `revalidate` false: "Place order" revalidates only once it
 * knows the outcome (an unknown outcome must not re-render the page).
 */
const startSession = async (cartId: string, providerId: string, { revalidate = true } = {}) => {
  const cart = await fetchCart(cartId, "id,*payment_collection")
  if (!cart.ok) {
    return cart
  }
  const started = await call(async () =>
    sdk.store.payment.initiatePaymentSession(
      cart.body,
      { provider_id: providerId },
      {},
      await headers()
    )
  )
  if (revalidate) await revalidateCartCaches()
  return started
}

export async function choosePayment(providerId: string): Promise<ChoosePaymentResult> {
  const cartId = await getCartId()
  if (!cartId) {
    return { ok: false, kind: "cart_lost" }
  }
  const started = await startSession(cartId, providerId)
  if (started.ok) {
    return { ok: true }
  }
  const kind = failureKind(started.status)
  return {
    ok: false,
    kind:
      kind === "cart_lost" || kind === "server" || kind === "refused" ? kind : "no_answer",
  }
}

export type PlaceOrderResult = Exclude<PlaceOrderOutcome, { kind: "order" }>

/**
 * "Place order" (05, 6.6 to 6.8; contract 6, 8.1 and 9). Creates the
 * payment session again when the cart lost it (any cart change drops it),
 * checks the cart's total is `expectedTotal` (the one the page showed),
 * then completes the cart; on the answers that mean "try again" (409, the
 * dropped or missing payment session) it does all of it again, at most
 * twice (placeOrderFlow). Completing a cart that is already an order
 * returns that order, so pressing twice never orders twice.
 * On success it goes to the confirmation from here, as the starter did: the
 * cart cookie is gone by then, so the checkout must not render again.
 * Otherwise it answers with what happened.
 *
 * Two rules from QA's review of S1-4:
 * - Its calls to the backend share one limit, PLACE_ORDER_SERVER_MS, so a
 *   hung backend ends as "unknown" and frees the browser's queue of server
 *   actions (D5). The backend may still finish; "Check my order" tells.
 * - Only an order or a refusal revalidates the cart's cached reads. Any
 *   revalidation re-renders the page in the action's answer, and with an
 *   unknown outcome that re-render replaced the "We lost the connection"
 *   alert: with the cart, it sent the customer to the cart page (D1); with
 *   the backend down, it showed the server-error block (D6).
 */
export async function placeOrder(
  providerId: string,
  countryCode: string,
  expectedTotal?: number | null
): Promise<PlaceOrderResult> {
  const cartId = await getCartId()
  if (!cartId) {
    return { kind: "cart_lost" }
  }

  const ends = Date.now() + PLACE_ORDER_SERVER_MS
  const left = () => Math.max(1, ends - Date.now())

  const outcome = await placeOrderFlow({
    expectedTotal: typeof expectedTotal === "number" ? expectedTotal : null,
    // answers with the cart as read (its total and whether it is an order already)
    ensureSession: () =>
      call(() =>
        within(left(), async (signal) => {
          const cart = await fetchCart(
            cartId,
            "id,completed_at,total,currency_code,*payment_collection,*payment_collection.payment_sessions",
            signal
          )
          if (!cart.ok) throw { status: cart.status }
          // an order already: completing again returns it, no session needed
          if (cart.body.completed_at) return cart.body
          if (sessionProviderId(cart.body) === providerId) return cart.body
          const started = await startSession(cartId, providerId, { revalidate: false })
          if (!started.ok) throw { status: started.status }
          return cart.body
        })
      ),
    complete: async () => {
      const result = await call(async () =>
        within(left(), async (signal) =>
          sdk.client.fetch<never>(`/store/carts/${encodeURIComponent(cartId)}/complete`, {
            method: "POST",
            headers: await headers(),
            signal,
          })
        )
      )
      return result as BackendCall<never>
    },
  })

  if (outcome.kind === "order") {
    await afterOrder(cartId)
    return redirect(
      confirmationPath(outcome.orderId, outcome.countryCode, countryCode),
      RedirectType.replace
    )
  }
  if (outcome.kind === "refused" || outcome.kind === "total_changed") {
    // the backend answered and the cart is still a cart: the page reads it again
    await revalidateCartCaches()
  }
  return outcome
}

/**
 * After a refusal (05, 6.8 a): the rules and the cart's total read again,
 * and what they explain. The page refreshes afterwards to show the rest.
 */
export async function explainRefusedOrder(chosenId: string | null): Promise<RefusalView> {
  const cartId = await getCartId()
  if (!cartId) {
    return { kind: "generic" }
  }
  const [rules, cart] = await Promise.all([
    getCheckoutRules(cartId),
    fetchCart(cartId, "id,total,currency_code"),
  ])
  return explainRefusal({
    rules,
    chosenId,
    total: cart.ok ? cart.body.total ?? 0 : 0,
    currencyCode: cart.ok ? cart.body.currency_code : "",
  })
}
