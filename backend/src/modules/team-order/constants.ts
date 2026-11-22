/** The module name in the Medusa container. */
export const TEAM_ORDER_MODULE = "teamOrder"

/** The status flow of dev-plan.md (M2) lives in one place, the plain rule module; re-exported here. */
export { TEAM_ORDER_STATUSES, type TeamOrderStatus } from "../../lib/rules/team-order-status"

/** The statuses of a proof (see lib/rules/team-order-status.ts). */
export { PROOF_STATUSES, type ProofStatus } from "../../lib/rules/team-order-status"
