import {
  STEPS,
  TEAM_ORDER_STATUSES,
  allowedIn,
  currentProofStatusFor,
  isCurrentProofStatus,
  isStatus,
  mayStep,
  stepBetween,
  stepsFor,
  type TeamOrderStatus,
} from "../team-order-status"

describe("the status flow", () => {
  it("goes draft, proof_sent, approved, deposit_paid, in_production, balance_due, shipped", () => {
    expect([...TEAM_ORDER_STATUSES]).toEqual([
      "draft",
      "proof_sent",
      "approved",
      "deposit_paid",
      "in_production",
      "balance_due",
      "shipped",
    ])
  })

  it("lets the organizer make the proof, take it back, sign it, and reopen a signed order", () => {
    expect(mayStep("organizer", "draft", "proof_sent")).toBe(true)
    expect(mayStep("organizer", "proof_sent", "draft")).toBe(true)
    expect(mayStep("organizer", "proof_sent", "approved")).toBe(true)
    expect(mayStep("organizer", "approved", "draft")).toBe(true)
  })

  it("keeps the payment and production steps from the organizer", () => {
    expect(mayStep("organizer", "approved", "deposit_paid")).toBe(false)
    expect(mayStep("organizer", "deposit_paid", "in_production")).toBe(false)
    expect(mayStep("organizer", "in_production", "balance_due")).toBe(false)
    expect(mayStep("organizer", "balance_due", "shipped")).toBe(false)
  })

  it("gives the deposit to the payment system and production and shipping to the admin", () => {
    expect(mayStep("system", "approved", "deposit_paid")).toBe(true)
    expect(mayStep("admin", "approved", "deposit_paid")).toBe(false)
    expect(mayStep("admin", "deposit_paid", "in_production")).toBe(true)
    expect(mayStep("admin", "in_production", "balance_due")).toBe(true)
    expect(mayStep("admin", "balance_due", "shipped")).toBe(true)
    expect(mayStep("system", "balance_due", "shipped")).toBe(false)
  })

  it("has no way back from a paid order and no skipped step", () => {
    for (const from of ["deposit_paid", "in_production", "balance_due", "shipped"] as TeamOrderStatus[]) {
      expect(stepBetween(from, "draft")).toBeUndefined()
    }
    expect(stepBetween("draft", "approved")).toBeUndefined()
    expect(stepBetween("draft", "shipped")).toBeUndefined()
    expect(stepBetween("proof_sent", "deposit_paid")).toBeUndefined()
    expect(stepBetween("shipped", "shipped")).toBeUndefined()
    expect(stepsFor("organizer", "shipped")).toEqual([])
    expect(stepsFor("admin", "draft")).toEqual([])
  })

  it("lists each step once and only between known statuses", () => {
    const keys = STEPS.map((s) => `${s.from}>${s.to}`)
    expect(new Set(keys).size).toBe(keys.length)
    for (const s of STEPS) {
      expect(isStatus(s.from) && isStatus(s.to)).toBe(true)
      expect(s.by.length).toBeGreaterThan(0)
    }
  })

  it("lists what the organizer may do from each status", () => {
    expect(stepsFor("organizer", "draft").map((s) => s.name)).toEqual(["make_proof"])
    expect(stepsFor("organizer", "proof_sent").map((s) => s.name)).toEqual(["withdraw_proof", "sign_proof"])
    expect(stepsFor("organizer", "approved").map((s) => s.name)).toEqual(["reopen"])
  })
})

describe("what each status allows", () => {
  it("lets the organizer change everything in draft", () => {
    expect(allowedIn("draft")).toEqual({ editList: true, editTeam: true, editSchedule: true, delete: true, listFrozen: false })
  })
  it("freezes the list, the team and the design while a proof is out, but not the schedule", () => {
    const a = allowedIn("proof_sent")
    expect(a.editList || a.editTeam || a.delete).toBe(false)
    expect(a.editSchedule).toBe(true)
    expect(a.listFrozen).toBe(true)
  })
  it("freezes everything from approval on", () => {
    for (const status of TEAM_ORDER_STATUSES.filter((s) => s !== "draft" && s !== "proof_sent")) {
      expect(allowedIn(status)).toEqual({ editList: false, editTeam: false, editSchedule: false, delete: false, listFrozen: true })
    }
  })
})

describe("the current proof", () => {
  it("is none in draft, sent while proof_sent and signed after", () => {
    expect(currentProofStatusFor("draft")).toBeNull()
    expect(currentProofStatusFor("proof_sent")).toBe("sent")
    for (const s of ["approved", "deposit_paid", "in_production", "balance_due", "shipped"] as TeamOrderStatus[]) {
      expect(currentProofStatusFor(s)).toBe("signed")
    }
  })
  it("is current only while sent or signed", () => {
    expect(isCurrentProofStatus("sent")).toBe(true)
    expect(isCurrentProofStatus("signed")).toBe(true)
    expect(isCurrentProofStatus("withdrawn")).toBe(false)
    expect(isCurrentProofStatus("replaced")).toBe(false)
  })
})
