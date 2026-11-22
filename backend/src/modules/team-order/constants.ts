/** The module's name in Medusa's container. No imports, so plain code and tests can use it. */
export const TEAM_ORDER_MODULE = "teamOrder"

/** The status flow of dev-plan.md (M2). Only `draft` is used in M2-1; the rest come with the proof. */
export const TEAM_ORDER_STATUSES = [
  "draft",
  "proof_sent",
  "approved",
  "deposit_paid",
  "in_production",
  "balance_due",
  "shipped",
] as const

export type TeamOrderStatus = (typeof TEAM_ORDER_STATUSES)[number]
