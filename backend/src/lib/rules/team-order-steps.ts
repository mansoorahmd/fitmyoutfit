/**
 * The record of status steps and the admin's buttons. Plain TypeScript, no Medusa imports; the flow
 * itself (who may make which step) is in team-order-status.ts and is the only source of truth.
 *
 * A step is recorded with who made it (`organizer`, `admin` or `system`), from, to, and when (the
 * database stamps the time). `buildStepRecord` refuses a record the flow does not allow, so a wrong
 * record cannot be made from code by mistake.
 *
 * The admin's buttons (`adminActions`) are the steps the admin may make from a status and, because
 * payments do not exist yet, two by-hand steps clearly labelled as such: the deposit marked as
 * received (`approved -> deposit_paid`) and the balance marked as received (a note on an order in
 * `balance_due`: there is no status between `balance_due` and `shipped`, so it changes no status).
 * A step the rules refuse is not offered.
 */
import { mayStep, mayStepByHand, stepBetween, type Actor, type TeamOrderStatus } from "./team-order-status"

/** The step name of the balance note (not a flow step: the status stays `balance_due`). */
export const BALANCE_BY_HAND = "balance_received_by_hand"

export type StepRecord = {
  stepName: string
  from: TeamOrderStatus
  to: TeamOrderStatus
  actor: Actor
  /** Customer id (organizer), user id (admin); null for the system. */
  actorId: string | null
  byHand: boolean
}

export type StepRecordProblem =
  | "unknown_step"
  | "actor_not_allowed"
  | "not_a_by_hand_step"
  | "actor_id_missing"
  | "actor_id_not_expected"

/** The record to store for a step, or why it is not one: the flow has no such step, or this actor may not make it. */
export function buildStepRecord(input: {
  from: TeamOrderStatus
  to: TeamOrderStatus
  actor: Actor
  actorId?: string | null
  byHand?: boolean
}): { ok: true; record: StepRecord } | { ok: false; problem: StepRecordProblem } {
  const step = stepBetween(input.from, input.to)
  if (!step) return { ok: false, problem: "unknown_step" }
  const byHand = input.byHand === true
  if (byHand) {
    if (!mayStepByHand(input.actor, input.from, input.to)) return { ok: false, problem: "not_a_by_hand_step" }
  } else if (!mayStep(input.actor, input.from, input.to)) {
    return { ok: false, problem: "actor_not_allowed" }
  }
  const actorId = input.actorId ?? null
  if (input.actor !== "system" && (actorId === null || actorId === "")) return { ok: false, problem: "actor_id_missing" }
  if (input.actor === "system" && actorId !== null) return { ok: false, problem: "actor_id_not_expected" }
  return {
    ok: true,
    record: { stepName: step.name, from: input.from, to: input.to, actor: input.actor, actorId, byHand },
  }
}

/** The record of the balance note: an admin, on an order in `balance_due`, by hand, no status change. */
export function balanceNoteRecord(adminId: string): StepRecord {
  return { stepName: BALANCE_BY_HAND, from: "balance_due", to: "balance_due", actor: "admin", actorId: adminId, byHand: true }
}

export const ADMIN_ACTION_IDS = ["deposit_by_hand", "start_production", "ask_balance", "balance_by_hand", "ship"] as const
export type AdminActionId = (typeof ADMIN_ACTION_IDS)[number]

export function isAdminActionId(value: unknown): value is AdminActionId {
  return typeof value === "string" && (ADMIN_ACTION_IDS as readonly string[]).includes(value)
}

export type AdminAction = {
  id: AdminActionId
  /** The status the order moves to (the same status for the balance note). */
  to: TeamOrderStatus
  label: string
  /** The sentence the confirmation asks, in the admin's wording. */
  confirm: string
  byHand: boolean
}

type ActionDef = AdminAction & { from: TeamOrderStatus }

const DEFS: readonly ActionDef[] = [
  {
    id: "deposit_by_hand",
    from: "approved",
    to: "deposit_paid",
    label: "Mark the deposit as received by hand",
    confirm:
      "Mark the deposit as received? Payments are not built yet, so nothing is checked: this records that you confirmed the deposit arrived outside the store.",
    byHand: true,
  },
  {
    id: "start_production",
    from: "deposit_paid",
    to: "in_production",
    label: "Start production",
    confirm: "Move this order to production?",
    byHand: false,
  },
  {
    id: "ask_balance",
    from: "in_production",
    to: "balance_due",
    label: "Ask for the balance",
    confirm: "Move this order to balance due? The organizer is emailed that the balance is due.",
    byHand: false,
  },
  {
    id: "balance_by_hand",
    from: "balance_due",
    to: "balance_due",
    label: "Mark the balance as received by hand",
    confirm:
      "Mark the balance as received? Payments are not built yet, so nothing is checked: this records that you confirmed the balance arrived outside the store. The status stays balance due.",
    byHand: true,
  },
  {
    id: "ship",
    from: "balance_due",
    to: "shipped",
    label: "Mark as shipped",
    confirm: "Mark this order as shipped? This cannot be undone.",
    byHand: false,
  },
]

function isOffered(def: ActionDef, status: TeamOrderStatus, balanceNoted: boolean): boolean {
  if (def.from !== status) return false
  if (def.id === "balance_by_hand") return !balanceNoted
  return def.byHand ? mayStepByHand("admin", def.from, def.to) : mayStep("admin", def.from, def.to)
}

/** The buttons to show an admin for an order in `status`. `balanceNoted`: the balance was already marked. */
export function adminActions(status: TeamOrderStatus, balanceNoted = false): AdminAction[] {
  return DEFS.filter((def) => isOffered(def, status, balanceNoted)).map((def) => ({
    id: def.id,
    to: def.to,
    label: def.label,
    confirm: def.confirm,
    byHand: def.byHand,
  }))
}

/** The action for an id, if the rules offer it for `status` now; else undefined. */
export function actionFor(id: AdminActionId, status: TeamOrderStatus, balanceNoted = false): AdminAction | undefined {
  return adminActions(status, balanceNoted).find((a) => a.id === id)
}

/** A short name for who made a step, for the admin page. */
export function actorLabel(actor: Actor): string {
  return actor === "organizer" ? "Organizer" : actor === "admin" ? "Admin user" : "System"
}
