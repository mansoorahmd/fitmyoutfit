/**
 * How email leaves this backend, and so whether a password-reset link may be written to a log.
 * Plain TypeScript, no Medusa imports. build-config.ts configures the Notification Module from
 * this, and the password-reset subscriber asks it before it sends anything.
 *
 * - `"log"`: development and test (NODE_ENV unset, `development` or `test`; node-env.ts). Medusa's
 *   local notification provider takes the `email` channel and writes every email, data included,
 *   to the backend's log. That is how a developer gets a reset link without an email provider.
 * - `"none"`: every other NODE_ENV. No email provider exists yet (Resend comes in Sprint 2,
 *   docs/decisions/002-email-provider.md), and the local provider must not take the `email`
 *   channel: a reset link is a credential and must never reach a production log. Nothing is sent.
 *
 * When Resend is added, it becomes a third answer (`"send"`) for production with its settings,
 * and the local provider still never runs outside development and test.
 */
import type { Env } from "./build-config"
import { isLocalNodeEnv } from "./node-env"

export type EmailDelivery = "log" | "none"

/** The Notification Module channel our emails use. */
export const EMAIL_CHANNEL = "email"

export function emailDelivery(env: Env): EmailDelivery {
  return isLocalNodeEnv(env.NODE_ENV) ? "log" : "none"
}

/** May a password-reset link be written to the log here? Only in development and test. */
export function mayLogResetLink(env: Env): boolean {
  return emailDelivery(env) === "log"
}
