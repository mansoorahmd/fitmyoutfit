/**
 * The admin panel's source, checked as text: the panel has no React test setup in this package,
 * and these are the points QA's tenth review found in it.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"

const source = readFileSync(join(__dirname, "..", "widgets", "cash-on-delivery-collected.tsx"), "utf8")

describe("the Cash on delivery panel", () => {
  // S2: maxLength={64} cut a 65-character reference silently (and counted UTF-16 units, while the
  // server counts characters). The server's refusal, which says what is allowed, is shown instead.
  it("does not cut what staff type into the slip field", () => {
    expect(source).not.toMatch(/maxLength/i)
    expect(source).toMatch(/\{mark\.error\.message\}/)
  })

  // M2 and S1: the badge, the note and the warning come from the backend's rule.
  it("shows the backend's label, note and capture warning", () => {
    expect(source).toMatch(/state\.label/)
    expect(source).toMatch(/state\.note/)
    expect(source).toMatch(/state\.capture_warning/)
  })

  // QA's thirteenth review, B1: the new state, red, with its figures, its note and the slip field
  // that records without a capture.
  it("shows the canceled order whose cash is still held, with its figures and note, and lets staff record the slip", () => {
    expect(source).toMatch(/"canceled_cash_held"/)
    expect(source).toMatch(/canceled_cash_held: \{ label: "Canceled, cash still held", color: "red" \}/)
    expect(source).toMatch(/state\.held_amount/)
    expect(source).toMatch(/label="Still held"/)
    // The note (what to do) is shown in the form and in the refused states, not only once recorded.
    expect(source.match(/state\.note/g)?.length ?? 0).toBeGreaterThanOrEqual(3)
  })
})
