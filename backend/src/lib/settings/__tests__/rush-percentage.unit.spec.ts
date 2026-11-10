import { readRushPercentage, RUSH_PERCENTAGE_KEY } from "../rush-percentage"

describe("readRushPercentage", () => {
  it("reads the percentage from a settings object", () => {
    expect(readRushPercentage({ rush_percentage: 20 })).toEqual({ ok: true, value: 20 })
    expect(readRushPercentage({ rush_percentage: 12.5, other: "x" })).toEqual({
      ok: true,
      value: 12.5,
    })
  })

  it("accepts the edges 0 and 100", () => {
    expect(readRushPercentage({ rush_percentage: 0 })).toEqual({ ok: true, value: 0 })
    expect(readRushPercentage({ rush_percentage: 100 })).toEqual({ ok: true, value: 100 })
  })

  it("accepts a number written as a string", () => {
    expect(readRushPercentage({ rush_percentage: "25" })).toEqual({ ok: true, value: 25 })
    expect(readRushPercentage({ rush_percentage: " 7.5 " })).toEqual({ ok: true, value: 7.5 })
  })

  it("reports a missing setting", () => {
    for (const settings of [null, undefined, {}, { rush_percentage: null }, { rush_percentage: "" }]) {
      const result = readRushPercentage(settings)
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error).toMatch(/is not set/)
        expect(result.error).toContain(RUSH_PERCENTAGE_KEY)
      }
    }
  })

  it("reports a value that is not a number", () => {
    for (const raw of ["twenty", "20%", true, [20], { value: 20 }, Number.NaN, Infinity]) {
      const result = readRushPercentage({ rush_percentage: raw })
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error).toMatch(/must be a (finite )?number/)
      }
    }
  })

  it("reports a negative value", () => {
    expect(readRushPercentage({ rush_percentage: -1 })).toEqual({
      ok: false,
      error: "rush_percentage must not be negative, got -1.",
    })
    expect(readRushPercentage({ rush_percentage: "-5" }).ok).toBe(false)
  })

  it("reports a value above 100", () => {
    expect(readRushPercentage({ rush_percentage: 100.5 })).toEqual({
      ok: false,
      error: "rush_percentage must not be above 100, got 100.5.",
    })
  })
})
