// What a reset link's address may carry (docs/contracts/m1-password-reset.md,
// section 3), with no dependency beyond ./email: the middleware (edge
// runtime) and the sealed cookie use it. src/__tests__/reset-middleware.test.ts
// checks that nothing the middleware imports reaches code the edge refuses.

import { EMAIL_MAX_LENGTH, isEmail } from "./email"

/** How long a link works, in minutes. Fixed by the backend (contract sections 1 and 2); the sentences take it as {minutes}. */
export const RESET_LINK_MINUTES = 15

/**
 * The token as the link gives it: one non-empty string of the characters a
 * Medusa token (a JWT) is made of, at most 4,096 of them. Anything else is
 * treated as no token. Never trimmed or guessed at.
 */
export const cleanToken = (value: unknown): string | null =>
  typeof value === "string" && value.length > 0 && value.length <= 4096 && /^[A-Za-z0-9._~+/=-]+$/.test(value)
    ? value
    : null

/** The email as the link gives it, trimmed and in lower case, or null when it is not a plain email. */
export const cleanEmail = (value: unknown): string | null => {
  if (typeof value !== "string") return null
  const email = value.trim().toLowerCase()
  return email.length <= EMAIL_MAX_LENGTH && isEmail(email) ? email : null
}
