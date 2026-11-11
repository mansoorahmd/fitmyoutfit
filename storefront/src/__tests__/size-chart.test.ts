import { afterEach, describe, expect, it, vi } from "vitest"

import {
  UNIT_STORAGE_KEY,
  displayMeasurement,
  hasSizeChart,
  isChosenSize,
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
