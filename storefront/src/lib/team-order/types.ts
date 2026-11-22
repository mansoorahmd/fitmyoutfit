// The shapes of the team-order pages and of the designer's saving, in the
// storefront's own camelCase (docs/contracts/m2-team-orders.md says what the
// backend sends: snake_case). `map.ts` is the one place that turns one into
// the other. Plain types, no code.

import type { RosterLimits, RosterLine, RosterNote, RosterProblem, RosterSummary } from "@fitmyoutfit/team-rules"

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

export type ScheduleState = "none" | "ok" | "needs_rush" | "cannot_be_met"

/** The need-by date worked out by the backend as of its "today" (contract section 4). */
export type ScheduleView = {
  state: ScheduleState
  needByDate: string | null
  today: string
  days: { standard: number; rush: number }
  latestSignStandard: string | null
  latestSignRush: string | null
  daysLeftStandard: number | null
  daysLeftRush: number | null
}

export const PROOF_STATUSES = ["sent", "signed", "withdrawn", "replaced"] as const
export type ProofStatus = (typeof PROOF_STATUSES)[number]

/** A roster proof without its snapshot (contract section 3). */
export type ProofView = {
  id: string
  teamOrderId: string
  /** 1, 2, ... within the team order. */
  number: number
  status: ProofStatus
  /** SHA-256 of the canonical snapshot text: what a signature carries. */
  hash: string
  designVersionId: string
  listVersion: number
  createdAt: string
  closedAt: string | null
  signedName: string | null
  signedAt: string | null
  /** The schedule as it was at signing. */
  scheduleState: ScheduleState | null
  needByDate: string | null
  rush: boolean | null
  promisedDeliveryDate: string | null
}

/** A line of a proof's snapshot, as frozen. */
export type ProofLine = { name: string; number: string; size: string; count: number; noName: boolean; noNumber: boolean }

/** What a proof froze (the snapshot, read into camelCase). */
export type ProofSnapshotView = {
  format: number
  designVersionId: string
  productId: string
  regionId: string
  teamName: string
  prints: { name: boolean; number: boolean }
  lines: ProofLine[]
}

/** One proof with its snapshot: the page is built from this, never from the live list. */
export type ProofDetail = ProofView & {
  snapshot: ProofSnapshotView
  /** The canonical text whose SHA-256 is `hash`. */
  snapshotText: string
  /** The snapshot as the server sent it (API names), for checking the hash. */
  rawSnapshot: unknown
}

/** A line as the editor holds it: the rules package's line with an id. */
export type EditorLine = RosterLine & { id: string }

/** The contract's "whole read answer", read into one object. */
export type TeamOrderView = {
  id: string
  teamName: string
  status: TeamOrderStatus
  kind: "order" | "add_on" | "reorder"
  designId: string
  designVersionId: string
  productId: string
  regionId: string
  needByDate: string | null
  rushRequested: boolean
  prints: { name: boolean; number: boolean }
  /** The list's version: what a save is made from. */
  listVersion: number
  createdAt: string
  /** The product's sizes, in the product's order. */
  sizes: string[]
  lines: EditorLine[]
  problems: RosterProblem[]
  notes: RosterNote[]
  summary: RosterSummary
  /** Only the limits the server sent. */
  limits: Partial<RosterLimits>
  schedule: ScheduleView
  /** The proof the order holds now: the one out while `proof_sent`, the signed one from `approved` on, null in a draft. */
  currentProof: ProofView | null
}

/** One entry of the list of the customer's team orders. */
export type TeamOrderListItem = {
  id: string
  teamName: string
  status: TeamOrderStatus
  kind: "order" | "add_on" | "reorder"
  productId: string
  regionId: string
  needByDate: string | null
  players: number
  pieces: number
  createdAt: string
}

/** Why a call to the backend did not give what was asked for. Never a message of the backend's. */
export type Failure =
  /** 401: no sign-in, or it has ended. */
  | { kind: "signed_out" }
  /** 404: unknown, or another customer's. */
  | { kind: "not_found" }
  /** 409 roster_version_stale: the list was saved elsewhere since. */
  | { kind: "stale"; currentVersion: number }
  /** Any other refusal of the backend: its machine code, and the extras the page may use. */
  | { kind: "refused"; status: number; code: string; extra?: Record<string, unknown> }
  /** No answer, a 5xx, or an answer the storefront cannot read. */
  | { kind: "unavailable" }

export type Outcome<T> = { ok: true; value: T } | { ok: false; failure: Failure }
