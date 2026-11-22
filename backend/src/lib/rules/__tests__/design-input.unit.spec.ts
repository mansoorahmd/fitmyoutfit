import { checkDesignJson, MAX_DESIGN_BYTES, printedFieldsOf, readDesignName } from "../design-input"

describe("checkDesignJson", () => {
  it("accepts an object with a whole-number schemaVersion and returns it", () => {
    expect(checkDesignJson({ schemaVersion: 3, layers: [] })).toEqual({ ok: true, schemaVersion: 3 })
  })

  it.each([null, undefined, [], "x", 5, true])("refuses %j as not an object", (input) => {
    expect(checkDesignJson(input)).toMatchObject({ ok: false, code: "design_not_an_object" })
  })

  it.each([{}, { schemaVersion: "3" }, { schemaVersion: 0 }, { schemaVersion: 1.5 }, { schemaVersion: -1 }, { schemaVersion: null }, { schemaVersion: Number.NaN }])(
    "refuses %j for its schemaVersion",
    (input) => {
      expect(checkDesignJson(input)).toMatchObject({ ok: false, code: "design_schema_version" })
    }
  )

  it("refuses a design over the size limit, counting bytes of its JSON, and accepts one at it", () => {
    const overhead = Buffer.byteLength(JSON.stringify({ schemaVersion: 1, pad: "" }), "utf8")
    const atLimit = { schemaVersion: 1, pad: "a".repeat(50 - overhead) }
    expect(checkDesignJson(atLimit, 50)).toEqual({ ok: true, schemaVersion: 1 })
    expect(checkDesignJson({ ...atLimit, pad: atLimit.pad + "a" }, 50)).toMatchObject({ ok: false, code: "design_too_large" })
    // Two-byte letters count twice.
    expect(checkDesignJson({ schemaVersion: 1, pad: "é".repeat(30) }, 50)).toMatchObject({ ok: false, code: "design_too_large" })
  })

  it("the default limit is 1,000,000 bytes", () => {
    expect(MAX_DESIGN_BYTES).toBe(1_000_000)
  })
})

describe("readDesignName", () => {
  it("trims and tidies text of 1 to 100 characters", () => {
    expect(readDesignName("  Lahore   Lions  ")).toBe("Lahore Lions")
    expect(readDesignName("a".repeat(100))).toBe("a".repeat(100))
  })
  it.each(["", "   ", "a".repeat(101), 5, null, undefined, "a\u0000b"])("refuses %j", (input) => {
    expect(readDesignName(input)).toBeNull()
  })
})

describe("printedFieldsOf: what the design prints for each player", () => {
  it("reads the roles of the layers", () => {
    expect(printedFieldsOf({ layers: [{ role: "player-name" }, { role: "player-number" }, { role: "crest" }] })).toEqual({ name: true, number: true })
    expect(printedFieldsOf({ layers: [{ role: "player-number" }] })).toEqual({ name: false, number: true })
    expect(printedFieldsOf({ layers: [{ role: "player-name" }, { role: "team-name" }] })).toEqual({ name: true, number: false })
    expect(printedFieldsOf({ layers: [{ role: "text" }] })).toEqual({ name: false, number: false })
  })
  it("a design with no layers, or odd data, prints neither", () => {
    for (const design of [{}, { layers: "x" }, { layers: [null, 5, "x", []] }, null, 3]) {
      expect(printedFieldsOf(design)).toEqual({ name: false, number: false })
    }
  })
})
