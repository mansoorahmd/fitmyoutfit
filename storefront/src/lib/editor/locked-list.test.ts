import { describe, expect, it } from "vitest"

import { apiAnswer, apiProof } from "@lib/team-order/fixtures"
import { parseTeamOrderAnswer } from "@lib/team-order/map"
import { catalogueFamily, currentFamily, withCurrentFonts } from "./proof-fonts"
import { lockedListPlan } from "./locked-list"

const order = (status: string, proof: Record<string, unknown> | null = null) =>
  parseTeamOrderAnswer(apiAnswer({ team_order: { status }, current_proof: proof ? apiProof(proof) : null }))!

describe("the locked list in the designer", () => {
  it("a signed proof: the editor's own sentence with the signing date, and Change the list", () => {
    expect(lockedListPlan(order("approved", { status: "signed", signed_at: "2026-11-23T09:30:00.000Z", signed_name: "A" }))).toEqual({
      signedOn: "23 November 2026",
      note: "signed",
      canChange: true,
    })
  })
  it("a proof that is out: its own sentence, and Change the list (it withdraws the proof)", () => {
    const plan = lockedListPlan(order("proof_sent", { status: "sent" }))
    expect(plan).toMatchObject({ note: "plain", canChange: true })
    expect(plan.signedOn).toContain("Changing the list withdraws the proof")
  })
  it("after the deposit the organizer cannot go back: the status, and no Change the list", () => {
    for (const status of ["deposit_paid", "in_production", "balance_due", "shipped"]) {
      const plan = lockedListPlan(order(status, { status: "signed", signed_at: "2026-11-23T09:30:00.000Z", signed_name: "A" }))
      expect(plan.canChange, status).toBe(false)
      expect(plan.note).toBe("plain")
    }
  })
  it("a draft whose list the editor cannot open is read-only with nothing to change from here", () => {
    expect(lockedListPlan(order("draft"), { unreadable: true })).toMatchObject({ canChange: false, note: "plain", signedOn: expect.stringContaining("could not be opened") })
  })
})

describe("the fonts of a saved design", () => {
  const generated = { Oswald: "__Oswald_aaaaaa", "Noto Sans Arabic": "__Noto_Sans_Arabic_bbbbbb" }
  it("finds the catalogue's family under a generated name", () => {
    expect(catalogueFamily("__Noto_Sans_Arabic_1a2b3c")).toBe("Noto Sans Arabic")
    expect(catalogueFamily("Oswald")).toBe("Oswald")
  })
  it("turns an old build's face into this build's, and keeps a current or unknown one", () => {
    expect(currentFamily("__Oswald_123456", generated)).toBe("__Oswald_aaaaaa")
    expect(currentFamily("__Oswald_aaaaaa", generated)).toBe("__Oswald_aaaaaa")
    expect(currentFamily("Oswald", generated)).toBe("__Oswald_aaaaaa")
    expect(currentFamily("Papyrus", generated)).toBe("Papyrus")
  })
  it("changes only the families of a design", () => {
    const design = { teamName: "x", fonts: [{ id: "a", family: "__Oswald_123456", weight: 700 }] }
    expect(withCurrentFonts(design, generated)).toEqual({ teamName: "x", fonts: [{ id: "a", family: "__Oswald_aaaaaa", weight: 700 }] })
    expect(withCurrentFonts({ teamName: "y" } as { fonts?: unknown }, generated)).toEqual({ teamName: "y" })
  })
})
