// What an email address must look like, with no dependency: the middleware
// (edge runtime) reads a reset link's address with it, and nothing it imports
// may pull in code the edge runtime refuses (the checkout's address helpers
// use lodash, which uses `new Function`). The checkout re-exports isEmail.

/** The most characters an email may have (RFC 5321); also the store's limit (FIELD_MAX.email). */
export const EMAIL_MAX_LENGTH = 254

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * Control and format characters (Unicode Cc and Cf): zero-width spaces and
 * joiners, direction marks and embeddings, the soft hyphen, the byte order
 * mark. Written as ranges: the project's compile target has no `u` flag.
 */
const INVISIBLE = /[\u0000-\u001f\u007f-\u009f\u00ad\u0600-\u0605\u061c\u06dd\u070f\u180e\u200b-\u200f\u202a-\u202e\u2060-\u2064\u2066-\u206f\ufeff\ufff9-\ufffb]/

/**
 * An email address with one @ and a dot in the domain; no spaces, no two
 * dots in a row, no dot at either end of the name or the domain, and no
 * invisible character (a zero-width space, a direction mark, a control
 * character; QA S1-4c, m3), which would make an address no one can type.
 */
export const isEmail = (value: string): boolean => {
  const trimmed = value.trim()
  if (!EMAIL.test(trimmed)) return false
  if (INVISIBLE.test(trimmed) || trimmed.includes("..")) return false
  const [local, domain] = trimmed.split("@")
  return !local.startsWith(".") && !local.endsWith(".") && !domain.startsWith(".") && !domain.endsWith(".")
}
