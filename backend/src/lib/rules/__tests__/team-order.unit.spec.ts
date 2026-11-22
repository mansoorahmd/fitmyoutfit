import {
  buildRosterView,
  entriesToLines,
  readNeedByDate,
  readTeamName,
  sizesFromOptions,
  type StoredEntry,
} from "../team-order"

describe("readTeamName", () => {
  it("trims and tidies text of 1 to 100 characters", () => {
    expect(readTeamName("  Lahore  Lions ")).toBe("Lahore Lions")
    expect(readTeamName("لاہور شیرز")).toBe("لاہور شیرز")
  })
  it.each(["", "  ", "a".repeat(101), 3, null, undefined, "a\nb"])("refuses %j", (input) => {
    expect(readTeamName(input)).toBeNull()
  })
})

describe("readNeedByDate", () => {
  it("accepts a real calendar date, and no date", () => {
    expect(readNeedByDate("2027-02-28")).toEqual({ ok: true, value: "2027-02-28" })
    expect(readNeedByDate("2028-02-29")).toEqual({ ok: true, value: "2028-02-29" })
    expect(readNeedByDate(undefined)).toEqual({ ok: true, value: null })
    expect(readNeedByDate(null)).toEqual({ ok: true, value: null })
  })
  it.each(["2027-02-30", "2027-13-01", "27-01-01", "2027/01/01", "2027-1-1", "", 20270101, "2027-01-01T00:00:00Z"])("refuses %j", (input) => {
    expect(readNeedByDate(input)).toEqual({ ok: false })
  })
})

describe("sizesFromOptions", () => {
  it("takes the Size option's values in rank order", () => {
    const options = [
      { title: "Color", values: [{ value: "Red", rank: 0 }] },
      { title: "size", values: [{ value: "M", rank: 1 }, { value: "S", rank: 0 }, { value: "L", rank: 2 }] },
    ]
    expect(sizesFromOptions(options)).toEqual(["S", "M", "L"])
  })
  it("keeps the listed order when there are no ranks, and drops blanks and repeats", () => {
    expect(sizesFromOptions([{ title: "Size", values: [{ value: "B" }, { value: "" }, { value: "A" }, { value: "B" }, null] }])).toEqual(["B", "A"])
  })
  it("a product without a Size option has no sizes", () => {
    expect(sizesFromOptions([{ title: "Default option", values: [{ value: "Default option value" }] }])).toEqual([])
    expect(sizesFromOptions(null)).toEqual([])
    expect(sizesFromOptions([null])).toEqual([])
  })
})

const entry = (partial: Partial<StoredEntry>): StoredEntry => ({
  id: "rosent_1",
  line_id: "ln_1",
  position: 0,
  name: "Ali",
  number: "7",
  size: "M",
  count: 1,
  no_name: false,
  no_number: false,
  ...partial,
})

describe("entriesToLines", () => {
  it("puts the entries in order of position and uses the line id", () => {
    const lines = entriesToLines([entry({ line_id: "b", position: 1, name: "B" }), entry({ line_id: "a", position: 0, name: "A" })])
    expect(lines.map((l) => [l.id, l.name])).toEqual([["a", "A"], ["b", "B"]])
  })
})

describe("buildRosterView", () => {
  const base = { prints: { name: true, number: true }, sizes: ["S", "M", "L"], limits: undefined }

  it("shapes lines, problems, notes and the summary in snake_case", () => {
    const view = buildRosterView({
      ...base,
      minimum: 10,
      lines: entriesToLines([
        entry({ line_id: "a", position: 0, name: "Ali 2", number: "7", size: "M" }),
        entry({ line_id: "b", position: 1, name: "Bilal", number: "07", size: "XL", count: 2, no_number: false }),
      ]),
    })
    expect(view.lines).toEqual([
      { id: "a", name: "Ali 2", number: "7", size: "M", count: 1, no_name: false, no_number: false },
      { id: "b", name: "Bilal", number: "07", size: "XL", count: 2, no_name: false, no_number: false },
    ])
    expect(view.problems.map((p) => [p.index, p.line_id, p.field, p.code])).toEqual([
      [0, "a", "name", "name-character"],
      [0, "a", "number", "number-duplicate"],
      [1, "b", "number", "number-duplicate"],
      [1, "b", "size", "size-unknown"],
    ])
    expect(view.problems[0]!.detail).toEqual({ characters: ["2"], has_digit: true })
    expect(view.problems[1]!.detail).toMatchObject({ value: 7, others: [{ index: 1, id: "b", name: "Bilal" }] })
    expect(view.summary).toMatchObject({
      players: 2,
      pieces: 3,
      lines_to_fix: 2,
      indexes_to_fix: [0, 1],
      minimum: { required: 10, missing: 7, met: false },
      ready_for_proof: false,
      other_sizes: [{ size: "XL", pieces: 2 }],
    })
    expect(view.summary.by_size).toEqual([
      { size: "S", pieces: 0 },
      { size: "M", pieces: 1 },
      { size: "L", pieces: 0 },
    ])
  })

  it("a list-level problem has no line", () => {
    const view = buildRosterView({
      ...base,
      prints: { name: false, number: false },
      minimum: null,
      limits: { maxLines: 1 },
      lines: entriesToLines([entry({ line_id: "a" }), entry({ line_id: "b", position: 1 })]),
    })
    expect(view.problems).toEqual([
      { code: "list-too-long", index: -1, line_id: null, field: "list", detail: { lines: 2, max: 1 } },
    ])
  })
})
