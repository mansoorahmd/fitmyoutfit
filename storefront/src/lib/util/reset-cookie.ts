// The reset link's token between the page load and the submit
// (docs/contracts/m1-password-reset.md, section 3).
//
// The link's address carries the token and the email. The storefront's
// middleware takes them from the address on the server, seals them into one
// cookie and redirects to the same page without a query. From then on the
// address bar, the history, `document.referrer` and every page script see no
// token: the cookie is http-only (no script can read it), scoped to the
// reset page's own path (no other page of ours receives it), lasts as long
// as the link does, and its content is encrypted and authenticated
// (AES-256-GCM, key from RESET_COOKIE_SECRET), so what the browser stores is
// not the token and cannot be altered or moved to another kind of cookie.
// Only the server (the page, then the update's server action) opens it. Web
// Crypto only, so the middleware (edge) and the server (Node) share this file.

import { RESET_LINK_MINUTES, cleanEmail, cleanToken } from "./reset-link"

export const RESET_COOKIE = "fmo_reset"

/** The cookie lasts as long as the link does. */
export const RESET_COOKIE_MAX_AGE = RESET_LINK_MINUTES * 60

export type ResetLink = { token: string; email: string }

const VERSION = "v1"
const AAD = `${RESET_COOKIE}.${VERSION}`
const encoder = new TextEncoder()
const decoder = new TextDecoder()

const toBase64Url = (bytes: Uint8Array): string => {
  let binary = ""
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i])
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

const fromBase64Url = (value: string): Uint8Array<ArrayBuffer> => {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (value.length % 4)) % 4)
  const binary = atob(padded)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return bytes
}

/**
 * The secret the key comes from: RESET_COOKIE_SECRET, a long random string of
 * at least 32 characters. The fixed stand-in, which is public in the
 * repository, is used only when NODE_ENV, trimmed, is exactly `development`
 * or `test` (the backend's rule for its own dev-only values, in
 * backend/src/lib/config/node-env.ts). Any other value (unset, blank,
 * `staging`, `Production`, a typo) needs the real secret; without it this
 * throws, and only the code that seals or opens a reset cookie asks for the
 * secret, so only the reset path fails. The message names no token.
 */
export const resetSecret = (env: Record<string, string | undefined> = process.env): string => {
  const value = env.RESET_COOKIE_SECRET?.trim()
  if (value && value.length >= 32) return value
  const nodeEnv = (env.NODE_ENV ?? "").trim()
  if (nodeEnv === "development" || nodeEnv === "test") {
    return "development-only-reset-cookie-secret-not-for-production"
  }
  throw new Error(
    "RESET_COOKIE_SECRET must be set to a random string of at least 32 characters (the development stand-in is used only when NODE_ENV is exactly development or test)"
  )
}

const key = async (secret: string, usage: "encrypt" | "decrypt"): Promise<CryptoKey> => {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(secret))
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, [usage])
}

/** Seals the token and email for the cookie, valid for the link's whole life from `now`. */
export const sealReset = async (link: ResetLink, secret: string, now: number = Date.now()): Promise<string> => {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const plain = encoder.encode(JSON.stringify({ t: link.token, e: link.email, x: now + RESET_COOKIE_MAX_AGE * 1000 }))
  const sealed = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: encoder.encode(AAD) },
    await key(secret, "encrypt"),
    plain
  )
  return `${VERSION}.${toBase64Url(iv)}.${toBase64Url(new Uint8Array(sealed))}`
}

/** Opens what sealReset made: the link, or null when it is missing, altered, sealed with another secret, expired or malformed. Never throws. */
export const openReset = async (
  value: string | undefined | null,
  secret: string,
  now: number = Date.now()
): Promise<ResetLink | null> => {
  try {
    if (typeof value !== "string") return null
    const [version, iv, sealed, ...rest] = value.split(".")
    if (version !== VERSION || !iv || !sealed || rest.length > 0) return null
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: fromBase64Url(iv), additionalData: encoder.encode(AAD) },
      await key(secret, "decrypt"),
      fromBase64Url(sealed)
    )
    const data = JSON.parse(decoder.decode(plain)) as { t?: unknown; e?: unknown; x?: unknown }
    const token = cleanToken(data.t)
    const email = cleanEmail(data.e)
    if (!token || !email || typeof data.x !== "number" || data.x <= now) return null
    return { token, email }
  } catch {
    return null
  }
}

/** The reset page under a country: "/pk/account/reset-password", in any letter case, with or without a trailing slash. */
const RESET_PATH = /^\/([a-z]{2})\/account\/reset-password\/?$/i
/** The same page with no country, which is how the backend's link is written. */
const RESET_PATH_NO_COUNTRY = /^\/account\/reset-password\/?$/i
/** Any path of that shape, whatever comes before it: no page and no redirect may carry a token under it. */
const RESET_SHAPE = /\/account\/reset-password\/?$/i

/** True when the path ends in /account/reset-password (any case, any prefix). */
export const endsWithResetPage = (pathname: string): boolean => RESET_SHAPE.test(pathname)

/**
 * The query without its `token` and `email` values (any letter case of the
 * names), the rest kept; "" when nothing is left. For a path of the reset
 * page's shape that the link's rule does not seal (an unknown country, a
 * longer path): the browser is redirected without the credentials.
 */
export const withoutResetParams = (search: string): string => {
  const params = new URLSearchParams(search)
  let changed = false
  for (const name of Array.from(new Set(Array.from(params.keys())))) {
    if (name.toLowerCase() === "token" || name.toLowerCase() === "email") {
      params.delete(name)
      changed = true
    }
  }
  if (!changed) return search
  const rest = params.toString()
  return rest ? `?${rest}` : ""
}

export type ResetRedirect = {
  /** The same page without a query: where the browser is sent. */
  location: string
  /**
   * The cookie to set with it. A link with no usable token or email sets an
   * empty one with maxAge 0, which clears an earlier link's cookie, so the
   * page says the link no longer works instead of showing the old form.
   */
  cookie: { name: string; value: string; path: string; maxAge: number }
}

/**
 * The middleware's rule for the reset page: a request for the page with a
 * query (the link's address) is answered by a redirect to the page without
 * one; the token and email go into the sealed cookie, scoped to the page's
 * path. The country code counts in any letter case and is written in lower
 * case. The page with no country (the backend's link) is sealed for
 * `fallbackCountry`, the visitor's country, so no redirect ever carries the
 * token. Anything else (another path, or no query at all) is left alone: null.
 * A link missing its token or email, or with a malformed one, clears the cookie.
 */
export const resetLinkRedirect = async (
  pathname: string,
  search: string,
  /** The secret, or a function that gives it: asked for only when a cookie is sealed, so a missing secret never breaks other pages. */
  secret: string | (() => string),
  now: number = Date.now(),
  /**
   * `has`: whether a country code (lower case) is one the store sells to; a
   * path with another one is not sealed. `fallback`: the country to use for
   * a path with none (leave out to leave such a path alone). Default: every
   * two-letter code is accepted.
   */
  countries: { has: (code: string) => boolean; fallback?: string } = { has: () => true }
): Promise<ResetRedirect | null> => {
  if (!search || search === "?") return null
  const match = RESET_PATH.exec(pathname)
  const country = match ? match[1].toLowerCase() : RESET_PATH_NO_COUNTRY.test(pathname) ? countries.fallback : undefined
  if (!country || !/^[a-z]{2}$/.test(country) || !countries.has(country)) return null
  const params = new URLSearchParams(search)
  const token = cleanToken(params.get("token"))
  const email = cleanEmail(params.get("email"))
  const path = `/${country}/account/reset-password`
  if (!token || !email) return { location: path, cookie: { name: RESET_COOKIE, value: "", path, maxAge: 0 } }
  return {
    location: path,
    cookie: { name: RESET_COOKIE, value: await sealReset({ token, email }, typeof secret === "function" ? secret() : secret, now), path, maxAge: RESET_COOKIE_MAX_AGE },
  }
}
