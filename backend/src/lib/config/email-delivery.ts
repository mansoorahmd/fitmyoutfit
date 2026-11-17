/**
 * How email leaves this backend, and so whether a password-reset link may be written to a log.
 * Plain TypeScript, no Medusa imports. build-config.ts configures the Notification Module from
 * this, and the password-reset subscriber asks it before it sends anything.
 *
 * - `"log"`: development and test, only when NODE_ENV, trimmed, is exactly `development` or
 *   `test` (isExactlyDevelopmentOrTest in node-env.ts). Medusa's local notification provider takes
 *   the `email` channel and writes every email, data included, to the backend's log. That is how a
 *   developer gets a reset link without an email provider.
 * - `"none"`: every other NODE_ENV, unset and blank included (QA's fifteenth review, S5). No email
 *   provider exists yet (Resend comes in Sprint 2, docs/decisions/002-email-provider.md), and the
 *   local provider must not take the `email` channel. Nothing is sent.
 *
 * The real guard for a reset link is the subscriber's question mayLogResetLink: when it says no,
 * the subscriber creates no notification at all. Keeping the `email` channel away from the local
 * provider is a second line only: Medusa stores a notification in its `notification` table, data
 * included, before it looks for a provider for its channel, and admins can read that table through
 * GET /admin/notifications. So a notification on the `email` channel that other code created
 * outside development and test would be refused for lack of a provider, but its data would be kept.
 *
 * When Resend is added, it becomes a third answer (`"send"`) for production with its settings,
 * and the local provider still never runs outside development and test.
 */
import type { Env } from "./build-config"
import { isExactlyDevelopmentOrTest } from "./node-env"

export type EmailDelivery = "log" | "none"

/** The Notification Module channel our emails use. */
export const EMAIL_CHANNEL = "email"

export function emailDelivery(env: Env): EmailDelivery {
  return isExactlyDevelopmentOrTest(env.NODE_ENV) ? "log" : "none"
}

/** May a password-reset link be written to the log here? Only in development and test. */
export function mayLogResetLink(env: Env): boolean {
  return emailDelivery(env) === "log"
}
