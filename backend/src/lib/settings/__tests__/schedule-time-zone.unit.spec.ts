import { readScheduleTimeZone } from "../schedule-time-zone"

describe("readScheduleTimeZone", () => {
  it("reads a time zone name", () => {
    expect(readScheduleTimeZone({ schedule_time_zone: "Asia/Karachi" })).toEqual({ ok: true, value: "Asia/Karachi" })
    expect(readScheduleTimeZone({ schedule_time_zone: " Europe/London " })).toEqual({ ok: true, value: "Europe/London" })
    expect(readScheduleTimeZone({ schedule_time_zone: "UTC" })).toEqual({ ok: true, value: "UTC" })
  })
  it.each([[undefined], [{}], [{ schedule_time_zone: "" }], [{ schedule_time_zone: null }]])("says it is not set for %j", (settings) => {
    const r = readScheduleTimeZone(settings)
    expect(r.ok).toBe(false)
    expect(r.ok ? "" : r.error).toContain("schedule_time_zone is not set")
  })
  it.each(["Mars/Olympus", "PKT+5", 5, true])("refuses %j, naming the key", (value) => {
    const r = readScheduleTimeZone({ schedule_time_zone: value })
    expect(r.ok).toBe(false)
    expect(r.ok ? "" : r.error).toContain("schedule_time_zone")
  })
})
