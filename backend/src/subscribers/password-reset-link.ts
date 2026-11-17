/**
 * Sends the password-reset link (docs/contracts/m1-password-reset.md, section 2). Medusa's
 * reset-password routes create the token and emit `auth.password_reset`, but send nothing; this
 * subscriber asks the Notification Module to send the link on the `email` channel with the
 * template `password-reset`. Which link, and whether anything may be sent, is decided by
 * planPasswordReset (src/lib/rules/password-reset.ts); this file only looks up the email's
 * account of the asked actor type (the identity's `app_metadata`) and carries the plan out.
 *
 * In development and test the local notification provider writes the email to the log, which is
 * where a developer copies the link from; this file logs nothing then. Outside development and
 * test nothing is sent (no notification is created) and one warning is logged, without the token,
 * the link or the email's local part. An unknown email produces no event, so nothing here can tell
 * whether an account exists; a failure is logged, never thrown, and the request was answered
 * before this runs anyway.
 */
import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { EMAIL_CHANNEL, mayLogResetLink } from "../lib/config/email-delivery"
import { readPublicUrls } from "../lib/config/public-urls"
import {
  accountToLookUp,
  errorNameForLog,
  hasAccountOfType,
  PASSWORD_RESET_EVENT,
  planPasswordReset,
  RESET_PROVIDER,
  sendFailureLine,
  type AccountCheck,
  type PasswordResetEventData,
} from "../lib/rules/password-reset"

/** The `app_metadata` of the emailpass identity of `email`; undefined when there is none. */
async function appMetadataOf(container: MedusaContainer, email: string): Promise<unknown> {
  const auth = container.resolve(Modules.AUTH)
  const [providerIdentity] = await auth.listProviderIdentities(
    { entity_id: email, provider: RESET_PROVIDER },
    { select: ["auth_identity_id"] }
  )
  if (!providerIdentity?.auth_identity_id) {
    return undefined
  }
  const identity = await auth.retrieveAuthIdentity(providerIdentity.auth_identity_id, {
    select: ["app_metadata"],
  })
  return identity?.app_metadata
}

async function checkAccount(
  container: MedusaContainer,
  data: PasswordResetEventData
): Promise<AccountCheck> {
  const lookup = accountToLookUp(data)
  if (!lookup) {
    return { kind: "no_account" }
  }
  try {
    const appMetadata = await appMetadataOf(container, lookup.email)
    return hasAccountOfType(appMetadata, lookup.actorType) ? { kind: "has_account" } : { kind: "no_account" }
  } catch (error) {
    return { kind: "lookup_failed", errorName: errorNameForLog(error) }
  }
}

export default async function sendPasswordResetLink({
  event: { data },
  container,
}: SubscriberArgs<PasswordResetEventData>): Promise<void> {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  try {
    const event = data ?? {}
    const plan = planPasswordReset(event, {
      urls: readPublicUrls(process.env),
      mayLog: mayLogResetLink(process.env),
      channel: EMAIL_CHANNEL,
      account: await checkAccount(container, event),
    })
    if (plan.action === "fail") {
      logger.error(plan.error)
      return
    }
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
    logger.error(sendFailureLine(error, mayLogResetLink(process.env)))
  }
}

export const config: SubscriberConfig = {
  event: PASSWORD_RESET_EVENT,
}
