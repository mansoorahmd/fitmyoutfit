// Where sign-in returns to (docs/design/05-m1-pages.md, 8.1): `?next=`, a
// path inside the store, never a full URL. A security rule: an open
// redirect after sign-in is a phishing tool ("sign in at our store, land on
// a copy of it"). So anything that is not plainly one of our own paths is
// refused, and the caller goes to the account instead.
//
// The path is the part after the country code, as the cart's link passes it
// ("/cart"); the caller puts the visitor's country code in front of it.

const PROBE_ORIGIN = "https://store.invalid"

/** Longer than any path of ours; a long value is refused rather than cut. */
export const MAX_NEXT_LENGTH = 512

/**
 * The path to return to, or null when `value` is not safe:
 * - it must be a string that starts with exactly one "/";
 * - no "//" or "/\" at the start (protocol-relative: another site);
 * - no backslash anywhere (browsers read "\" as "/" in a URL);
 * - no space or control character anywhere (browsers drop tabs and
 *   newlines, so "/\t/evil.example" would become "//evil.example");
 * - no percent-encoded slash or backslash, dot or control character in the
 *   path (decoded later, they could turn into any of the above);
 * - once parsed against our origin, it must stay on our origin.
 * The answer is the path, query and fragment as parsed.
 */
export const safeNextPath = (value: unknown): string | null => {
  if (typeof value !== "string") return null
  if (value.length === 0 || value.length > MAX_NEXT_LENGTH) return null
  if (value[0] !== "/") return null
  if (value[1] === "/" || value[1] === "\\") return null
  if (value.includes("\\")) return null
  if (/[\u0000-\u0020\u007f-\u009f\u2028\u2029]/.test(value)) return null

  const path = value.split(/[?#]/, 1)[0]
  if (/%(2f|5c|2e|0[0-9a-f]|1[0-9a-f]|7f)/i.test(path)) return null

  let url: URL
  try {
    url = new URL(value, PROBE_ORIGIN)
  } catch {
    return null
  }
  if (url.origin !== PROBE_ORIGIN) return null
  if (url.username || url.password) return null

  const result = `${url.pathname}${url.search}${url.hash}`
  // the parser may have folded "/./" or "/../"; the result must still be ours
  if (!result.startsWith("/") || result.startsWith("//")) return null
  return result
}

/**
 * The full path to go to after sign-in: the safe `next` in the visitor's
 * country, else the account overview.
 */
export const afterSignInPath = (countryCode: string, next: unknown): string => {
  const country = /^[a-z]{2}$/.test(countryCode) ? countryCode : ""
  const safe = safeNextPath(next)
  const prefix = country ? `/${country}` : ""
  return `${prefix}${safe ?? "/account"}`
}
