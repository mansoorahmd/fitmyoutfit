"use server"

import { cookies } from "next/headers"

import { Call } from "@lib/util/account-auth"
import {
  NewPasswordErrors,
  ForgotErrors,
  afterResetPath,
  requestBody,
  requestOutcome,
  updateBody,
  updateOutcome,
  validateForgot,
  validateNewPassword,
} from "@lib/util/password-reset"
import { RESET_COOKIE, openReset, resetSecret } from "@lib/util/reset-cookie"
import { NOTICE_COOKIE, NOTICE_MAX_AGE, noticePath } from "@lib/util/password-notice"
import { cleanEmail } from "@lib/util/reset-link"

import { customerState } from "./customer"

// The password reset's calls to the backend (docs/contracts/m1-password-reset.md,
// sections 1 and 3), on Medusa's own auth routes. The decisions are in
// lib/util/password-reset.ts; the token's cookie is in lib/util/reset-cookie.ts.
//
// These use plain `fetch`, not the Medusa SDK: the SDK's debug log (on in
// development) prints request headers, and the update's header holds the
// token. Nothing here logs a token, an email or a password.

const BACKEND_URL = () => process.env.MEDUSA_BACKEND_URL || "http://localhost:9000"
const PUBLISHABLE_KEY = () => process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY

/** Longer than the backend's own wait for a link's lock (10 seconds). */
const TIMEOUT_MS = 15_000

/** One POST to an auth route: the answer's status, or none when nothing came back. Never throws. */
const post = async (path: string, body: unknown, headers: Record<string, string> = {}): Promise<Call<unknown>> => {
  try {
    const response = await fetch(`${BACKEND_URL()}${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(PUBLISHABLE_KEY() ? { "x-publishable-api-key": PUBLISHABLE_KEY() as string } : {}),
        ...headers,
      },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    // the body is never read: the answer is its status
    await response.body?.cancel().catch(() => {})
    return response.ok ? { ok: true, body: null } : { ok: false, status: response.status }
  } catch {
    return { ok: false }
  }
}

const askFor = (email: string) => post("/auth/customer/emailpass/reset-password", requestBody(email))

export type ForgotResult =
  /** The same for every email: a link is on its way if the email has an account. */
  | { kind: "requested" }
  | { kind: "invalid"; errors: ForgotErrors }
  /** The request itself failed (no answer, or a server error). */
  | { kind: "failed" }

/**
 * "Get a reset link" (contract section 3): checks the email again, then asks
 * Medusa for a link with the email trimmed and in lower case as the only
 * field. Every answer that came back is the same result, so the page can't
 * tell an account from none.
 */
export async function requestPasswordReset(values: { email: string }): Promise<ForgotResult> {
  const errors = validateForgot({ email: values?.email })
  if (Object.keys(errors).length > 0) return { kind: "invalid", errors }
  return requestOutcome(await askFor(values.email)) === "failed" ? { kind: "failed" } : { kind: "requested" }
}

export type ProfileLinkResult =
  | { kind: "requested"; email: string }
  | { kind: "failed" }
  | { kind: "signed_out" }

/**
 * The profile's "Email me a link": the link goes to the signed-in account's
 * own email, which is read here from the store, never taken from the page.
 */
export async function requestPasswordResetForMe(): Promise<ProfileLinkResult> {
  const state = await customerState()
  if (state.kind === "signed_out") return { kind: "signed_out" }
  const email = state.kind === "signed_in" ? state.customer.email : null
  if (!email) return { kind: "failed" }
  return requestOutcome(await askFor(email)) === "requested" ? { kind: "requested", email } : { kind: "failed" }
}

export type ResetResult =
  /** The password is changed; the page loads `href` (sign-in with the email and the notice). */
  | { kind: "changed"; href: string }
  | { kind: "invalid"; errors: NewPasswordErrors }
  /** The link is expired, used, wrong or missing: it will not work again. */
  | { kind: "gone" }
  /**
   * The page was opened for one email, but the browser's cookie now holds
   * another reset link (a second link was opened in another tab). Nothing was
   * sent and neither link is used up; the customer opens the link again.
   */
  | { kind: "stale" }
  /** No answer or a server error: the link may still be good, the customer tries again. */
  | { kind: "failed" }

const clearLink = async (countryCode: string) => {
  const jar = await cookies()
  jar.set(RESET_COOKIE, "", { path: `/${countryCode}/account/reset-password`, maxAge: 0, httpOnly: true })
}

/**
 * "Save new password": the password is checked FIRST (a refused or empty
 * password would use the link up, and Medusa accepts any), then the token is
 * opened from the cookie and sent in an Authorization header with a body of
 * only { password }. The link's cookie goes when the link is used or dead,
 * and stays when the link may still work.
 *
 * `values.email` is the email the form shows. The cookie holds whichever link
 * was opened last in this browser, so it is compared (trimmed, lower case)
 * with the email inside the cookie before anything is sent: when they differ
 * (or the form sent none) nothing goes to the backend, no link is used up and
 * the cookie stays as it is.
 */
export async function resetPassword(values: { password: string; email: string }, countryCode: string): Promise<ResetResult> {
  const errors = validateNewPassword({ password: values?.password })
  if (Object.keys(errors).length > 0) return { kind: "invalid", errors }
  if (!/^[a-z]{2}$/.test(countryCode)) return { kind: "gone" }

  const jar = await cookies()
  const link = await openReset(jar.get(RESET_COOKIE)?.value, resetSecret())
  if (!link) {
    await clearLink(countryCode)
    return { kind: "gone" }
  }
  if (cleanEmail(values?.email) !== link.email) return { kind: "stale" }

  const outcome = updateOutcome(
    await post("/auth/customer/emailpass/update", updateBody(values.password), { authorization: `Bearer ${link.token}` })
  )
  if (outcome === "failed") return { kind: "failed" }
  await clearLink(countryCode)
  if (outcome === "changed") {
    // the sign-in page's "password changed" notice shows only while this flag is there (lib/util/password-notice.ts)
    jar.set(NOTICE_COOKIE, "1", {
      path: noticePath(countryCode),
      maxAge: NOTICE_MAX_AGE,
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    })
  }
  return outcome === "changed" ? { kind: "changed", href: afterResetPath(countryCode, link.email) } : { kind: "gone" }
}
