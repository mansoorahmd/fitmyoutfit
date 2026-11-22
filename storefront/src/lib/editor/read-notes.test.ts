import { describe, expect, it } from "vitest"

import { linesPhrase, readNotesMessage } from "./read-notes"

describe("what the editor's reader tells the organizer", () => {
  it("says nothing when everything was read", () => {
    expect(readNotesMessage([], "order")).toBeNull()
  })

  it("an over-long field: the line as the list counts it (from 1), the field and the limit, and what was kept", () => {
    const message = readNotesMessage([{ code: "field-cut", index: 1, field: "name", max: 200 }], "order")!
    expect(message.unusable).toBe(false)
    expect(message.sentences[0]).toBe("Line 2: the name was too long and was cut to 200 characters.")
    expect(message.sentences.at(-1)).toContain("Everything else is kept.")
    // for a team order the saved copy stays until the list is changed here
    expect(message.sentences.at(-1)).toContain("stays as it was")
    expect(readNotesMessage([{ code: "field-cut", index: 1, field: "name", max: 200 }], "device")!.sentences.at(-1)).toBe("Everything else is kept.")
  })

  it("groups lines: several cut names in one sentence, a reset field and a left-out line each in theirs", () => {
    const message = readNotesMessage(
      [
        { code: "field-cut", index: 0, field: "name", max: 200 },
        { code: "field-cut", index: 3, field: "name", max: 200 },
        { code: "field-reset", index: 2, field: "count" },
        { code: "line-left-out", index: 5, reason: "not-an-object" },
        { code: "line-left-out", index: 6, reason: "not-an-object" },
        { code: "line-left-out", index: 9, reason: "over-the-limit" },
      ],
      "device"
    )!
    expect(message.sentences).toEqual([
      "Lines 1 and 4: the name was too long and was cut to 200 characters.",
      "Line 3: the count could not be read and was reset.",
      "Lines 6 and 7 could not be read and were left out.",
      "Line 10 was left out: the list is over its limit of players.",
      "Everything else is kept.",
    ])
  })

  it("a list that could not be opened at all is said so and is read-only", () => {
    const message = readNotesMessage([{ code: "not-usable", reason: "other-product" }], "order")!
    expect(message.unusable).toBe(true)
    expect(message.sentences).toEqual(["The saved list could not be opened here."])
  })

  it("names a long run of lines without listing them all", () => {
    expect(linesPhrase([0])).toBe("line 1")
    expect(linesPhrase([4, 2, 2])).toBe("lines 3 and 5")
    expect(linesPhrase([0, 1, 2, 3, 4, 5, 6, 7])).toBe("lines 1, 2, 3, 4, 5 and 3 more")
  })
})

describe("the Done panel's main button for a new design", () => {
  it("says what happens next: the team order is started first, the proof comes later from the order", async () => {
    const { teamOrderContent } = await import("@content/team-order")
    const { proofContent } = await import("@content/proof")
    expect(teamOrderContent.designer.continue).toBe("Start your team order")
    expect(teamOrderContent.designer.continue).not.toBe(proofContent.make.designerButton)
    expect(proofContent.make.designerButton).toBe("Continue to the proof")
  })
})
