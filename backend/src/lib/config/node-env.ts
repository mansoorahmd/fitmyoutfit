/**
 * The one place that answers "which kind of environment is this?" from NODE_ENV.
 * Plain TypeScript, no Medusa imports. Every check of NODE_ENV in the backend goes through here.
 *
 * Two questions, deliberately different:
 * - `isProductionNodeEnv`: does Medusa itself run in production mode? Medusa's rule is
 *   `["production", "prod"].includes(process.env.NODE_ENV)` (@medusajs/utils, is-production.js).
 *   We also trim and ignore case, so ` Production ` counts too.
 * - `isLocalNodeEnv`: is this a developer's machine or a test run, where the dev-only defaults
 *   from .env.example (and Medusa's `supersecret` fallback) may be used? Only when NODE_ENV is
 *   unset, `development` or `test`. Every other value (`staging`, `prod`, `qa`, a typo, ...)
 *   gets the production checks: real secrets required, no dev admin user.
 */

/** NODE_ENV trimmed and lower-cased; "" when unset or blank. */
export function normalizeNodeEnv(nodeEnv: string | undefined | null): string {
  return (nodeEnv ?? "").trim().toLowerCase()
}

/** True when Medusa runs in production mode: NODE_ENV is `production` or `prod`. */
export function isProductionNodeEnv(nodeEnv: string | undefined | null): boolean {
  return ["production", "prod"].includes(normalizeNodeEnv(nodeEnv))
}

/** NODE_ENV values under which dev-only defaults are allowed (unset counts as development). */
export const LOCAL_NODE_ENVS: readonly string[] = ["", "development", "test"]

/** True only for local development and tests; false for production, staging and anything else. */
export function isLocalNodeEnv(nodeEnv: string | undefined | null): boolean {
  return LOCAL_NODE_ENVS.includes(normalizeNodeEnv(nodeEnv))
}

/** How NODE_ENV is shown in messages: its raw value, or "(unset)". */
export function describeNodeEnv(nodeEnv: string | undefined | null): string {
  return nodeEnv === undefined || nodeEnv === null || nodeEnv.trim() === ""
    ? "(unset)"
    : JSON.stringify(nodeEnv)
}
