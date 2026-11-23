import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

import { PAYMENT_REFUSAL_CODES, paymentsContent } from "@content/payments"
import { PROOF_REFUSAL_CODES, proofContent } from "@content/proof"

// The contract's sections 4 and 5 name every refusal of the payment routes and of going back to draft: each
// must have a sentence (docs/contracts/m3-team-order-payments.md).
const contract = readFileSync(resolve(import.meta.dirname, "../../../docs/contracts/m3-team-order-payments.md"), "utf8")
const routes = contract.slice(contract.indexOf("## 4. Routes"), contract.indexOf("## 6. Admin"))
const codesIn = (text: string) => Array.from(new Set(Array.from(text.matchAll(/`([a-z]+(?:_[a-z]+)+)`/g)).map((m) => m[1]!)))

describe("the payments refusals", () => {
  const listed = new Set([...Object.values(PAYMENT_REFUSAL_CODES).flat(), ...PROOF_REFUSAL_CODES.reopen])
  const named = codesIn(routes).filter((c) => c !== "balance_due" && c !== "deposit_paid" && /^(team_order_not_priced|team_order_not_reopenable|deposit_|balance_|payment_(?!status)|order_canceled)/.test(c))

  it("every refusal code the contract names has a sentence for its step", () => {
    expect(named.length).toBeGreaterThan(12)
    expect(named.filter((c) => !listed.has(c))).toEqual([])
  })
  it("every listed code has a sentence", () => {
    for (const [step, codes] of Object.entries(PAYMENT_REFUSAL_CODES)) {
      for (const code of codes) expect(paymentsContent.refusals[step as keyof typeof paymentsContent.refusals][code], `${step}:${code}`).toBeTruthy()
    }
    for (const code of PROOF_REFUSAL_CODES.reopen) expect(proofContent.refusals.reopen[code], `reopen:${code}`).toBeTruthy()
  })
  it("no refusal sentence has a placeholder", () => {
    for (const table of Object.values(paymentsContent.refusals)) for (const s of Object.values(table)) expect(s).not.toMatch(/\{\w+\}/)
  })
  it("the old wording that payment is not open is gone", () => {
    expect(JSON.stringify(paymentsContent)).not.toMatch(/not open yet/i)
    expect(JSON.stringify(proofContent)).not.toMatch(/not open yet/i)
  })
})
