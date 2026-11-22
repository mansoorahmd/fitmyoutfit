/**
 * The record of status steps and the admin's buttons. Plain TypeScript, no Medusa imports; the flow
 * itself (who may make which step) is in team-order-status.ts and is the only source of truth.
 *
 * A step is recorded with who made it (`organizer`, `admin` or `system`), from, to, and when (the
 * database stamps the time). `buildStepRecord` refuses a record the flow does not allow, so a wrong
 * record cannot be made from code by mistake.
 *
 * The admin's buttons (`adminActions`) are the steps the admin may make from a status and, until
 * real gateways exist, two by-hand payment steps clearly labelled as such (decision 016): the deposit
 * received by hand (it captures the placeholder payment of the deposit in the admin's name, and the
 * order moves `approved -> deposit_paid`) and the balance received by hand (it captures the
 * balance's placeholder payment; a record on an order in `balance_due`, no status change). Each is
 * offered only while its part is not paid. **"Mark as shipped" is offered only once the balance is
 * paid** (lib/rules/team-order-payments.ts, `mayShip`). A step the rules refuse is not offered.
 */
import { BALANCE_PAID } from "./team-order-payments"
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

/** The record that the organizer's balance payment arrived: the system, on an order in `balance_due`, no status change. */
export function balancePaidRecord(): StepRecord {
  return { stepName: BALANCE_PAID, from: "balance_due", to: "balance_due", actor: "system", actorId: null, byHand: false }
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
      "Mark the deposit as received? This records a payment of the deposit's amount in your name (the placeholder payment, until a real gateway exists) and moves the order to deposit paid. Only do this when the deposit arrived outside the store.",
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
      "Mark the balance as received? This records a payment of the balance's amount in your name (the placeholder payment, until a real gateway exists). The status stays balance due, and the order can then be shipped. Only do this when the balance arrived outside the store.",
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

/** What the order's money says, for the buttons: whether the deposit and the balance are paid. */
export type MoneyFacts = { depositPaid?: boolean; balancePaid?: boolean }

function isOffered(def: ActionDef, status: TeamOrderStatus, money: MoneyFacts): boolean {
  if (def.from !== status) return false
  if (def.id === "deposit_by_hand" && money.depositPaid) return false
  if (def.id === "balance_by_hand") return money.balancePaid !== true
  // The balance must be paid before the order ships (decision 016).
  if (def.id === "ship" && money.balancePaid !== true) return false
  return def.byHand ? mayStepByHand("admin", def.from, def.to) : mayStep("admin", def.from, def.to)
}

/** The buttons to show an admin for an order in `status`, given what is paid. */
export function adminActions(status: TeamOrderStatus, money: MoneyFacts = {}): AdminAction[] {
  return DEFS.filter((def) => isOffered(def, status, money)).map((def) => ({
    id: def.id,
    to: def.to,
    label: def.label,
    confirm: def.confirm,
    byHand: def.byHand,
  }))
}

/** The action for an id, if the rules offer it for `status` now; else undefined. */
export function actionFor(id: AdminActionId, status: TeamOrderStatus, money: MoneyFacts = {}): AdminAction | undefined {
  return adminActions(status, money).find((a) => a.id === id)
}

/** A short name for who made a step, for the admin page. */
export function actorLabel(actor: Actor): string {
  return actor === "organizer" ? "Organizer" : actor === "admin" ? "Admin user" : "System"
}
