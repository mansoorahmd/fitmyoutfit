import {
  actionFor,
  actorLabel,
  adminActions,
  balanceNoteRecord,
  buildStepRecord,
  BALANCE_BY_HAND,
  isAdminActionId,
} from "../team-order-steps"
import { mayStepByHand, TEAM_ORDER_STATUSES } from "../team-order-status"

describe("buildStepRecord", () => {
  it("records an organizer's step with its flow name", () => {
    expect(buildStepRecord({ from: "draft", to: "proof_sent", actor: "organizer", actorId: "cus_1" })).toEqual({
      ok: true,
      record: { stepName: "make_proof", from: "draft", to: "proof_sent", actor: "organizer", actorId: "cus_1", byHand: false },
    })
    const reopen = buildStepRecord({ from: "approved", to: "draft", actor: "organizer", actorId: "cus_1" })
    expect(reopen.ok && reopen.record.stepName).toBe("reopen")
  })

  it("records an admin's step, and the deposit only as a by-hand step", () => {
    const start = buildStepRecord({ from: "deposit_paid", to: "in_production", actor: "admin", actorId: "user_1" })
    expect(start.ok && start.record).toMatchObject({ stepName: "start_production", actor: "admin", byHand: false })
    expect(buildStepRecord({ from: "approved", to: "deposit_paid", actor: "admin", actorId: "user_1" })).toEqual({
      ok: false,
      problem: "actor_not_allowed",
    })
    const deposit = buildStepRecord({ from: "approved", to: "deposit_paid", actor: "admin", actorId: "user_1", byHand: true })
    expect(deposit.ok && deposit.record).toMatchObject({ stepName: "pay_deposit", actor: "admin", actorId: "user_1", byHand: true })
  })

  it("the system's payment step has no id for who", () => {
    const paid = buildStepRecord({ from: "approved", to: "deposit_paid", actor: "system" })
    expect(paid.ok && paid.record).toMatchObject({ actor: "system", actorId: null })
    expect(buildStepRecord({ from: "approved", to: "deposit_paid", actor: "system", actorId: "x" })).toEqual({
      ok: false,
      problem: "actor_id_not_expected",
    })
  })

  it("refuses a step the flow does not have, or one this actor may not make", () => {
    expect(buildStepRecord({ from: "draft", to: "shipped", actor: "admin", actorId: "u" })).toEqual({ ok: false, problem: "unknown_step" })
    expect(buildStepRecord({ from: "shipped", to: "draft", actor: "organizer", actorId: "c" })).toEqual({ ok: false, problem: "unknown_step" })
    expect(buildStepRecord({ from: "balance_due", to: "shipped", actor: "organizer", actorId: "c" })).toEqual({
      ok: false,
      problem: "actor_not_allowed",
    })
    expect(buildStepRecord({ from: "draft", to: "proof_sent", actor: "admin", actorId: "u" })).toEqual({
      ok: false,
      problem: "actor_not_allowed",
    })
  })

  it("refuses by hand a step that has no by-hand form, and a person without an id", () => {
    expect(buildStepRecord({ from: "balance_due", to: "shipped", actor: "admin", actorId: "u", byHand: true })).toEqual({
      ok: false,
      problem: "not_a_by_hand_step",
    })
    expect(buildStepRecord({ from: "deposit_paid", to: "in_production", actor: "admin", actorId: null })).toEqual({
      ok: false,
      problem: "actor_id_missing",
    })
    expect(buildStepRecord({ from: "draft", to: "proof_sent", actor: "organizer", actorId: "" })).toEqual({
      ok: false,
      problem: "actor_id_missing",
    })
  })
})

describe("the balance note", () => {
  it("is an admin's by-hand record on balance_due that changes no status", () => {
    expect(balanceNoteRecord("user_1")).toEqual({
      stepName: BALANCE_BY_HAND,
      from: "balance_due",
      to: "balance_due",
      actor: "admin",
      actorId: "user_1",
      byHand: true,
    })
  })
})

describe("adminActions: only the steps the rules allow are offered", () => {
  const ids = (status: (typeof TEAM_ORDER_STATUSES)[number], money: { depositPaid?: boolean; balancePaid?: boolean } = {}) =>
    adminActions(status, money).map((a) => a.id)

  it("offers nothing before the proof is signed, and nothing after shipping", () => {
    expect(ids("draft")).toEqual([])
    expect(ids("proof_sent")).toEqual([])
    expect(ids("shipped")).toEqual([])
  })

  it("one step at a time along the flow", () => {
    expect(ids("approved")).toEqual(["deposit_by_hand"])
    expect(ids("deposit_paid")).toEqual(["start_production"])
    expect(ids("in_production")).toEqual(["ask_balance"])
    expect(ids("balance_due")).toEqual(["balance_by_hand"])
  })

  it("shipping is offered only once the balance is paid, and the by-hand balance only while it is not", () => {
    expect(ids("balance_due", { balancePaid: false })).toEqual(["balance_by_hand"])
    expect(ids("balance_due", { balancePaid: true })).toEqual(["ship"])
    expect(actionFor("ship", "balance_due")).toBeUndefined()
    expect(actionFor("ship", "balance_due", { balancePaid: true })?.to).toBe("shipped")
  })

  it("the deposit by hand is not offered once the deposit is paid (the system step follows)", () => {
    expect(ids("approved", { depositPaid: true })).toEqual([])
  })

  it("the by-hand buttons say so in their labels", () => {
    expect(actionFor("deposit_by_hand", "approved")).toMatchObject({
      label: "Mark the deposit as received by hand",
      to: "deposit_paid",
      byHand: true,
    })
    expect(actionFor("balance_by_hand", "balance_due")).toMatchObject({
      label: "Mark the balance as received by hand",
      to: "balance_due",
      byHand: true,
    })
    expect(actionFor("ship", "balance_due", { balancePaid: true })?.byHand).toBe(false)
  })

  it("every button asks for a confirmation, and every offered step is one the flow allows the admin", () => {
    for (const status of TEAM_ORDER_STATUSES) {
      for (const action of [...adminActions(status), ...adminActions(status, { balancePaid: true })]) {
        expect(action.confirm.length).toBeGreaterThan(10)
        if (action.id === "balance_by_hand") {
          expect(action.to).toBe(status)
        } else if (action.byHand) {
          expect(mayStepByHand("admin", status, action.to)).toBe(true)
        } else {
          const built = buildStepRecord({ from: status, to: action.to, actor: "admin", actorId: "u" })
          expect(built.ok).toBe(true)
        }
      }
    }
  })

  it("a step that is not offered for the status gives no action", () => {
    expect(actionFor("ship", "in_production")).toBeUndefined()
    expect(actionFor("start_production", "approved")).toBeUndefined()
    expect(actionFor("balance_by_hand", "balance_due", { balancePaid: true })).toBeUndefined()
  })
})

describe("small helpers", () => {
  it("knows the action ids and names who made a step", () => {
    expect(isAdminActionId("ship")).toBe(true)
    expect(isAdminActionId("delete")).toBe(false)
    expect(isAdminActionId(undefined)).toBe(false)
    expect(actorLabel("organizer")).toBe("Organizer")
    expect(actorLabel("admin")).toBe("Admin user")
    expect(actorLabel("system")).toBe("System")
  })
})
