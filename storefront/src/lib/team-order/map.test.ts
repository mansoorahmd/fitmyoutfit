import { describe, expect, it } from "vitest"

import { apiAnswer, apiLine, apiSchedule, apiSummary } from "./fixtures"
import {
  limitsFromApi,
  lineFromApi,
  lineToInput,
  linesToInput,
  noteFromApi,
  parseListItem,
  parseTeamOrderAnswer,
  problemFromApi,
  rosterBodyFromSaved,
  savedListFromView,
  editorAcceptsList,
  scheduleFromApi,
  summaryFromApi,
} from "./map"

describe("a line, to the contract's line-input", () => {
  it("maps every field and keeps the id", () => {
    expect(
      lineToInput({ id: "a1", name: "Bilal", number: "07", size: "2XL", count: 3, noName: true, noNumber: true })
    ).toEqual({ id: "a1", name: "Bilal", number: "07", size: "2XL", count: 3, no_name: true, no_number: true })
  })

  it("leaves the id out when the line has none, so the server makes one", () => {
    const input = lineToInput({ name: "", number: "", size: "", count: 1, noName: false, noNumber: false })
    expect("id" in input).toBe(false)
  })

  it("keeps Urdu and Arabic text and digits exactly as typed", () => {
    const line = { id: "u", name: "محمد علی خان", number: "۷", size: "L", count: 1, noName: false, noNumber: false }
    const input = lineToInput(line)
    expect(input.name).toBe("محمد علی خان")
    expect(input.number).toBe("۷")
    expect(lineToInput({ ...line, name: "بلال", number: "٠٧" })).toMatchObject({ name: "بلال", number: "٠٧" })
  })

  it("keeps a size the product does not have, as typed, so the server can say so", () => {
    expect(lineToInput({ id: "s", name: "A", number: "1", size: "xxl ", count: 1, noName: false, noNumber: false }).size).toBe("xxl ")
  })

  it("sends a count that is not a whole number as 1 (the editor never makes one)", () => {
    expect(lineToInput({ id: "c", name: "A", number: "1", size: "M", count: 1.5, noName: false, noNumber: false }).count).toBe(1)
    expect(lineToInput({ id: "c", name: "A", number: "1", size: "M", count: 14, noName: false, noNumber: false }).count).toBe(14)
  })

  it("keeps the order of the lines", () => {
    const lines = ["a", "b", "c"].map((id) => ({ id, name: id, number: "", size: "", count: 1, noName: false, noNumber: false }))
    expect(linesToInput(lines).map((l) => l.id)).toEqual(["a", "b", "c"])
  })
})

describe("a line, from the server's answer", () => {
  it("maps every field", () => {
    expect(lineFromApi(apiLine({ id: "x", name: "علی", number: "٧", size: "L", count: 2, no_name: true, no_number: false }))).toEqual({
      id: "x",
      name: "علی",
      number: "٧",
      size: "L",
      count: 2,
      noName: true,
      noNumber: false,
    })
  })

  it("round-trips through the input", () => {
    const line = { id: "r", name: "Ali Raza", number: "10", size: "XL", count: 2, noName: false, noNumber: true }
    const back = lineFromApi(lineToInput(line))
    expect(back).toEqual(line)
  })

  it("refuses what is not a line", () => {
    expect(lineFromApi(null)).toBeNull()
    expect(lineFromApi({ name: "no id" })).toBeNull()
  })
})

describe("the checks' result", () => {
  it("maps a problem, its line id and its detail to the rules package's names", () => {
    expect(
      problemFromApi({
        code: "number-duplicate",
        index: 1,
        line_id: "ln_2",
        field: "number",
        detail: { value: 7, others: [{ index: 0, id: "ln_1", name: "Bilal" }] },
      })
    ).toEqual({
      code: "number-duplicate",
      index: 1,
      lineId: "ln_2",
      field: "number",
      detail: { value: 7, others: [{ index: 0, id: "ln_1", name: "Bilal" }] },
    })
  })

  it("maps the snake_case detail names", () => {
    expect(problemFromApi({ code: "name-character", index: 0, line_id: null, field: "name", detail: { characters: ["1"], has_digit: true } })).toEqual({
      code: "name-character",
      index: 0,
      field: "name",
      detail: { characters: ["1"], hasDigit: true },
    })
    expect(problemFromApi({ code: "quantity-range", index: 2, line_id: "z", field: "count", detail: { count: 12, min: 1, max: 10 } })?.detail).toEqual({
      count: 12,
      min: 1,
      max: 10,
    })
    expect(problemFromApi({ code: "size-unknown", index: 0, line_id: "z", field: "size", detail: { size: "XXXL" } })?.detail).toEqual({ size: "XXXL" })
    expect(problemFromApi({ code: "name-too-long", index: 0, line_id: "z", field: "name", detail: { length: 20, max: 18 } })?.detail).toEqual({
      length: 20,
      max: 18,
    })
  })

  it("maps where a number is taken", () => {
    const problem = problemFromApi({
      code: "number-taken-first-order",
      index: 0,
      line_id: "a",
      field: "number",
      detail: { value: 9, taken_in: [{ source: "first_order", order_id: "teamord_9", name: "Sami" }, { source: "add_on" }] },
    })
    expect(problem?.detail?.takenIn).toEqual([{ source: "first-order", orderId: "teamord_9", name: "Sami" }, { source: "add-on" }])
  })

  it("keeps the list-wide problem (index -1) and a code it does not know", () => {
    expect(problemFromApi({ code: "list-too-long", index: -1, line_id: null, field: "list", detail: { lines: 120, max: 100 } })).toMatchObject({ index: -1, field: "list" })
    expect(problemFromApi({ code: "something-new", index: 0, line_id: null, field: "weird", detail: null })).toMatchObject({ code: "something-new", field: "list" })
  })

  it("refuses a problem with no code or no index", () => {
    expect(problemFromApi({ index: 1 })).toBeNull()
    expect(problemFromApi({ code: "x" })).toBeNull()
  })

  it("maps a note", () => {
    expect(noteFromApi({ code: "name-mixed-scripts", index: 3, line_id: "q" })).toEqual({ code: "name-mixed-scripts", index: 3, lineId: "q" })
    expect(noteFromApi({ code: "mixed-digit-systems", index: -1, line_id: null })).toEqual({ code: "mixed-digit-systems", index: -1 })
  })

  it("maps the summary field by field", () => {
    const summary = summaryFromApi(
      apiSummary({
        players: 22,
        pieces: 24,
        lines_without_size: 1,
        pieces_without_size: 1,
        ready_lines: 20,
        lines_to_fix: 2,
        indexes_to_fix: [3, 9],
        other_sizes: [{ size: "XXXL", pieces: 1 }],
        ready_for_proof: false,
      })
    )
    expect(summary).toMatchObject({
      players: 22,
      pieces: 24,
      linesWithoutSize: 1,
      piecesWithoutSize: 1,
      readyLines: 20,
      linesToFix: 2,
      indexesToFix: [3, 9],
      otherSizes: [{ size: "XXXL", pieces: 1 }],
      minimum: { required: 10, missing: 7, met: false },
      readyForProof: false,
    })
    expect(summary?.bySize[1]).toEqual({ size: "M", pieces: 2 })
  })

  it("has no minimum when the server sent none", () => {
    expect(summaryFromApi(apiSummary({ minimum: null }))?.minimum).toBeNull()
  })

  it("maps the limits and sends the editor only what the server sent", () => {
    expect(limitsFromApi({ max_lines: 80, min_count: 1, max_count: 6, max_name_length: 14 })).toEqual({
      maxLines: 80,
      minCount: 1,
      maxCount: 6,
      maxNameLength: 14,
    })
    expect(limitsFromApi({ max_lines: 50 })).toEqual({ maxLines: 50 })
    expect(limitsFromApi(null)).toEqual({})
    expect(limitsFromApi({ max_lines: 0, max_count: "9" })).toEqual({})
  })

  it("maps the schedule", () => {
    expect(
      scheduleFromApi(
        apiSchedule({
          state: "needs_rush",
          need_by_date: "2026-12-10",
          latest_sign_standard: "2026-11-25",
          latest_sign_rush: "2026-11-30",
          days_left_standard: 3,
          days_left_rush: 8,
        })
      )
    ).toEqual({
      state: "needs_rush",
      needByDate: "2026-12-10",
      today: "2026-11-22",
      days: { standard: 15, rush: 10 },
      latestSignStandard: "2026-11-25",
      latestSignRush: "2026-11-30",
      daysLeftStandard: 3,
      daysLeftRush: 8,
    })
    expect(scheduleFromApi({ state: "maybe", today: "x" })).toBeNull()
  })
})

describe("the whole answer", () => {
  it("is read into one view", () => {
    const view = parseTeamOrderAnswer(apiAnswer({ team_order: { need_by_date: "2026-12-20", rush_requested: true } }))
    expect(view).toMatchObject({
      id: "teamord_1",
      teamName: "Lahore Lions",
      status: "draft",
      kind: "order",
      designId: "design_1",
      designVersionId: "desver_1",
      productId: "prod_1",
      regionId: "reg_uk",
      needByDate: "2026-12-20",
      rushRequested: true,
      prints: { name: true, number: true },
      listVersion: 3,
      sizes: ["YS", "YM", "S", "M", "L"],
      limits: { maxLines: 100, minCount: 1, maxCount: 10, maxNameLength: 18 },
    })
    expect(view?.lines).toHaveLength(2)
    expect(view?.lines[1]).toMatchObject({ name: "علی", number: "٧" })
  })

  it("takes the list's version from the roster, which is the one a save is made from", () => {
    expect(parseTeamOrderAnswer(apiAnswer({ roster: { version: 8 } }))?.listVersion).toBe(8)
  })

  it("is null for an answer it cannot read", () => {
    expect(parseTeamOrderAnswer(null)).toBeNull()
    expect(parseTeamOrderAnswer({})).toBeNull()
    expect(parseTeamOrderAnswer(apiAnswer({ team_order: { status: "someday" } }))).toBeNull()
    expect(parseTeamOrderAnswer(apiAnswer({ schedule: null }))).toBeNull()
  })

  it("reads an entry of the list", () => {
    expect(
      parseListItem({
        id: "teamord_2",
        team_name: "Club",
        status: "proof_sent",
        kind: "order",
        product_id: "p",
        region_id: "r",
        need_by_date: null,
        players: 22,
        pieces: 24,
        created_at: "2026-11-22T10:00:00.000Z",
        current_proof: null,
      })
    ).toMatchObject({ id: "teamord_2", status: "proof_sent", players: 22, pieces: 24, needByDate: null })
    expect(parseListItem({ id: "x" })).toBeNull()
  })
})

describe("to and from the editor's saved list", () => {
  it("gives the editor the server's lines, what the design prints and the product", () => {
    const view = parseTeamOrderAnswer(apiAnswer())!
    // the editor's own product id, not the store's "prod_1": the editor drops a list kept under another id
    expect(savedListFromView(view, "stand-in-jersey")).toEqual({
      version: 1,
      productId: "stand-in-jersey",
      prints: { name: true, number: true },
      lines: view.lines,
    })
  })

  it("the editor's own reader keeps the list (the product id it was handed is the one it checks)", async () => {
    const { readSavedList } = await import("@fitmyoutfit/editor")
    const view = parseTeamOrderAnswer(apiAnswer())!
    const list = savedListFromView(view, "stand-in-jersey")
    expect(readSavedList(list, { productId: "stand-in-jersey" }).map((l) => l.id)).toEqual(view.lines.map((l) => l.id))
    // and under any other id it would be dropped: why the store's "prod_..." id must not be handed over
    expect(readSavedList({ ...list, productId: view.productId }, { productId: "stand-in-jersey" })).toEqual([])
  }, 60000)

  it("says when the editor would drop the list (too many lines for its limits), and when a count out of range is still fine", () => {
    const view = parseTeamOrderAnswer(apiAnswer())!
    const line = (i: number, count = 1) => ({ ...view.lines[0]!, id: `l${i}`, count })
    expect(editorAcceptsList({ lines: [line(1, 0), line(2, 11)], limits: {} })).toBe(true)
    expect(editorAcceptsList({ lines: [line(1), line(2), line(3)], limits: { maxLines: 2 } })).toBe(false)
    expect(editorAcceptsList({ lines: [line(1), line(1)], limits: {} })).toBe(false)
  })

  it("makes the body of a save from what the editor hands over", () => {
    const list = {
      lines: [
        { id: "a", name: "علی", number: "٧", size: "M", count: 2, noName: false, noNumber: false },
        { name: "", number: "", size: "", count: 1, noName: true, noNumber: true },
      ],
    }
    expect(rosterBodyFromSaved(list, 4)).toEqual({
      version: 4,
      lines: [
        { id: "a", name: "علی", number: "٧", size: "M", count: 2, no_name: false, no_number: false },
        { name: "", number: "", size: "", count: 1, no_name: true, no_number: true },
      ],
    })
  })
})
