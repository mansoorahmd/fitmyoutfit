import { calendarDateIn } from "../delivery-promise"
import { daysBetween, isInThePast, isScheduleState, scheduleFor } from "../team-order-schedule"

const days = { standard: 15, rush: 10 }

describe("scheduleFor", () => {
  it("has the state `none` and no signing days without a need-by date", () => {
    const s = scheduleFor({ needBy: null, today: "2026-11-22", days })
    expect(s.state).toBe("none")
    expect(s.need_by_date).toBeNull()
    expect(s.latest_sign_standard).toBeNull()
    expect(s.latest_sign_rush).toBeNull()
    expect(s.days_left_standard).toBeNull()
    expect(s.delivery_if_signed_today).toEqual({ standard: "2026-12-07", rush: "2026-12-02" })
  })

  it("counts calendar days back from the need-by date", () => {
    const s = scheduleFor({ needBy: "2027-01-31", today: "2026-11-22", days })
    expect(s.latest_sign_standard).toBe("2027-01-16")
    expect(s.latest_sign_rush).toBe("2027-01-21")
    expect(s.days).toEqual(days)
    expect(s.state).toBe("ok")
    expect(s.days_left_standard).toBe(55)
    expect(s.days_left_rush).toBe(60)
  })

  it("is `ok` on the latest day for standard delivery, `needs_rush` the day after", () => {
    expect(scheduleFor({ needBy: "2026-12-07", today: "2026-11-22", days }).state).toBe("ok")
    expect(scheduleFor({ needBy: "2026-12-07", today: "2026-11-23", days }).state).toBe("needs_rush")
  })

  it("is `needs_rush` up to the latest day for rush, `cannot_be_met` the day after", () => {
    // need-by 2026-12-02: latest standard 2026-11-17, latest rush 2026-11-22
    const onTime = scheduleFor({ needBy: "2026-12-02", today: "2026-11-22", days })
    expect(onTime.state).toBe("needs_rush")
    expect(onTime.days_left_standard).toBe(-5)
    expect(onTime.days_left_rush).toBe(0)
    expect(scheduleFor({ needBy: "2026-12-02", today: "2026-11-23", days }).state).toBe("cannot_be_met")
  })

  it("is `cannot_be_met` when the need-by date is today or sooner than rush allows", () => {
    expect(scheduleFor({ needBy: "2026-11-22", today: "2026-11-22", days }).state).toBe("cannot_be_met")
    expect(scheduleFor({ needBy: "2026-11-25", today: "2026-11-22", days }).state).toBe("cannot_be_met")
  })

  it("crosses month and year ends", () => {
    expect(scheduleFor({ needBy: "2027-01-05", today: "2026-11-22", days }).latest_sign_standard).toBe("2026-12-21")
    expect(scheduleFor({ needBy: "2027-03-01", today: "2027-01-01", days }).latest_sign_standard).toBe("2027-02-14")
    expect(scheduleFor({ needBy: "2027-03-01", today: "2027-01-01", days }).latest_sign_rush).toBe("2027-02-19")
    expect(scheduleFor({ needBy: "2026-12-31", today: "2026-11-22", days }).latest_sign_standard).toBe("2026-12-16")
  })

  it("has the leap day in a leap year and not in the next year", () => {
    expect(scheduleFor({ needBy: "2028-03-01", today: "2028-01-01", days }).latest_sign_standard).toBe("2028-02-15")
    expect(scheduleFor({ needBy: "2028-03-01", today: "2028-01-01", days }).latest_sign_rush).toBe("2028-02-20")
    expect(scheduleFor({ needBy: "2028-02-29", today: "2028-01-01", days }).latest_sign_standard).toBe("2028-02-14")
    expect(scheduleFor({ needBy: "2027-03-01", today: "2027-01-01", days }).latest_sign_rush).toBe("2027-02-19")
    // signing on 15 Feb 2028 delivers on 1 March 2028 (leap), on 15 Feb 2027 on 2 March 2027
    expect(scheduleFor({ needBy: null, today: "2028-02-15", days }).delivery_if_signed_today.standard).toBe("2028-03-01")
    expect(scheduleFor({ needBy: null, today: "2027-02-15", days }).delivery_if_signed_today.standard).toBe("2027-03-02")
  })

  it("uses the days it is given, not fixed ones", () => {
    const s = scheduleFor({ needBy: "2026-12-31", today: "2026-11-22", days: { standard: 20, rush: 7 } })
    expect(s.latest_sign_standard).toBe("2026-12-11")
    expect(s.latest_sign_rush).toBe("2026-12-24")
    expect(s.days).toEqual({ standard: 20, rush: 7 })
  })
})

describe("the store's day in a time zone (the caller passes it to scheduleFor)", () => {
  // 20:00 UTC on 22 Nov is already 23 Nov in Karachi (UTC+5), still 22 Nov in London and Los Angeles.
  const instant = new Date("2026-11-22T20:00:00Z")
  it("changes the answer at the zone's midnight", () => {
    expect(calendarDateIn(instant, "Asia/Karachi")).toBe("2026-11-23")
    expect(calendarDateIn(instant, "Europe/London")).toBe("2026-11-22")
    expect(calendarDateIn(instant, "America/Los_Angeles")).toBe("2026-11-22")
    // need-by 2026-12-07 is `ok` on 22 Nov and `needs_rush` on 23 Nov: the zone decides
    const at = (zone: string) => scheduleFor({ needBy: "2026-12-07", today: calendarDateIn(instant, zone), days }).state
    expect(at("Asia/Karachi")).toBe("needs_rush")
    expect(at("America/Los_Angeles")).toBe("ok")
  })
  it("is exact one minute either side of the zone's midnight", () => {
    expect(calendarDateIn(new Date("2026-11-22T18:59:00Z"), "Asia/Karachi")).toBe("2026-11-22")
    expect(calendarDateIn(new Date("2026-11-22T19:00:00Z"), "Asia/Karachi")).toBe("2026-11-23")
  })
})

describe("isInThePast", () => {
  it("is false for today and later, true for earlier days", () => {
    expect(isInThePast("2026-11-22", "2026-11-22")).toBe(false)
    expect(isInThePast("2026-11-23", "2026-11-22")).toBe(false)
    expect(isInThePast("2026-11-21", "2026-11-22")).toBe(true)
    expect(isInThePast("2025-12-31", "2026-01-01")).toBe(true)
  })
})

describe("daysBetween", () => {
  it("counts whole calendar days", () => {
    expect(daysBetween("2028-02-28", "2028-03-01")).toBe(2)
    expect(daysBetween("2027-02-28", "2027-03-01")).toBe(1)
    expect(daysBetween("2026-12-31", "2027-01-01")).toBe(1)
    expect(daysBetween("2026-11-22", "2026-11-22")).toBe(0)
    expect(daysBetween("2026-11-22", "2026-11-20")).toBe(-2)
  })
})

describe("isScheduleState", () => {
  it("knows the four states", () => {
    for (const s of ["none", "ok", "needs_rush", "cannot_be_met"]) expect(isScheduleState(s)).toBe(true)
    for (const s of ["late", "", null, 1, undefined]) expect(isScheduleState(s)).toBe(false)
  })
})
