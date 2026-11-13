"use server"

import { HttpTypes } from "@medusajs/types"
import { revalidateTag } from "next/cache"

import { sdk } from "@lib/config"
import {
  AccountAddressErrors,
  AccountAddressValues,
  storeCountryCodes,
  toCustomerAddress,
  validateAccountAddress,
} from "@lib/util/account-address"
import {
  AuthProblem,
  Call,
  CreateErrors,
  CreateValues,
  SignInErrors,
  SignInValues,
  cartAfterTransfer,
  normalEmail,
  signInFlow,
  signUpFlow,
  toCustomerCreate,
  validateCreate,
  validateSignIn,
} from "@lib/util/account-auth"
import { NameValues, PhoneValues, savedProfile, validateName, validatePhone } from "@lib/util/account-profile"
import { asciiDigits } from "@lib/util/checkout-address"
import { afterSignInPath } from "@lib/util/safe-next"

import { revalidateCartCaches } from "./cart-cache"
import {
  getAuthHeaders,
  getCacheOptions,
  getCacheTag,
  getCartId,
  removeAuthToken,
  removeCartId,
  setAuthToken,
} from "./cookies"
import { listRegions } from "./regions"

// The customer's calls to the backend: sign-in, create account, sign out,
// the profile and the addresses (docs/design/05-m1-pages.md, sections 8
// and 9), on Medusa's own store and auth routes (contract section 9).
// Each answers with plain data the page can show, never a thrown error
// and never a redirect (see AuthResult). The decisions are in
// lib/util/account-*.ts and lib/util/safe-next.ts.

/** A backend call's answer, or its HTTP status (none when nothing came back). */
const call = async <T>(run: () => Promise<T>): Promise<Call<T>> => {
  try {
    return { ok: true, body: await run() }
  } catch (error) {
    const status = (error as { status?: unknown })?.status
    return { ok: false, status: typeof status === "number" ? status : undefined }
  }
}

const bearer = (token: string) => ({ authorization: `Bearer ${token}` })

const revalidate = async (tag: string) => {
  const cacheTag = await getCacheTag(tag)
  if (cacheTag) revalidateTag(cacheTag)
}

/**
 * The signed-in customer with their saved addresses, or null (signed out,
 * or the sign-in has expired). Cached per visitor; every change below
 * revalidates it.
 */
export const retrieveCustomer = async (): Promise<HttpTypes.StoreCustomer | null> => {
  const authHeaders = await getAuthHeaders()

  if (!("authorization" in authHeaders)) return null

  return await sdk.client
    .fetch<{ customer: HttpTypes.StoreCustomer }>(`/store/customers/me`, {
      method: "GET",
      query: { fields: "*addresses" },
      headers: { ...authHeaders },
      next: { ...(await getCacheOptions("customers")) },
      cache: "force-cache",
    })
    .then(({ customer }) => customer)
    .catch(() => null)
}

export type CustomerState =
  | { kind: "signed_in"; customer: HttpTypes.StoreCustomer }
  | { kind: "signed_out" }
  /** Signed in, but the store didn't answer: the page shows the server-error block. */
  | { kind: "failed" }

/**
 * The customer for the account pages, telling "signed out" (no sign-in, or
 * an expired one: 401) from "the store didn't answer".
 */
export async function customerState(): Promise<CustomerState> {
  const authHeaders = await getAuthHeaders()
  if (!("authorization" in authHeaders)) return { kind: "signed_out" }

  const result = await call(async () =>
    sdk.client.fetch<{ customer: HttpTypes.StoreCustomer }>(`/store/customers/me`, {
      method: "GET",
      query: { fields: "*addresses" },
      headers: { ...authHeaders },
      next: { ...(await getCacheOptions("customers")) },
      cache: "force-cache",
    })
  )
  if (result.ok) return { kind: "signed_in", customer: result.body.customer }
  return result.status === 401 || result.status === 404 ? { kind: "signed_out" } : { kind: "failed" }
}

const login = (email: string, password: string) => () =>
  call(async () => {
    const answer = await sdk.client.fetch<{ token?: string }>(`/auth/customer/emailpass`, {
      method: "POST",
      body: { email, password },
    })
    if (!answer.token) throw Object.assign(new Error("no token"), { status: 500 })
    return answer.token
  })

const hasCustomer = (token: string) =>
  call(async () => {
    try {
      await sdk.client.fetch(`/store/customers/me`, {
        method: "GET",
        query: { fields: "id" },
        headers: bearer(token),
        cache: "no-store",
      })
      return true
    } catch (error) {
      // a token with no customer behind it
      if ((error as { status?: number })?.status === 401) return false
      throw error
    }
  })

/**
 * After a sign-in: the cookie, the customer's cached reads, and the cart
 * moved to the customer (Medusa's transfer). A cart the store won't move
 * (already an order, or another customer's) is let go; every cached read
 * of the cart is dropped either way, so the header, the cart and the
 * checkout show the cart as it now is.
 */
const afterSignIn = async (token: string) => {
  await setAuthToken(token)
  await revalidate("customers")
  await revalidate("orders")

  const cartId = await getCartId()
  if (cartId) {
    const transfer = await call(async () => sdk.store.cart.transferCart(cartId, {}, bearer(token)))
    if (cartAfterTransfer(transfer) === "dropped") {
      await removeCartId()
    }
  }
  await revalidateCartCaches()
}

export type AuthResult =
  /**
   * Signed in: the page loads `href` afresh (a full page load, so the
   * header, the cart and every cached read show the signed-in customer).
   * Not a redirect from here: a redirect from a server action reaches the
   * caller as a thrown error, and in a production build the page then
   * sometimes stayed on the form (task S1-5).
   */
  | { kind: "signed_in"; href: string }
  | { kind: "invalid"; errors: SignInErrors | CreateErrors }
  | { kind: "problem"; problem: AuthProblem }

/**
 * Sign in (05, 8.3). Checks the fields again, signs in, and answers where
 * to go: `next` when it is a path inside the store (lib/util/safe-next.ts),
 * else the account. Otherwise answers with what went wrong.
 */
export async function signIn(
  values: SignInValues,
  countryCode: string,
  next: string | null
): Promise<AuthResult> {
  const errors = validateSignIn(values)
  if (Object.keys(errors).length > 0) return { kind: "invalid", errors }

  const email = normalEmail(values.email)
  const outcome = await signInFlow({ login: login(email, values.password), hasCustomer })
  if (!outcome.ok) return { kind: "problem", problem: outcome.problem }

  await afterSignIn(outcome.token)
  return { kind: "signed_in", href: afterSignInPath(countryCode, next) }
}

/**
 * Create account (05, 8.3), then the same as signing in. The flow and why
 * it signs in an email that is already registered with the same password
 * are in lib/util/account-auth.ts (signUpFlow).
 */
export async function signUp(
  values: CreateValues,
  countryCode: string,
  next: string | null
): Promise<AuthResult> {
  const errors = validateCreate(values, countryCode)
  if (Object.keys(errors).length > 0) return { kind: "invalid", errors }

  const customer = toCustomerCreate(values)
  const outcome = await signUpFlow({
    register: () =>
      call(async () => {
        const answer = await sdk.client.fetch<{ token?: string }>(
          `/auth/customer/emailpass/register`,
          { method: "POST", body: { email: customer.email, password: values.password } }
        )
        if (!answer.token) throw Object.assign(new Error("no token"), { status: 500 })
        return answer.token
      }),
    login: login(customer.email, values.password),
    hasCustomer,
    createCustomer: (token) =>
      call(async () => sdk.store.customer.create(customer, {}, bearer(token))),
  })
  if (!outcome.ok) return { kind: "problem", problem: outcome.problem }

  await afterSignIn(outcome.token)
  return { kind: "signed_in", href: afterSignInPath(countryCode, next) }
}

/**
 * Sign out (05, 9.1): the sign-in cookie goes, and so does the cart, which
 * now belongs to the customer (the next person on this device starts a
 * cart of their own). Answers the sign-in page's path, which the page
 * loads afresh (see AuthResult).
 */
export async function signout(countryCode: string): Promise<{ href: string }> {
  await removeAuthToken()
  await revalidate("customers")
  await revalidate("orders")
  await removeCartId()
  await revalidateCartCaches()
  return { href: `/${/^[a-z]{2}$/.test(countryCode) ? countryCode : "pk"}/account` }
}

/**
 * The header's "transfer again" (the cart mismatch banner): moves the
 * visitor's cart to the signed-in customer.
 */
export async function transferCart() {
  const cartId = await getCartId()

  if (!cartId) {
    return
  }

  const headers = await getAuthHeaders()

  await sdk.store.cart.transferCart(cartId, {}, headers)

  await revalidateCartCaches()
}

/** What the store keeps for the profile's rows, as it answered after a save. */
export type SavedProfile = { first_name: string; last_name: string; phone: string }

export type SaveResult<E> =
  /** `profile`: the profile as the store now has it (name and phone saves). */
  | { kind: "saved"; profile?: SavedProfile }
  | { kind: "invalid"; errors: E }
  /** The store refused or didn't answer: "We couldn't save … Try again." */
  | { kind: "failed" }
  /** The sign-in has expired: the page goes to sign-in. */
  | { kind: "signed_out" }

const outcomeOf = async <E>(result: Call<unknown>): Promise<SaveResult<E>> => {
  if (result.ok) {
    await revalidate("customers")
    return { kind: "saved" }
  }
  return result.status === 401 ? { kind: "signed_out" } : { kind: "failed" }
}

const accountCountryCodes = async (): Promise<string[]> => {
  try {
    return storeCountryCodes(await listRegions())
  } catch {
    return []
  }
}

/** "Save address" on a new address (05, 9.5): the checkout's checks, then Medusa's route. */
export async function addCustomerAddress(
  values: AccountAddressValues
): Promise<SaveResult<AccountAddressErrors>> {
  const errors = validateAccountAddress(values, await accountCountryCodes())
  if (Object.keys(errors).length > 0) return { kind: "invalid", errors }

  const headers = await getAuthHeaders()
  return outcomeOf(
    await call(async () => sdk.store.customer.createAddress(toCustomerAddress(values), {}, headers))
  )
}

/** "Save address" on an address being edited, including making it the default. */
export async function updateCustomerAddress(
  addressId: string,
  values: AccountAddressValues
): Promise<SaveResult<AccountAddressErrors>> {
  const errors = validateAccountAddress(values, await accountCountryCodes())
  if (Object.keys(errors).length > 0) return { kind: "invalid", errors }

  const headers = await getAuthHeaders()
  return outcomeOf(
    await call(async () =>
      sdk.store.customer.updateAddress(addressId, toCustomerAddress(values), {}, headers)
    )
  )
}

/** "Remove" after "Remove this address?" (05, 9.5). */
export async function deleteCustomerAddress(addressId: string): Promise<SaveResult<never>> {
  const headers = await getAuthHeaders()
  return outcomeOf(await call(async () => sdk.store.customer.deleteAddress(addressId, headers)))
}

/**
 * A profile save: the store's answer carries the customer as it now is,
 * which the page shows at once and starts the next edit from (QA S1-4c, B2:
 * the page re-rendered by the cache tag alone kept the old name).
 */
const profileOutcome = async <E>(
  result: Call<{ customer?: HttpTypes.StoreCustomer }>
): Promise<SaveResult<E>> => {
  const outcome = await outcomeOf<E>(result)
  if (outcome.kind !== "saved" || !result.ok) return outcome
  return { kind: "saved", profile: savedProfile(result.body?.customer) }
}

/** The profile's name row (05, 9.6). */
export async function updateCustomerName(values: NameValues): Promise<SaveResult<Partial<Record<keyof NameValues, string>>>> {
  const errors = validateName(values)
  if (Object.keys(errors).length > 0) return { kind: "invalid", errors }

  const headers = await getAuthHeaders()
  return profileOutcome(
    await call(async () =>
      sdk.store.customer.update(
        { first_name: values.firstName.trim(), last_name: values.lastName.trim() },
        {},
        headers
      )
    )
  )
}

/** The profile's phone row (05, 9.6). */
export async function updateCustomerPhone(values: PhoneValues): Promise<SaveResult<Partial<Record<keyof PhoneValues, string>>>> {
  const errors = validatePhone(values)
  if (Object.keys(errors).length > 0) return { kind: "invalid", errors }

  const headers = await getAuthHeaders()
  return profileOutcome(
    await call(async () =>
      // stored with ASCII digits, however it was typed (QA S1-4c, m3)
      sdk.store.customer.update({ phone: asciiDigits(values.phone).trim() }, {}, headers)
    )
  )
}
