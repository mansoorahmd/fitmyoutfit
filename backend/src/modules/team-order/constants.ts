/** The module name in the Medusa container. */
export const TEAM_ORDER_MODULE = "teamOrder"

/** The status flow of dev-plan.md (M2) lives in one place, the plain rule module; re-exported here. */
export { TEAM_ORDER_STATUSES, type TeamOrderStatus } from "../../lib/rules/team-order-status"

/** The statuses of a proof (see lib/rules/team-order-status.ts). */
export { PROOF_STATUSES, type ProofStatus } from "../../lib/rules/team-order-status"

/** What a team order is: an ordinary order, a late joiner's add-on, or a reorder (lib/rules/team-order-links.ts). */
export { TEAM_ORDER_KINDS, type TeamOrderKind } from "../../lib/rules/team-order-links"

/** The kinds of email the team-order module records (lib/rules/team-order-emails.ts). */
export { TEAM_ORDER_EMAIL_KINDS, type TeamOrderEmailKind } from "../../lib/rules/team-order-emails"

/** Who makes a status step (lib/rules/team-order-status.ts). */
export { STEP_ACTORS } from "../../lib/rules/team-order-status"
