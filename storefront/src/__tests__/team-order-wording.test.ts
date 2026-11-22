import { NOTE_CODES, PROBLEM_CODES } from "@fitmyoutfit/team-rules"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

import { teamOrderContent } from "@content/team-order"
import { TEAM_ORDER_STATUSES } from "@lib/team-order/types"
import { failureSentence, noteSentence, problemRows, problemSentence, scheduleSentence } from "@lib/team-order/words"

// The rules package exports the runtime lists of codes (PROBLEM_CODES, NOTE_CODES): the store imports it as a
// workspace package, so this test reads the package's own lists, not a copy of the contract's.

describe("a sentence for every code of the contract", () => {
  it.each([...PROBLEM_CODES])("problem %s has its own sentence", (code) => {
    const sentence = teamOrderContent.problems[code]
    expect(typeof sentence).toBe("string")
    expect(sentence.trim().length).toBeGreaterThan(5)
    expect(sentence).not.toBe(teamOrderContent.problems.fallback)
  })

  it.each([...NOTE_CODES])("note %s has its own sentence", (code) => {
    expect(teamOrderContent.notes[code].trim().length).toBeGreaterThan(5)
  })

  it("has a status word for every status of the flow", () => {
    for (const status of TEAM_ORDER_STATUSES) {
      expect(teamOrderContent.status[status].label.length).toBeGreaterThan(2)
      expect(teamOrderContent.status[status].text.length).toBeGreaterThan(5)
    }
  })

  it("has no sentence for a code that is not in the contract", () => {
    const known = new Set<string>([...PROBLEM_CODES, "number-duplicate-unnamed", "fallback"])
    expect(Object.keys(teamOrderContent.problems).filter((k) => !known.has(k))).toEqual([])
    expect(Object.keys(teamOrderContent.notes).filter((k) => !(NOTE_CODES as readonly string[]).includes(k))).toEqual([])
  })

  it("every sentence's braces are filled for a problem with its detail", () => {
    const detail = {
      value: 7,
      others: [{ index: 0, name: "Bilal" }],
      takenIn: [{ source: "first-order" as const }],
      characters: ["1", "@"],
      hasDigit: true,
      length: 20,
      max: 18,
      size: "XXXL",
      count: 12,
      min: 1,
      lines: 120,
    }
    for (const code of PROBLEM_CODES) {
      const text = problemSentence({ code, index: 0, field: "name", detail })
      expect(text, code).not.toMatch(/[{}]/)
    }
  })

  it("fills the numbers and names the backend gave", () => {
    expect(problemSentence({ code: "number-duplicate", index: 1, field: "number", detail: { value: 7, others: [{ index: 0, name: "Bilal" }, { index: 2, name: "Sami" }] } })).toBe(
      "Same number as Bilal and Sami."
    )
    expect(problemSentence({ code: "name-too-long", index: 0, field: "name", detail: { length: 21, max: 18 } })).toBe("The name is too long: 21 letters, 18 at most.")
    expect(problemSentence({ code: "size-unknown", index: 0, field: "size", detail: { size: "XXXL" } })).toBe("XXXL is not a size of this product.")
  })

  it("a number shared with a line that has no name still says something", () => {
    expect(problemSentence({ code: "number-duplicate", index: 1, field: "number", detail: { value: 7, others: [] } })).toBe(
      teamOrderContent.problems["number-duplicate-unnamed"]
    )
    expect(problemSentence({ code: "number-duplicate", index: 1, field: "number", detail: { value: 7, others: [{ index: 3, name: "" }] } })).toBe("Same number as line 4.")
  })

  it("a code from a newer backend gets the general sentence, never nothing", () => {
    expect(problemSentence({ code: "brand-new-code" as never, index: 0, field: "name" })).toBe(teamOrderContent.problems.fallback)
    expect(noteSentence({ code: "name-mixed-scripts", index: 0 })).toContain("Latin")
  })
})

describe("the lines with a failed check", () => {
  it("names the line by its place and its name, and says the problem in a sentence", () => {
    const rows = problemRows({
      lines: [
        { id: "a", name: "Bilal", number: "7", size: "M", count: 1, noName: false, noNumber: false },
        { id: "b", name: "علی", number: "", size: "", count: 1, noName: false, noNumber: false },
        { id: "c", name: "", number: "8", size: "L", count: 1, noName: true, noNumber: false },
      ],
      problems: [
        { code: "number-missing", index: 1, lineId: "b", field: "number" },
        { code: "size-missing", index: 1, lineId: "b", field: "size" },
        { code: "size-unknown", index: 2, lineId: "c", field: "size", detail: { size: "9XL" } },
        { code: "list-too-long", index: -1, field: "list", detail: { lines: 120, max: 100 } },
      ],
    })
    expect(rows).toEqual([
      { index: 1, label: "Line 2 · علی", name: "علی", sentences: ["Needs a number.", "Needs a size."] },
      { index: 2, label: "Line 3", name: null, sentences: ["9XL is not a size of this product."] },
    ])
  })
})

describe("what the backend's schedule becomes", () => {
  const base = { needByDate: "2026-12-20", today: "2026-11-22", days: { standard: 15, rush: 10 }, daysLeftStandard: 3, daysLeftRush: 8 }
  it("says nothing without a date", () => {
    expect(scheduleSentence({ ...base, state: "none", needByDate: null, latestSignStandard: null, latestSignRush: null })).toBeNull()
  })
  it("ok: the latest day to sign, from the backend", () => {
    expect(scheduleSentence({ ...base, state: "ok", latestSignStandard: "2026-12-05", latestSignRush: "2026-12-10" })).toEqual({
      state: "ok",
      text: "The latest day to sign the proof is 5 December 2026.",
    })
  })
  it("needs rush: the rush day", () => {
    expect(scheduleSentence({ ...base, state: "needs_rush", latestSignStandard: "2026-11-20", latestSignRush: "2026-11-25" })?.text).toContain("25 November 2026")
  })
  it("cannot be met: says so", () => {
    expect(scheduleSentence({ ...base, state: "cannot_be_met", latestSignStandard: "2026-11-10", latestSignRush: "2026-11-15" })?.text).toContain("can't meet")
  })
})

describe("what a failure says", () => {
  it("uses the code, never the backend's message", () => {
    expect(failureSentence({ kind: "refused", status: 400, code: "need_by_date_in_past", extra: { today: "2026-11-22" } })).toBe("That day has already passed. Today is 22 November 2026.")
    expect(failureSentence({ kind: "refused", status: 400, code: "team_name_invalid" })).toMatch(/100 characters/)
    expect(failureSentence({ kind: "refused", status: 400, code: "something_new" })).toBe(teamOrderContent.refusals.fallback)
    expect(failureSentence({ kind: "unavailable" })).toBe(teamOrderContent.refusals.unavailable)
    expect(failureSentence({ kind: "signed_out" })).toBe(teamOrderContent.refusals.signedOut)
  })
})

describe("every sentence is marked as a draft in the content file", () => {
  it("the file says DRAFT WORDING", async () => {
    const { readFile } = await import("node:fs/promises")
    const source = await readFile(resolve(import.meta.dirname, "../content/team-order.ts"), "utf8")
    expect(source.match(/DRAFT WORDING\./g)!.length).toBeGreaterThan(20)
  })
})
