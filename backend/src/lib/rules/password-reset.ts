/**
 * Password reset (docs/contracts/m1-password-reset.md, section 2): which link a reset token goes
 * out in, and what the password-reset subscriber does with Medusa's `auth.password_reset` event.
 * Plain TypeScript, no Medusa imports; the subscriber (src/subscribers/password-reset-link.ts)
 * only carries out the plan made here.
 *
 * What Medusa 2.22.6 puts in the event (@medusajs/core-flows, generate-reset-password-token.js):
 * `entity_id` (the identifier exactly as the request gave it; it matched an existing emailpass
 * identity, so it is that account's email as stored), `actor_type` (the `:actor_type` of the
 * route, whatever the caller wrote there), `token` (a JWT signed with JWT_SECRET, with `iat` and
 * `exp` 900 seconds apart) and `metadata` (whatever the request body sent; never used here).
 */
import type { PublicUrls } from "../config/public-urls"

/** The Notification Module template our reset email uses. */
export const PASSWORD_RESET_TEMPLATE = "password-reset"

/** The storefront's page; the storefront adds the country to the path itself. */
export const CUSTOMER_RESET_PAGE = "/account/reset-password"

/**
 * The admin's own page in Medusa's dashboard: route `/reset-password` under the admin path `/app`
 * (Medusa's default; our config does not change it). It reads `token` from the query and shows
 * the email from inside the token; `email` is added for the same shape as the customer's link.
 */
export const ADMIN_RESET_PAGE = "/app/reset-password"

/** The reset page for each actor type that has one. Any other actor type gets no link. */
const RESET_PAGES = {
  customer: { base: "storefrontUrl", page: CUSTOMER_RESET_PAGE },
  user: { base: "backendUrl", page: ADMIN_RESET_PAGE },
} as const satisfies Record<string, { base: keyof PublicUrls; page: string }>

export type ResetActorType = keyof typeof RESET_PAGES

export function isResetActorType(actorType: unknown): actorType is ResetActorType {
  return typeof actorType === "string" && Object.prototype.hasOwnProperty.call(RESET_PAGES, actorType)
}

/**
 * The reset link for an actor type, email and token: `<base><page>?token=<token>&email=<email>`,
 * both values percent-encoded with encodeURIComponent (a `+` becomes %2B, a space %20, `&` %26,
 * non-Latin letters their UTF-8 bytes). Undefined for an actor type without a reset page, and for
 * an email or token that cannot be encoded (a lone UTF-16 surrogate).
 */
export function resetPasswordLink(
  input: { actorType: unknown; email: string; token: string },
  urls: PublicUrls
): string | undefined {
  if (!isResetActorType(input.actorType)) {
    return undefined
  }
  const { base, page } = RESET_PAGES[input.actorType]
  let token: string
  let email: string
  try {
    token = encodeURIComponent(input.token)
    email = encodeURIComponent(input.email)
  } catch {
    return undefined
  }
  return `${urls[base]}${page}?token=${token}&email=${email}`
}

/**
 * How long a reset token lasts, in whole minutes (rounded down), read from the token itself:
 * its `exp` minus its `iat`. Medusa fixes the lifetime in its workflow (15 minutes in 2.22.6) and
 * offers no setting for it, so the token is the one place that always tells the truth. Undefined
 * when the token is not a JWT with numeric `iat` and `exp`, `exp` after `iat`.
 * The signature is not checked: the token comes from Medusa's own event, not from a request.
 */
export function tokenLifetimeMinutes(token: string): number | undefined {
  const parts = token.split(".")
  if (parts.length !== 3) {
    return undefined
  }
  let claims: unknown
  try {
    claims = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"))
  } catch {
    return undefined
  }
  if (typeof claims !== "object" || claims === null) {
    return undefined
  }
  const { iat, exp } = claims as { iat?: unknown; exp?: unknown }
  if (typeof iat !== "number" || typeof exp !== "number" || !Number.isFinite(iat) || !Number.isFinite(exp)) {
    return undefined
  }
  if (exp <= iat) {
    return undefined
  }
  return Math.floor((exp - iat) / 60)
}

/**
 * The part of an email after its last `@`, for a log line: lower case, every character other
 * than a-z, 0-9, `.` and `-` replaced by `?`, at most 253 characters. Never the part before the @.
 */
export function emailDomainForLog(email: string): string {
  const at = email.lastIndexOf("@")
  const domain = at >= 0 ? email.slice(at + 1).trim().toLowerCase() : ""
  if (!domain) {
    return "(no domain)"
  }
  return domain.replace(/[^a-z0-9.-]/g, "?").slice(0, 253)
}

/** What the subscriber does for one `auth.password_reset` event. */
export type PasswordResetPlan =
  | {
      action: "send"
      notification: {
        to: string
        channel: string
        template: string
        trigger_type: string
        data: {
          link: string
          email: string
          actor_type: ResetActorType
          expires_in_minutes: number
        }
      }
    }
  /** Production without an email provider: nothing is sent; `warning` is logged once. */
  | { action: "withhold"; warning: string }
  /** Nothing to send; `reason` is logged (it names neither the email nor the token). */
  | { action: "skip"; reason: string }

export type PasswordResetEventData = {
  entity_id?: unknown
  actor_type?: unknown
  token?: unknown
}

/** The event's name in Medusa (AuthWorkflowEvents.PASSWORD_RESET). */
export const PASSWORD_RESET_EVENT = "auth.password_reset"

function describeActorType(actorType: unknown): string {
  return typeof actorType === "string"
    ? JSON.stringify(actorType.slice(0, 40))
    : `of type ${typeof actorType}`
}

/**
 * The plan for one `auth.password_reset` event. `mayLog` is mayLogResetLink (email-delivery.ts):
 * when false (production without an email provider) nothing is sent and the warning names the
 * email's domain at most; never the token or the link.
 */
export function planPasswordReset(
  event: PasswordResetEventData,
  options: { urls: PublicUrls; mayLog: boolean; channel: string }
): PasswordResetPlan {
  const { entity_id: email, actor_type: actorType, token } = event
  if (!isResetActorType(actorType)) {
    return {
      action: "skip",
      reason: `Password reset asked for actor type ${describeActorType(actorType)}, which has no reset page: no link sent.`,
    }
  }
  if (typeof email !== "string" || email.trim() === "" || typeof token !== "string" || token === "") {
    return {
      action: "skip",
      reason: `Password reset event for actor type ${describeActorType(actorType)} without an email or token: no link sent.`,
    }
  }
  if (!options.mayLog) {
    return {
      action: "withhold",
      warning:
        `Password reset link for a ${actorType} account at ${emailDomainForLog(email)} was not sent: ` +
        "no email provider is configured, and outside development and test the link is never " +
        "written to the log. Password reset does not work until an email provider is connected.",
    }
  }
  const minutes = tokenLifetimeMinutes(token)
  const link = resetPasswordLink({ actorType, email, token }, options.urls)
  if (minutes === undefined || link === undefined) {
    return {
      action: "skip",
      reason: `Password reset for a ${actorType} account at ${emailDomainForLog(email)}: the token or email could not be written into a link; no link sent.`,
    }
  }
  return {
    action: "send",
    notification: {
      to: email,
      channel: options.channel,
      template: PASSWORD_RESET_TEMPLATE,
      trigger_type: PASSWORD_RESET_EVENT,
      data: { link, email, actor_type: actorType, expires_in_minutes: minutes },
    },
  }
}
