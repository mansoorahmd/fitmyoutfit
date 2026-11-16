/**
 * Sends the password-reset link (docs/contracts/m1-password-reset.md, section 2). Medusa's
 * reset-password routes create the token and emit `auth.password_reset`, but send nothing; this
 * subscriber asks the Notification Module to send the link on the `email` channel with the
 * template `password-reset`. Which link, and whether anything may be sent, is decided by
 * planPasswordReset (src/lib/rules/password-reset.ts); this file only carries the plan out.
 *
 * In development and test the local notification provider writes the email to the log, which is
 * where a developer copies the link from; this file logs nothing then. Outside development and
 * test nothing is sent and one warning is logged, without the token, the link or the email's local
 * part. An unknown email produces no event, so nothing here can tell whether an account exists;
 * a failure is logged, never thrown, and the request was answered before this runs anyway.
 */
import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { EMAIL_CHANNEL, mayLogResetLink } from "../lib/config/email-delivery"
import { readPublicUrls } from "../lib/config/public-urls"
import {
  PASSWORD_RESET_EVENT,
  planPasswordReset,
  type PasswordResetEventData,
} from "../lib/rules/password-reset"

export default async function sendPasswordResetLink({
  event: { data },
  container,
}: SubscriberArgs<PasswordResetEventData>): Promise<void> {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  try {
    const plan = planPasswordReset(data ?? {}, {
      urls: readPublicUrls(process.env),
      mayLog: mayLogResetLink(process.env),
      channel: EMAIL_CHANNEL,
    })
    if (plan.action === "withhold") {
      logger.warn(plan.warning)
      return
    }
    if (plan.action === "skip") {
      logger.info(plan.reason)
      return
    }
    await container.resolve(Modules.NOTIFICATION).createNotifications(plan.notification)
  } catch (error) {
    // The message only where a link may be logged: a message could quote the notification's data.
    const why = mayLogResetLink(process.env)
      ? `${(error as Error)?.message ?? error}`
      : `${(error as Error)?.name ?? "error"}`
    logger.error(`Could not send a password reset link (${why}). A new link can be asked for.`)
  }
}

export const config: SubscriberConfig = {
  event: PASSWORD_RESET_EVENT,
}
