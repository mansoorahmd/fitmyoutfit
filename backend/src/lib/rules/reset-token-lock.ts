/**
 * Makes a password-reset token single-use under concurrency (QA's fifteenth review, S3).
 * Plain TypeScript, no Medusa imports; the middleware in src/api/middlewares.ts takes the lock.
 *
 * Medusa 2.22.6 consumes a reset token by listing its row and then deleting it
 * (@medusajs/auth, consumePasswordResetToken), without a lock: two updates sent at the same moment
 * with one token both found the row and both changed the password (QA: 20 of 20 rounds). Holding
 * a lock per token for as long as an update request runs makes the second request wait until the
 * first has answered; it then finds the row gone and is refused (401).
 *
 * The lock is keyed by the token's `jti` claim, read from the request's Authorization header
 * without checking the signature: the key is used for nothing else, and Medusa checks the token
 * itself right after. A request without a readable `jti` takes no lock (Medusa refuses it anyway).
 */

/** Longest `jti` accepted as a lock key (Medusa's is a UUID, 36 characters). */
export const MAX_JTI_LENGTH = 100

/**
 * The lock key for an update request's Authorization header (`Bearer <jwt>`, the scheme in any
 * case, as Medusa accepts it), or undefined when it holds no JWT with a `jti` of letters, digits,
 * `-` and `_`, at most MAX_JTI_LENGTH characters.
 */
export function resetTokenLockKey(authorization: unknown): string | undefined {
  if (typeof authorization !== "string") {
    return undefined
  }
  const match = /^\s*bearer\s+([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]*)\s*$/i.exec(authorization)
  if (!match) {
    return undefined
  }
  let claims: unknown
  try {
    claims = JSON.parse(Buffer.from(match[2], "base64url").toString("utf8"))
  } catch {
    return undefined
  }
  const jti = (claims as { jti?: unknown } | null)?.jti
  if (typeof jti !== "string" || !new RegExp(`^[A-Za-z0-9_-]{1,${MAX_JTI_LENGTH}}$`).test(jti)) {
    return undefined
  }
  return `fitmyoutfit:reset-token:${jti}`
}

/** What the second request is told when the first held the token's lock for too long. */
export const RESET_TOKEN_BUSY_MESSAGE =
  "This reset link is being used by another request. If the password was not changed, ask for a new link."
