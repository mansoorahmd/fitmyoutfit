/**
 * What the seed must do so the local admin can log in. Plain TypeScript, no Medusa imports.
 *
 * A working admin login is three things: a user with the email, an `emailpass` auth identity for
 * the email, and the identity's `app_metadata.user_id` pointing at the user. A seed run that
 * stopped half-way can leave any of them missing, so each one is checked on every run.
 * An existing password is never changed (an admin may have changed it).
 */
import { isLocalNodeEnv } from "../../lib/config/node-env"

export type AdminUserState = {
  /** Id of the user with the admin email, or null when there is none. */
  userId: string | null
  /** Id of the emailpass auth identity for the admin email, or null when there is none. */
  authIdentityId: string | null
  /** The user id that identity is linked to (its app_metadata.user_id), if any. */
  linkedUserId: string | null
}

export type AdminUserPlan =
  /** NODE_ENV is not development or test (production, prod, staging, ...). */
  | { skip: "not-local" }
  | {
      skip: null
      createUser: boolean
      /** Register an emailpass identity with the configured password. */
      createLogin: boolean
      /** Point the identity's app_metadata.user_id at the user. */
      link: boolean
    }

/**
 * The dev admin user is created only in local development and tests (NODE_ENV unset,
 * `development` or `test`). Never in production (`production` or `prod`, any case), and not in
 * staging or any other environment either: there an admin is created on purpose, with
 * `medusa user`, not from the dev defaults.
 */
export function devAdminAllowed(nodeEnv: string | undefined): boolean {
  return isLocalNodeEnv(nodeEnv)
}

export function planAdminUser(state: AdminUserState, nodeEnv: string | undefined): AdminUserPlan {
  if (!devAdminAllowed(nodeEnv)) {
    return { skip: "not-local" }
  }
  const createUser = state.userId === null
  const createLogin = state.authIdentityId === null
  // A new user or a new identity always needs the link; an existing pair only when the identity
  // points at no user or another one.
  const link = createUser || createLogin || state.linkedUserId !== state.userId
  return { skip: null, createUser, createLogin, link }
}

/** True when the plan changes nothing. */
export function isNoop(plan: AdminUserPlan): boolean {
  return plan.skip !== null || (!plan.createUser && !plan.createLogin && !plan.link)
}
