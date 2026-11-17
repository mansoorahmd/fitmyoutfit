// Password reset (docs/contracts/m1-password-reset.md, sections 1 and 3):
// the checks, the bodies sent to Medusa and how its answers turn into what
// the pages say. Plain data in and out; the server actions
// (lib/data/password-reset.ts) only make the calls.
//
// Facts about Medusa this relies on (contract section 1, verified by QA on
// a running backend): the email goes in trimmed and in lower case as the
// only field; the update takes the token in an Authorization header and
// only { password } in the body; an empty or refused password USES THE
// LINK UP and Medusa accepts any password, so the password is checked here
// before anything is sent; 401 is an expired, used or wrong token.

import { checkoutContent } from "@content/checkout"

import { Call, newPasswordError, normalEmail } from "./account-auth"
import { FIELD_MAX, isEmail, tooLong } from "./checkout-address"

// the link's life and the address's parts live in ./reset-link, which the middleware can import
export { RESET_LINK_MINUTES, cleanEmail, cleanToken } from "./reset-link"

export type ForgotErrors = { email?: string }

/** The forgot-password field: a real-looking email that fits the store's limit. */
export const validateForgot = (values: { email: string }): ForgotErrors => {
  const email = values.email
  if (typeof email !== "string" || !isEmail(email)) return { email: checkoutContent.address.errors.email }
  const long = tooLong("email", email)
  return long ? { email: long } : {}
}

/** The body of the request for a link: the email trimmed and in lower case, and nothing else (QA). */
export const requestBody = (email: string): { identifier: string } => ({ identifier: normalEmail(email) })

/** The body of the update: only the password (QA). The token goes in the header, never here. */
export const updateBody = (password: string): { password: string } => ({ password })

export type RequestOutcome = "requested" | "failed"

/**
 * What a request for a link came to. Medusa answers the same whether or not
 * an account exists, so every answer that came back below 500 is "requested"
 * and the page says the same thing for all of them; only no answer at all
 * (the backend is down) or a server error is "failed".
 */
export const requestOutcome = (answer: Call<unknown>): RequestOutcome =>
  answer.ok || (typeof answer.status === "number" && answer.status < 500) ? "requested" : "failed"

export type UpdateOutcome =
  /** The password is changed and the link is used up. */
  | "changed"
  /** The link is expired, used or wrong (401): it will never work. */
  | "gone"
  /** No answer, a server error or anything else: the link may still be good. */
  | "failed"

/** What the update came to: 401 and only 401 means the link is dead. */
export const updateOutcome = (answer: Call<unknown>): UpdateOutcome =>
  answer.ok ? "changed" : answer.status === 401 ? "gone" : "failed"

export type NewPasswordErrors = { password?: string }

/** The reset page's one field, with the create-account rule. Run before anything is sent. */
export const validateNewPassword = (values: { password: string }): NewPasswordErrors => {
  const message = newPasswordError(values.password)
  return message ? { password: message } : {}
}

/** The page the link opens, for a country. */
export const resetPath = (countryCode: string): string => `/${countryCode}/account/reset-password`

/** The sign-in page after a new password was saved: the email filled in and the notice. */
export const afterResetPath = (countryCode: string, email: string): string => {
  const params = new URLSearchParams({ view: "signin", email, notice: "password-changed" })
  return `/${countryCode}/account?${params.toString()}`
}

/** Where the browser keeps an email between pages (session storage), so it never travels in an address. */
export const CARRY_EMAIL_KEY = "fmo.forgot-email"

/**
 * Keeps an email in the browser for the forgot-password page (an empty one
 * clears what was kept). Storage can be blocked: then nothing is kept and
 * the forgot-password page starts empty.
 */
export const carryEmail = (email: string): void => {
  try {
    const trimmed = email.trim()
    if (trimmed) window.sessionStorage.setItem(CARRY_EMAIL_KEY, trimmed)
    else window.sessionStorage.removeItem(CARRY_EMAIL_KEY)
  } catch {
    // blocked storage
  }
}

/** The email carried over, taken once: it is gone from the browser afterwards. "" when none. */
export const takeCarriedEmail = (): string => {
  try {
    const carried = window.sessionStorage.getItem(CARRY_EMAIL_KEY) ?? ""
    window.sessionStorage.removeItem(CARRY_EMAIL_KEY)
    return carried.slice(0, FIELD_MAX.email)
  } catch {
    return ""
  }
}
