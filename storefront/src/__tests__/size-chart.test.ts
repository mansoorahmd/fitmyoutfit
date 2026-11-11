import { afterEach, describe, expect, it, vi } from "vitest"

import {
  UNIT_STORAGE_KEY,
  displayMeasurement,
  hasSizeChart,
  isChosenSize,
  openingScrollTop,
  parseSizeChart,
  readStoredUnit,
  sizeChartTableRows,
} from "@lib/util/size-chart"

import { chartFixture } from "./fixtures/m1"

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe("parseSizeChart", () => {
  it("reads the contract's shape", () => {
    const chart = parseSizeChart({ size_chart: chartFixture() })
    expect(chart?.draft).toBe(true)
    expect(chart?.unit).toBe("cm")
    expect(chart?.columns.map((c) => c.label)).toEqual(["Chest width", "Body length"])
    expect(chart?.rows).toHaveLength(11)
    expect(chart?.rows[0]).toEqual({ size: "YS", values: { chest: 38, length: 52 } })
  })

  it("is null with no chart or no rows: no link and no table", () => {
    expect(parseSizeChart({})).toBeNull()
    expect(parseSizeChart(null)).toBeNull()
    expect(parseSizeChart({ size_chart: chartFixture({ rows: [] }) })).toBeNull()
    expect(hasSizeChart({ metadata: { kind: "garment" } })).toBe(false)
    expect(hasSizeChart({ metadata: { size_chart: chartFixture() } })).toBe(true)
  })

  it("treats bad data as no chart and warns in development", () => {
    vi.stubEnv("NODE_ENV", "development")
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    for (const bad of [
      chartFixture({ columns: [] }),
      chartFixture({ rows: [{ size: "M" }] }),
      chartFixture({ unit: "mm" }),
      "a table",
    ]) {
      expect(parseSizeChart({ size_chart: bad })).toBeNull()
    }
    expect(warn).toHaveBeenCalledTimes(4)
  })

  it("keeps a missing value as null (shown as not measured)", () => {
    const chart = parseSizeChart({
      size_chart: chartFixture({ rows: [{ size: "M", values: { chest: 50 } }] }),
    })
    expect(chart?.rows[0].values).toEqual({ chest: 50, length: null })
  })
})

describe("displayMeasurement", () => {
  it("shows centimetres as stored, with no rounding", () => {
    expect(displayMeasurement(52.25, "cm", "cm")).toBe("52.25")
    expect(displayMeasurement(52, "cm", "cm")).toBe("52")
  })

  it("converts to inches (cm ÷ 2.54) to one decimal place", () => {
    expect(displayMeasurement(50.8, "cm", "in")).toBe("20.0")
    expect(displayMeasurement(52, "cm", "in")).toBe("20.5")
  })

  it("leaves a missing value missing", () => {
    expect(displayMeasurement(null, "cm", "in")).toBeNull()
  })
})

describe("sizeChartTableRows", () => {
  it("puts Youth and Adult group rows before their sizes, in size order", () => {
    const chart = parseSizeChart({
      size_chart: chartFixture({
        rows: ["M", "YS", "S", "YM"].map((size) => ({ size, values: { chest: 1, length: 1 } })),
      }),
    })!
    const rows = sizeChartTableRows(chart).map((r) =>
      r.kind === "group" ? `[${r.label}]` : r.row.size
    )
    expect(rows).toEqual(["[Youth]", "YS", "YM", "[Adult]", "S", "M"])
  })

  it("has no group row when there is only one group", () => {
    const chart = parseSizeChart({
      size_chart: chartFixture({
        rows: ["S", "M"].map((size) => ({ size, values: { chest: 1, length: 1 } })),
      }),
    })!
    expect(sizeChartTableRows(chart).every((r) => r.kind === "size")).toBe(true)
  })
})

describe("openingScrollTop: where the sheet opens", () => {
  // A 390 × 844 phone: the body shows about 600 px; the draft note's top is
  // at 16 px; the 3XL row is far below.
  const phone = { viewHeight: 600, room: 44 }

  it("does not move when the chosen row is already in view with room below", () => {
    expect(openingScrollTop({ ...phone, rowTop: 400, rowBottom: 444, keepTop: 16 })).toBe(0)
  })

  it("never scrolls the draft note out of view, even for a row far below", () => {
    // block: "nearest" went to 1044 − 600 = 444, scrolling the note away
    expect(openingScrollTop({ ...phone, rowTop: 1000, rowBottom: 1044, keepTop: 16 })).toBe(16)
  })

  it("without a note, shows the row with a row's room below, not on the bottom edge", () => {
    expect(openingScrollTop({ ...phone, rowTop: 700, rowBottom: 744 })).toBe(188)
    // and never further than the row's own top
    expect(openingScrollTop({ viewHeight: 30, rowTop: 700, rowBottom: 744, room: 44 })).toBe(700)
  })
})

describe("the chosen size and the stored unit", () => {
  it("matches the chosen size case-blind", () => {
    expect(isChosenSize("M", "m")).toBe(true)
    expect(isChosenSize("M", undefined)).toBe(false)
    expect(isChosenSize("M", "L")).toBe(false)
  })

  it("reads only a known unit from storage", () => {
    expect(readStoredUnit({ getItem: (k) => (k === UNIT_STORAGE_KEY ? "in" : null) })).toBe("in")
    expect(readStoredUnit({ getItem: () => "mm" })).toBeNull()
    expect(
      readStoredUnit({
        getItem: () => {
          throw new Error("denied")
        },
      })
    ).toBeNull()
    expect(readStoredUnit(null)).toBeNull()
  })
})
