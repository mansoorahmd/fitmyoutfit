// Sign-in and create account (docs/design/05-m1-pages.md, section 8): the
// view a URL asks for, the links between the views, the field checks and
// their messages, and how the backend's answers turn into what the page
// says. Plain data in and out; the forms only lay it out, and the server
// actions run the same checks before anything is sent.
//
// Error messages never say whether an email has an account, except the one
// thing creating an account can't hide: that the email is taken (W-L11).

import { accountContent } from "@content/account"
import { checkoutContent } from "@content/checkout"

import { asciiDigits, isEmail, isPhone, tooLong } from "./checkout-address"
import { fill } from "./wording"

const words = accountContent.auth

export type AuthView = "signin" | "create"

/** `?view=create` is the create view; anything else is sign-in (05, 8.1). */
export const authView = (param: unknown): AuthView => (param === "create" ? "create" : "signin")

/**
 * The link to a view, keeping where to return to and the email (a path
 * without the country code). `next` is passed on as it came: it is checked
 * where it is used, never trusted here.
 */
export const authHref = (
  view: AuthView,
  { next, email }: { next?: string | null; email?: string | null } = {}
): string => {
  const params = new URLSearchParams()
  params.set("view", view)
  if (next) params.set("next", next)
  if (email) params.set("email", email)
  return `/account?${params.toString()}`
}

/** A query value as one string: the first of several, "" for none. */
export const queryValue = (value: string | string[] | undefined): string =>
  (Array.isArray(value) ? value[0] : value) ?? ""

/** The rule behind W-L6. Medusa's own sign-up has none, so the storefront keeps it. */
export const MIN_PASSWORD_LENGTH = 8

export type SignInValues = { email: string; password: string }

export type CreateValues = {
  firstName: string
  lastName: string
  email: string
  phone: string
  password: string
}

export type SignInErrors = Partial<Record<keyof SignInValues, string>>
export type CreateErrors = Partial<Record<keyof CreateValues, string>>

const blank = (value: string) => !value.trim()

const phoneExample = (countryCode: string) =>
  checkoutContent.address.phoneExamples[countryCode.toLowerCase()] ??
  checkoutContent.address.phoneExamples.pk

/** The order the fields appear in, for focus and the error list. */
export const SIGN_IN_FIELDS: (keyof SignInValues)[] = ["email", "password"]
export const CREATE_FIELDS: (keyof CreateValues)[] = [
  "firstName",
  "lastName",
  "email",
  "phone",
  "password",
]

/** An email that looks real and fits the store's limit (FIELD_MAX, shared with the checkout). */
const emailError = (email: string): string | undefined =>
  !isEmail(email) ? checkoutContent.address.errors.email : tooLong("email", email) ?? undefined

/** Sign-in: a real-looking email and any password. Nothing is said about the account. */
export const validateSignIn = (values: SignInValues): SignInErrors => {
  const errors: SignInErrors = {}
  const email = emailError(values.email)
  if (email) errors.email = email
  if (!values.password) errors.password = words.errors.password
  return errors
}

/**
 * Create account: a first name, an email, a phone only if one is given
 * (and then a real one, as at checkout), and a password of at least
 * MIN_PASSWORD_LENGTH characters. Names, email and phone have the
 * checkout's limits (QA S1-4c, S2: a 20,000-character name was stored, and
 * the checkout then refused its own prefilled name).
 */
export const validateCreate = (values: CreateValues, countryCode: string): CreateErrors => {
  const errors: CreateErrors = {}
  const e = checkoutContent.address.errors
  if (blank(values.firstName)) errors.firstName = e.firstName
  else {
    const long = tooLong("first_name", values.firstName)
    if (long) errors.firstName = long
  }
  const lastLong = tooLong("last_name", values.lastName)
  if (lastLong) errors.lastName = lastLong
  const email = emailError(values.email)
  if (email) errors.email = email
  if (!blank(values.phone)) {
    const long = tooLong("phone", values.phone)
    if (long) errors.phone = long
    else if (!isPhone(values.phone)) errors.phone = fill(e.phoneInvalid, { example: phoneExample(countryCode) })
  }
  if (values.password.length < MIN_PASSWORD_LENGTH) {
    errors.password = fill(words.errors.passwordShort, { min: MIN_PASSWORD_LENGTH })
  } else if (!values.password.trim()) {
    // eight spaces met the length rule (QA S1-4c, m4)
    errors.password = words.errors.passwordSpaces
  }
  return errors
}

/**
 * The email as the account keeps it: trimmed and in lower case, on sign-up
 * and on sign-in alike, so "Ali@Example.com" and "ali@example.com" are the
 * same account (Medusa compares emails exactly as stored).
 */
export const normalEmail = (email: string): string => email.trim().toLowerCase()

/** What the customer record is created with: trimmed, empty optional fields left out. */
export const toCustomerCreate = (values: CreateValues) => {
  const out: { email: string; first_name: string; last_name?: string; phone?: string } = {
    email: normalEmail(values.email),
    first_name: values.firstName.trim(),
  }
  if (!blank(values.lastName)) out.last_name = values.lastName.trim()
  // stored with ASCII digits, however it was typed (QA S1-4c, m3)
  if (!blank(values.phone)) out.phone = asciiDigits(values.phone).trim()
  return out
}

/** A backend call's answer, or its HTTP status (none when nothing came back). */
export type Call<T> = { ok: true; body: T } | { ok: false; status?: number }

export type AuthProblem =
  /** Sign-in: the email and password don't match an account (W-L10). */
  | "wrong"
  /** Create: the email already has an account (W-L11). */
  | "exists"
  /** No answer from the store (W-E16). */
  | "unreachable"
  /** The store answered with an error of its own (the server-error title). */
  | "server"

/** A failed call as the page explains it: no answer, or the store's fault. */
export const problemFor = (status: number | undefined): "unreachable" | "server" =>
  typeof status === "number" ? "server" : "unreachable"

/** The wording for a problem, from content/account.ts and content/errors.ts. */
export const authProblemText = (
  problem: AuthProblem,
  serverText: string
): string =>
  problem === "wrong"
    ? words.errors.wrong
    : problem === "exists"
      ? words.errors.exists
      : problem === "unreachable"
        ? words.errors.unreachable
        : serverText

export type AuthOutcome = { ok: true; token: string } | { ok: false; problem: AuthProblem }

/**
 * Sign-in: the email and password give a token, and the token belongs to a
 * customer. HTTP 401 from either is "wrong" (Medusa answers the same for an
 * unknown email and a wrong password); a sign-in with no customer behind it
 * (for example an email only an admin uses) is "wrong" too, so the answer
 * never tells the two apart.
 */
export const signInFlow = async ({
  login,
  hasCustomer,
}: {
  login: () => Promise<Call<string>>
  /** Whether the token belongs to a customer (GET /store/customers/me). */
  hasCustomer: (token: string) => Promise<Call<boolean>>
}): Promise<AuthOutcome> => {
  const signedIn = await login()
  if (!signedIn.ok) {
    return {
      ok: false,
      problem: signedIn.status === 401 || signedIn.status === 400 ? "wrong" : problemFor(signedIn.status),
    }
  }
  const customer = await hasCustomer(signedIn.body)
  if (!customer.ok) return { ok: false, problem: problemFor(customer.status) }
  if (!customer.body) return { ok: false, problem: "wrong" }
  return { ok: true, token: signedIn.body }
}

/**
 * Create account, as Medusa's store API asks for it: register the email
 * and password (a registration token), create the customer with that
 * token, then sign in for a token that names the customer.
 *
 * When the email is already registered (HTTP 401), it may be an earlier
 * attempt that stopped half-way (the email registered, the customer never
 * created): signing in with the same password tells. If that works and no
 * customer exists yet, the customer is created now; if one exists, the
 * person has just proved the password and is signed in. Only when the
 * password doesn't match is the answer "exists" (W-L11), which creating an
 * account can't avoid revealing.
 */
export const signUpFlow = async ({
  register,
  login,
  hasCustomer,
  createCustomer,
}: {
  register: () => Promise<Call<string>>
  login: () => Promise<Call<string>>
  hasCustomer: (token: string) => Promise<Call<boolean>>
  createCustomer: (token: string) => Promise<Call<unknown>>
}): Promise<AuthOutcome> => {
  const fail = (status?: number): AuthOutcome => ({ ok: false, problem: problemFor(status) })

  const createThenSignIn = async (token: string): Promise<AuthOutcome> => {
    const created = await createCustomer(token)
    if (!created.ok) return fail(created.status)
    const signedIn = await login()
    return signedIn.ok ? { ok: true, token: signedIn.body } : fail(signedIn.status)
  }

  const registered = await register()
  if (registered.ok) {
    return createThenSignIn(registered.body)
  }
  if (registered.status !== 401) {
    return fail(registered.status)
  }

  const signedIn = await login()
  if (!signedIn.ok) {
    return signedIn.status === 401 || signedIn.status === 400
      ? { ok: false, problem: "exists" }
      : fail(signedIn.status)
  }
  const customer = await hasCustomer(signedIn.body)
  if (!customer.ok) return fail(customer.status)
  return customer.body ? { ok: true, token: signedIn.body } : createThenSignIn(signedIn.body)
}

export type CartAfterSignIn = "kept" | "dropped"

/**
 * After sign-in the visitor's cart is moved to the customer (Medusa's
 * transfer). If the store refuses it (4xx: the cart is already an order,
 * or belongs to another customer), the cart cookie is dropped, so nobody
 * sees or orders from a cart that isn't theirs. With no answer or a 5xx
 * the cart is kept: the header's banner offers the transfer again.
 */
export const cartAfterTransfer = (transfer: Call<unknown>): CartAfterSignIn =>
  !transfer.ok && typeof transfer.status === "number" && transfer.status >= 400 && transfer.status < 500
    ? "dropped"
    : "kept"
