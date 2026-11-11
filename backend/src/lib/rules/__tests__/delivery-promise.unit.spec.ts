import {
  addCalendarDays,
  calendarDateIn,
  deliveryPromise,
  DELIVERY_TIME_ZONE,
} from "../delivery-promise"

describe("deliveryPromise", () => {
  it("adds the standard and rush days to the base date (the contract's example)", () => {
    expect(deliveryPromise("2026-11-11", { standard: 15, rush: 10 })).toEqual({
      based_on: "2026-11-11",
      standard: { days: 15, date: "2026-11-26" },
      rush: { days: 10, date: "2026-11-21" },
    })
  })

  it("counts calendar days across month and year ends", () => {
    expect(deliveryPromise("2026-12-25", { standard: 15, rush: 10 })).toEqual({
      based_on: "2026-12-25",
      standard: { days: 15, date: "2027-01-09" },
      rush: { days: 10, date: "2027-01-04" },
    })
  })

  it("rejects a malformed base date", () => {
    expect(() => deliveryPromise("11/11/2026", { standard: 15, rush: 10 })).toThrow(/YYYY-MM-DD/)
  })
})

describe("addCalendarDays", () => {
  it("handles leap years", () => {
    expect(addCalendarDays("2028-02-20", 10)).toBe("2028-03-01")
    expect(addCalendarDays("2027-02-20", 10)).toBe("2027-03-02")
  })

  it("rejects a date that does not exist and a fractional day count", () => {
    expect(() => addCalendarDays("2026-02-30", 1)).toThrow(/Not a calendar date/)
    expect(() => addCalendarDays("2026-11-11", 1.5)).toThrow(/whole number/)
  })
})

describe("calendarDateIn", () => {
  it("uses the date in Asia/Karachi (UTC+5), not the server's", () => {
    expect(DELIVERY_TIME_ZONE).toBe("Asia/Karachi")
    // 20:00 UTC on 10 Nov is 01:00 on 11 Nov in Karachi.
    expect(calendarDateIn(new Date("2026-11-10T20:00:00Z"), DELIVERY_TIME_ZONE)).toBe("2026-11-11")
    // 18:59 UTC on 10 Nov is 23:59 on 10 Nov in Karachi.
    expect(calendarDateIn(new Date("2026-11-10T18:59:00Z"), DELIVERY_TIME_ZONE)).toBe("2026-11-10")
    expect(calendarDateIn(new Date("2026-11-10T20:00:00Z"), "UTC")).toBe("2026-11-10")
  })
})
