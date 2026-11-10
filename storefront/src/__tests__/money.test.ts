import { describe, expect, it } from "vitest"

import { getPricesForVariant } from "@lib/util/get-product-price"
import { convertToLocale } from "@lib/util/money"

// Intl may use a non-breaking space between the currency code and the number.
const plain = (s: string) => s.replace(/\s/g, " ")

describe("convertToLocale", () => {
  // Medusa v2 stores and returns amounts in major units: 3500 means PKR 3,500.
  it.each([
    ["pkr", 3500, "PKR 3,500"],
    ["gbp", 22, "£22.00"],
    ["aed", 95, "AED 95.00"],
    ["usd", 28, "$28.00"],
  ])("formats %s %d as %s", (currency_code, amount, expected) => {
    expect(plain(convertToLocale({ amount, currency_code }))).toBe(expected)
  })

  it("accepts upper-case currency codes too", () => {
    expect(plain(convertToLocale({ amount: 3500, currency_code: "PKR" }))).toBe(
      "PKR 3,500"
    )
  })

  it("shows PKR without decimals for whole rupees", () => {
    expect(convertToLocale({ amount: 7500, currency_code: "pkr" })).not.toMatch(
      /\./
    )
  })

  it("never rounds away paisa on a PKR price", () => {
    expect(
      plain(convertToLocale({ amount: 3499.5, currency_code: "pkr" }))
    ).toBe("PKR 3,499.5")
  })

  it("falls back to the bare number when there is no currency", () => {
    expect(convertToLocale({ amount: 12, currency_code: "" })).toBe("12")
  })
})

describe("getPricesForVariant", () => {
  it("formats the backend's calculated price in the region currency", () => {
    const prices = getPricesForVariant({
      calculated_price: {
        calculated_amount: 22,
        original_amount: 22,
        currency_code: "gbp",
        calculated_price: { price_list_type: null },
      },
    })

    expect(prices?.calculated_price).toBe("£22.00")
    expect(prices?.currency_code).toBe("gbp")
  })
})
