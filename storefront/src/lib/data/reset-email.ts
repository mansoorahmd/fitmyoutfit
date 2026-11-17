import { createDecipheriv, createHash } from "node:crypto"

import { cookies } from "next/headers"

import { RESET_COOKIE, SEALED_AAD, linkFromPlain, resetSecret, sealedParts } from "@lib/util/reset-cookie"

/**
 * The email in a sealed reset cookie, or null when the cookie is missing,
 * altered, sealed with another secret, expired or malformed. Opens the same
 * format as `openReset` (lib/util/reset-cookie.ts), but with Node's
 * synchronous crypto and no promise: in development React keeps the values
 * that a server component awaits, and the I/O behind them (Web Crypto's
 * `decrypt` among it), in the data it sends the browser (the RSC payload), and
 * the opened cookie, token included, was in it. A synchronous call leaves
 * nothing to record, and only the email leaves this function.
 */
export const emailInResetCookie = (value: string | undefined, secret: string, now: number = Date.now()): string | null => {
  try {
    const parts = sealedParts(value)
    if (!parts) return null
    const bytes = Buffer.from(parts.sealed, "base64url")
    if (bytes.length <= 16) return null
    const decipher = createDecipheriv("aes-256-gcm", createHash("sha256").update(secret).digest(), Buffer.from(parts.iv, "base64url"))
    decipher.setAAD(Buffer.from(SEALED_AAD))
    decipher.setAuthTag(bytes.subarray(bytes.length - 16))
    const plain = Buffer.concat([decipher.update(bytes.subarray(0, bytes.length - 16)), decipher.final()]).toString("utf8")
    return linkFromPlain(plain, now)?.email ?? null
  } catch {
    return null
  }
}

/**
 * The email of the reset link in this browser's cookie, or null when there is
 * no usable link. The reset page awaits this, so the token is never a value
 * of the page's component, and only `cookies()` (the cookie still sealed) is
 * awaited.
 *
 * Not a server action (no "use server"): the browser cannot call it.
 */
export const openedResetEmail = async (): Promise<string | null> =>
  emailInResetCookie((await cookies()).get(RESET_COOKIE)?.value, resetSecret())
