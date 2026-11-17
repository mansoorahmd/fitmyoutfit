/**
 * Keeps credentials in a request's address out of Medusa's request log (QA's fifteenth review, B2).
 * Plain TypeScript, no Medusa imports; the middleware in src/api/middlewares.ts applies it.
 *
 * Medusa (@medusajs/framework 2.22.6, http/express-loader.js) logs every request with morgan: the
 * request's address (`req.originalUrl`) and its `Referer` header, read when the response is sent.
 * The admin's reset page is opened at `/app/reset-password?token=…`, so without this its token is
 * written to the log by the page request and again as the referrer of every asset and API request
 * the page makes. The same holds for Medusa's admin invite link (`/app/invite?token=…`).
 */

/** What a credential's value is replaced with. */
export const REDACTED = "[redacted]"

/** Query parameters whose value is a credential (compared after decoding, ignoring case). */
export const CREDENTIAL_QUERY_KEYS: readonly string[] = ["token"]

function decodedKey(rawKey: string): string {
  try {
    return decodeURIComponent(rawKey.replace(/\+/g, " ")).trim().toLowerCase()
  } catch {
    return rawKey.trim().toLowerCase()
  }
}

/**
 * The address (a path with a query, or a whole URL as in a `Referer`) with the value of every
 * credential parameter in its query replaced by REDACTED. The key is compared the way a browser's
 * URLSearchParams reads it (percent-decoded, `+` as a space), so `%74oken=` counts too. Everything
 * else, the fragment included, is kept as it was. An address without a credential is returned as
 * it is (the same string).
 */
export function redactCredentialsInUrl(address: string): string {
  const queryStart = address.indexOf("?")
  if (queryStart < 0) {
    return address
  }
  const hashStart = address.indexOf("#", queryStart)
  const queryEnd = hashStart < 0 ? address.length : hashStart
  const query = address.slice(queryStart + 1, queryEnd)
  let changed = false
  const parts = query.split("&").map((part) => {
    const equals = part.indexOf("=")
    const rawKey = equals < 0 ? part : part.slice(0, equals)
    if (!CREDENTIAL_QUERY_KEYS.includes(decodedKey(rawKey))) {
      return part
    }
    changed = true
    return `${rawKey}=${REDACTED}`
  })
  if (!changed) {
    return address
  }
  return `${address.slice(0, queryStart + 1)}${parts.join("&")}${address.slice(queryEnd)}`
}

/** The request fields Medusa's request log reads, as far as this rule is concerned. */
export type LoggedRequestFields = {
  originalUrl?: unknown
  headers: Record<string, unknown>
}

/**
 * Replaces credentials in the fields Medusa's request log reads: `originalUrl` (the logged
 * address; routing reads `url`, which is left alone) and the `Referer` / `Referrer` headers.
 * Changes the object in place and only where a credential was found.
 */
export function redactLoggedRequestFields(req: LoggedRequestFields): void {
  if (typeof req.originalUrl === "string") {
    const redacted = redactCredentialsInUrl(req.originalUrl)
    if (redacted !== req.originalUrl) {
      req.originalUrl = redacted
    }
  }
  for (const name of ["referer", "referrer"]) {
    const value = req.headers[name]
    if (typeof value === "string") {
      const redacted = redactCredentialsInUrl(value)
      if (redacted !== value) {
        req.headers[name] = redacted
      }
    }
  }
}
