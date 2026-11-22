import { describe, expect, it } from "vitest"

import { PROOF_REFUSAL_CODES, proofContent, type ProofAction } from "@content/proof"
import { apiSchedule } from "./fixtures"
import { scheduleFromApi } from "./map"
import { SIGNED_NAME_MAX, checkSigning, cleanSignedName, signingSchedule, stepFailure } from "./signing"

const schedule = (over: Record<string, unknown>) => scheduleFromApi(apiSchedule(over))!

describe("the signing form", () => {
  it("needs a name and the box", () => {
    expect(checkSigning({ name: "", ticked: true })).toMatchObject({ ok: false, field: "name" })
    expect(checkSigning({ name: "   ", ticked: true })).toMatchObject({ ok: false, field: "name" })
    expect(checkSigning({ name: "Ali Raza", ticked: false })).toMatchObject({ ok: false, field: "tick" })
  })
  it("sends the name cleaned like the backend cleans it", () => {
    expect(checkSigning({ name: "  Ali   Raza \n", ticked: true })).toEqual({ ok: true, name: "Ali Raza" })
    expect(cleanSignedName("Café")).toBe("Café")
    expect(checkSigning({ name: "محمد  علی", ticked: true })).toEqual({ ok: true, name: "محمد علی" })
  })
  it("refuses a name over 100 characters and control characters", () => {
    expect(checkSigning({ name: "a".repeat(SIGNED_NAME_MAX), ticked: true }).ok).toBe(true)
    expect(checkSigning({ name: "a".repeat(SIGNED_NAME_MAX + 1), ticked: true })).toMatchObject({ ok: false, field: "name" })
    expect(checkSigning({ name: "Ali\u0007", ticked: true })).toMatchObject({ ok: false, field: "name" })
  })
})

describe("the need-by date before signing", () => {
  it("says nothing when there is no date or it can be met", () => {
    expect(signingSchedule(schedule({ state: "none" }), false)).toEqual({ state: "none", sentences: [] })
    expect(signingSchedule(schedule({ state: "ok" }), false).sentences).toEqual([])
  })
  it("sends the backend's state and says rush in plain words", () => {
    const rush = signingSchedule(schedule({ state: "needs_rush", latest_sign_rush: "2026-11-24" }), false)
    expect(rush.state).toBe("needs_rush")
    expect(rush.sentences[0]).toContain("24 November 2026")
    expect(rush.sentences[1]).toContain("not chosen rush")
    expect(signingSchedule(schedule({ state: "needs_rush", latest_sign_rush: "2026-11-24" }), true).sentences[1]).toContain("chosen rush")
  })
  it("says a date that cannot be met, and promises no date of ours", () => {
    const out = signingSchedule(schedule({ state: "cannot_be_met" }), false)
    expect(out.state).toBe("cannot_be_met")
    expect(out.sentences.join(" ")).toContain("can't meet")
    expect(out.sentences.join(" ")).not.toMatch(/will arrive|guarantee/i)
  })
})

describe("every refusal has a sentence", () => {
  for (const action of Object.keys(PROOF_REFUSAL_CODES) as ProofAction[]) {
    for (const code of PROOF_REFUSAL_CODES[action]) {
      it(`${action}: ${code}`, () => {
        const f = stepFailure(action, { kind: "refused", status: 400, code, extra: { required: 10, missing: 3 } })
        expect(f.text).not.toBe(proofContent.general.fallback[action])
        expect(f.text).not.toMatch(/\{\w+\}/)
      })
    }
  }
  it("a stale answer makes the page read the order again; nothing else does", () => {
    for (const code of ["proof_hash_mismatch", "proof_not_current", "schedule_changed"]) expect(stepFailure("sign", { kind: "refused", status: 409, code }).refresh).toBe(true)
    expect(stepFailure("sign", { kind: "refused", status: 400, code: "confirmation_required" }).refresh).toBe(false)
  })
  it("an unknown code, a lost connection and a signed-out customer are each a sentence", () => {
    expect(stepFailure("sign", { kind: "refused", status: 400, code: "brand_new" }).text).toBe(proofContent.general.fallback.sign)
    expect(stepFailure("sign", { kind: "unavailable" }).text).toContain("Nothing was signed")
    expect(stepFailure("make", { kind: "signed_out" })).toMatchObject({ signedOut: true })
  })
})
