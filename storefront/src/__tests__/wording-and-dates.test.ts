import { describe, expect, it } from "vitest"

import {
  formatCalendarDateWithYear,
  formatDeliveryDate,
} from "@lib/util/calendar-date"
import { countWords, fill, fillParts } from "@lib/util/wording"

describe("fill", () => {
  it("fills placeholders from the values", () => {
    expect(fill("{counted} of {required} garment pieces", { counted: 7, required: 10 })).toBe(
      "7 of 10 garment pieces"
    )
  })

  it("leaves a placeholder without a value in place, so it shows in review", () => {
    expect(fill("Add {missing} more", {})).toBe("Add {missing} more")
  })
})

describe("fillParts", () => {
  it("keeps non-string values as pieces, in order", () => {
    const amount = { el: "amount" }
    expect(fillParts("{price} each", { price: amount })).toEqual([amount, " each"])
    expect(fillParts("{n} pieces in your cart · {total}", { n: 5, total: amount })).toEqual([
      "5",
      " pieces in your cart · ",
      amount,
    ])
  })
})

describe("countWords", () => {
  it("uses the singular for exactly 1", () => {
    const forms = { one: "1 piece", other: "{n} pieces" }
    expect(countWords(1, forms)).toBe("1 piece")
    expect(countWords(5, forms)).toBe("5 pieces")
    expect(countWords(0, forms)).toBe("0 pieces")
  })
})

describe("formatDeliveryDate", () => {
  it("formats the contract's date as a calendar day", () => {
    expect(formatDeliveryDate("2026-11-26")).toBe("Thursday 26 November")
  })

  it("does not move the day, whatever the time zone (built and shown in UTC)", () => {
    expect(formatDeliveryDate("2026-01-01")).toBe("Thursday 1 January")
    expect(formatDeliveryDate("2026-12-31")).toBe("Thursday 31 December")
  })

  it("is null for anything that is not a real YYYY-MM-DD date", () => {
    for (const value of ["", "26/11/2026", "2026-02-31", "2026-11-26T00:00:00Z"]) {
      expect(formatDeliveryDate(value)).toBeNull()
    }
  })

  it("formats order dates with the year", () => {
    expect(formatCalendarDateWithYear("2026-11-11")).toBe("11 November 2026")
  })
})
