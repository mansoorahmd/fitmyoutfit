import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

import { PROOF_REFUSAL_CODES, proofContent } from "@content/proof"

// The contract's section 3 names every refusal of making, signing and reopening a proof: each must have a
// sentence here (docs/contracts/m2-team-orders.md).
const contract = readFileSync(resolve(import.meta.dirname, "../../../docs/contracts/m2-team-orders.md"), "utf8")
const section3 = contract.slice(contract.indexOf("## 3. The roster proof"), contract.indexOf("## 4. The need-by date"))
const codesIn = (text: string) => Array.from(new Set(Array.from(text.matchAll(/`([a-z]+(?:_[a-z]+)+)`/g)).map((m) => m[1]!)))

describe("the proof's refusals", () => {
  const listed = new Set(Object.values(PROOF_REFUSAL_CODES).flat())
  const refusalCodes = codesIn(section3).filter(
    (c) => /^(team_order_|roster_|proof_|signed_name|confirmation_|schedule_state_|schedule_changed)/.test(c) && c !== "team_order_id" && c !== "proof_hash" && c !== "proof_sent" && c !== "signed_name"
  )
  it("every refusal code the contract names has a sentence for its step", () => {
    expect(refusalCodes.length).toBeGreaterThan(10)
    expect(refusalCodes.filter((c) => !listed.has(c) && !/_(not_found)$/.test(c))).toEqual([])
  })
  it("every listed code has a sentence", () => {
    for (const [action, codes] of Object.entries(PROOF_REFUSAL_CODES)) {
      for (const code of codes) expect(proofContent.refusals[action as keyof typeof proofContent.refusals][code], `${action}:${code}`).toBeTruthy()
    }
  })
})
