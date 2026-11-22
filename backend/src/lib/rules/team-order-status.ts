/**
 * The status flow of a team order (dev-plan.md, M2): who may make each step, and what each status
 * allows. Plain TypeScript, no Medusa imports.
 *
 *   draft -> proof_sent -> approved -> deposit_paid -> in_production -> balance_due -> shipped
 *
 * and two ways back to `draft` (the organizer changes something): from `proof_sent` (before
 * signing) and from `approved` (after signing, before any payment).
 *
 * Only the organizer's steps have routes in M2-2. The steps of the payment system and of the admin
 * are listed here so the flow is in one place; the store routes refuse them (they ask `mayStep("organizer", ...)`), and
 * the admin pages (next part) and the payments (M3) call them.
 */

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

/** Who makes a step. `system` is the payment system (a payment arrives). */
export type Actor = "organizer" | "admin" | "system"

export type Step = {
  from: TeamOrderStatus
  to: TeamOrderStatus
  /** Short name of the step. */
  name: "make_proof" | "withdraw_proof" | "sign_proof" | "reopen" | "pay_deposit" | "start_production" | "ask_balance" | "ship"
  by: readonly Actor[]
}

export const STEPS: readonly Step[] = [
  { from: "draft", to: "proof_sent", name: "make_proof", by: ["organizer"] },
  { from: "proof_sent", to: "draft", name: "withdraw_proof", by: ["organizer"] },
  { from: "proof_sent", to: "approved", name: "sign_proof", by: ["organizer"] },
  // Only while nothing is paid: `approved` is before the deposit, so no payment can exist yet.
  { from: "approved", to: "draft", name: "reopen", by: ["organizer"] },
  { from: "approved", to: "deposit_paid", name: "pay_deposit", by: ["system"] },
  { from: "deposit_paid", to: "in_production", name: "start_production", by: ["admin"] },
  { from: "in_production", to: "balance_due", name: "ask_balance", by: ["admin"] },
  // The balance must be paid first; the payments milestone adds that check where the step is made.
  { from: "balance_due", to: "shipped", name: "ship", by: ["admin"] },
]

export function isStatus(value: unknown): value is TeamOrderStatus {
  return typeof value === "string" && (TEAM_ORDER_STATUSES as readonly string[]).includes(value)
}

/** The step from one status to another, or undefined when the flow has none. */
export function stepBetween(from: TeamOrderStatus, to: TeamOrderStatus): Step | undefined {
  return STEPS.find((step) => step.from === from && step.to === to)
}

/** True when `actor` may move a team order from `from` to `to`. */
export function mayStep(actor: Actor, from: TeamOrderStatus, to: TeamOrderStatus): boolean {
  return stepBetween(from, to)?.by.includes(actor) ?? false
}

/** The steps `actor` may make from `status`. */
export function stepsFor(actor: Actor, status: TeamOrderStatus): Step[] {
  return STEPS.filter((step) => step.from === status && step.by.includes(actor))
}

/** What a team order in this status allows. One source of truth for every lock. */
export type Allowed = {
  /** Change the team list (a saved list, a line). */
  editList: boolean
  /** Rename the team, or point the order at another design version. */
  editTeam: boolean
  /** Set the need-by date and the rush choice. */
  editSchedule: boolean
  /** Delete the team order. */
  delete: boolean
  /** A proof exists and the list it shows is frozen. */
  listFrozen: boolean
}

const DRAFT: Allowed = { editList: true, editTeam: true, editSchedule: true, delete: true, listFrozen: false }
const PROOF_OUT: Allowed = { editList: false, editTeam: false, editSchedule: true, delete: false, listFrozen: true }
const FROZEN: Allowed = { editList: false, editTeam: false, editSchedule: false, delete: false, listFrozen: true }

export function allowedIn(status: TeamOrderStatus): Allowed {
  if (status === "draft") return DRAFT
  if (status === "proof_sent") return PROOF_OUT
  return FROZEN
}

/**
 * The status of the proof a team order currently holds: `sent` (made, not signed), `signed`; a
 * proof that was taken back is `withdrawn` (it was only sent) or `replaced` (it was signed), and
 * is kept for ever.
 */
export const PROOF_STATUSES = ["sent", "signed", "withdrawn", "replaced"] as const
export type ProofStatus = (typeof PROOF_STATUSES)[number]

/** The proof is the one the order currently holds. */
export const isCurrentProofStatus = (status: ProofStatus): boolean => status === "sent" || status === "signed"

/** The proof status a team order in `status` holds as its current proof, or null (no proof out). */
export function currentProofStatusFor(status: TeamOrderStatus): ProofStatus | null {
  if (status === "draft") return null
  return status === "proof_sent" ? "sent" : "signed"
}
