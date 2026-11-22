import { readRosterLimits } from "../roster-limits"

describe("readRosterLimits", () => {
  it("returns nothing to change when no key is set, so the package defaults apply", () => {
    expect(readRosterLimits(undefined)).toEqual({ ok: true, value: {} })
    expect(readRosterLimits({})).toEqual({ ok: true, value: {} })
    expect(readRosterLimits({ roster_max_lines: "", roster_max_count: null })).toEqual({ ok: true, value: {} })
  })

  it("reads the three keys, as numbers or numeric strings", () => {
    expect(readRosterLimits({ roster_max_lines: 60, roster_max_count: "5", roster_max_name_length: 16 })).toEqual({
      ok: true,
      value: { maxLines: 60, maxCount: 5, maxNameLength: 16 },
    })
  })

  it.each([
    [{ roster_max_lines: 0 }, "roster_max_lines"],
    [{ roster_max_lines: 1001 }, "roster_max_lines"],
    [{ roster_max_count: 1.5 }, "roster_max_count"],
    [{ roster_max_name_length: "long" }, "roster_max_name_length"],
    [{ roster_max_name_length: -3 }, "roster_max_name_length"],
  ])("refuses %j, naming the key", (settings, key) => {
    const result = readRosterLimits(settings)
    expect(result.ok).toBe(false)
    expect(result.ok ? "" : result.error).toContain(key)
  })
})
