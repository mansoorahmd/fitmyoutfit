import { checkCashOnDelivery, isCashOnDeliveryRegion } from "../cash-on-delivery"

const pakistan = {
  regionCountryCodes: ["pk"],
  currencyCode: "pkr",
  limit: 20000,
  limitCurrencyCode: "pkr",
}

describe("checkCashOnDelivery", () => {
  it("is available in Pakistan at or below the limit", () => {
    expect(checkCashOnDelivery({ ...pakistan, total: 2250 })).toEqual({
      available: true,
      reason: null,
    })
    expect(checkCashOnDelivery({ ...pakistan, total: 20000 })).toEqual({
      available: true,
      reason: null,
    })
    expect(checkCashOnDelivery({ ...pakistan, total: 0 }).available).toBe(true)
  })

  it("is refused above the limit, even by a fraction", () => {
    expect(checkCashOnDelivery({ ...pakistan, total: 20000.01 })).toEqual({
      available: false,
      reason: "over_limit",
    })
    expect(checkCashOnDelivery({ ...pakistan, total: 22250 }).reason).toBe("over_limit")
  })

  it("is refused outside Pakistan, whatever the total", () => {
    for (const country of ["gb", "ae", "us"]) {
      expect(
        checkCashOnDelivery({ ...pakistan, regionCountryCodes: [country], total: 1 })
      ).toEqual({ available: false, reason: "region" })
    }
  })

  it("names the region before the limit when both fail", () => {
    expect(
      checkCashOnDelivery({ ...pakistan, regionCountryCodes: ["gb"], total: 999999 }).reason
    ).toBe("region")
  })

  it("refuses a cart whose currency is not the limit's, as the wrong region", () => {
    expect(checkCashOnDelivery({ ...pakistan, currencyCode: "gbp", total: 10 })).toEqual({
      available: false,
      reason: "region",
    })
    expect(checkCashOnDelivery({ ...pakistan, currencyCode: "PKR", total: 10 }).available).toBe(
      true
    )
  })

  it("refuses a total that is not a number", () => {
    expect(checkCashOnDelivery({ ...pakistan, total: Number.NaN }).reason).toBe("over_limit")
  })
})

describe("isCashOnDeliveryRegion", () => {
  it("finds pk among the region's countries, in any case", () => {
    expect(isCashOnDeliveryRegion(["pk"])).toBe(true)
    expect(isCashOnDeliveryRegion(["xx", "PK"])).toBe(true)
    expect(isCashOnDeliveryRegion([null, undefined, "gb"])).toBe(false)
    expect(isCashOnDeliveryRegion([])).toBe(false)
  })
})
