import { checkoutRefusals, evaluateCheckoutRules, type CheckoutRulesInput } from "../checkout-rules"

const storeSettings = {
  rush_percentage: 20,
  cod_max_total: 20000,
  delivery_days_standard: 15,
  delivery_days_rush: 10,
}

function input(overrides: Partial<CheckoutRulesInput> = {}): CheckoutRulesInput {
  return {
    lines: [{ quantity: 4, kind: "garment" }],
    region: { name: "United Kingdom", countryCodes: ["gb"], metadata: { min_garment_quantity: 10 } },
    currencyCode: "gbp",
    total: 56,
    storeSettings,
    baseDate: "2026-11-11",
    deliverySpeed: "standard",
    ...overrides,
  }
}

describe("evaluateCheckoutRules", () => {
  it("returns exactly the contract's example JSON for a UK cart of 4 garments", () => {
    expect(evaluateCheckoutRules(input())).toEqual({
      ok: true,
      value: {
        minimum_quantity: { required: 10, counted: 4, ok: false },
        cash_on_delivery: {
          available: false,
          reason: "region",
          limit: 20000,
          limit_currency_code: "pkr",
        },
        delivery_promise: {
          based_on: "2026-11-11",
          standard: { days: 15, date: "2026-11-26" },
          rush: { days: 10, date: "2026-11-21" },
          applies: "standard",
        },
      },
    })
  })

  it("passes on which delivery date applies", () => {
    const rush = evaluateCheckoutRules(input({ deliverySpeed: "rush" }))
    expect(rush.ok && rush.value.delivery_promise.applies).toBe("rush")
  })

  it("counts a product with no kind towards the minimum (QA defect D1)", () => {
    const result = evaluateCheckoutRules(input({ lines: [{ quantity: 9 }, { quantity: 1, kind: "fit_kit" }] }))
    expect(result.ok && result.value.minimum_quantity).toEqual({ required: 10, counted: 9, ok: false })
  })

  it("reports rush days that are not lower than standard days as an invalid setting", () => {
    const result = evaluateCheckoutRules(
      input({ storeSettings: { ...storeSettings, delivery_days_rush: 20 } })
    )
    expect(result.ok).toBe(false)
    expect(!result.ok && result.error).toContain(
      "delivery_days_rush in the store's metadata must be lower than delivery_days_standard"
    )
  })

  it("offers cash on delivery for a Pakistan cart of 1 T-shirt", () => {
    const result = evaluateCheckoutRules(
      input({
        lines: [{ quantity: 1, kind: "garment" }],
        region: { name: "Pakistan", countryCodes: ["pk"], metadata: { min_garment_quantity: 1 } },
        currencyCode: "pkr",
        total: 2250,
      })
    )
    expect(result.ok && result.value.minimum_quantity).toEqual({ required: 1, counted: 1, ok: true })
    expect(result.ok && result.value.cash_on_delivery).toEqual({
      available: true,
      reason: null,
      limit: 20000,
      limit_currency_code: "pkr",
    })
  })

  it("reads settings written as strings by the admin's metadata editor", () => {
    const result = evaluateCheckoutRules(
      input({
        storeSettings: { cod_max_total: "5000", delivery_days_standard: "12", delivery_days_rush: "7" },
        region: { name: "Pakistan", countryCodes: ["pk"], metadata: { min_garment_quantity: "1" } },
        currencyCode: "pkr",
        total: 6000,
      })
    )
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.cash_on_delivery.reason).toBe("over_limit")
      expect(result.value.cash_on_delivery.limit).toBe(5000)
      expect(result.value.delivery_promise.standard).toEqual({ days: 12, date: "2026-11-23" })
      expect(result.value.minimum_quantity.required).toBe(1)
    }
  })

  it("names every missing or invalid setting in one readable error", () => {
    const result = evaluateCheckoutRules(
      input({
        storeSettings: { delivery_days_standard: 15, delivery_days_rush: 2.5 },
        region: { name: "United Kingdom", countryCodes: ["gb"], metadata: { tax_final: false } },
      })
    )
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain(
        'min_garment_quantity is not set. Add it to the metadata of the region "United Kingdom"'
      )
      expect(result.error).toContain("cod_max_total is not set. Add it to the store's metadata")
      expect(result.error).toContain(
        "delivery_days_rush in the store's metadata must be a whole number, got 2.5."
      )
    }
  })
})

describe("checkoutRefusals", () => {
  const rules = (overrides: Partial<CheckoutRulesInput>) => {
    const result = evaluateCheckoutRules(input(overrides))
    if (!result.ok) throw new Error(result.error)
    return result.value
  }

  it("refuses completion below the minimum, and nothing at or above it", () => {
    const below = rules({ lines: [{ quantity: 9, kind: "garment" }] })
    expect(checkoutRefusals(below, { usesCashOnDelivery: false, checkMinimum: true })).toEqual([
      "The minimum order in this region is 10 garment pieces; this cart has 9.",
    ])
    const at = rules({ lines: [{ quantity: 10, kind: "garment" }] })
    expect(checkoutRefusals(at, { usesCashOnDelivery: false, checkMinimum: true })).toEqual([])
  })

  it("leaves the minimum out while only the payment method is chosen", () => {
    const below = rules({ lines: [{ quantity: 9, kind: "garment" }] })
    expect(checkoutRefusals(below, { usesCashOnDelivery: false, checkMinimum: false })).toEqual([])
  })

  it("refuses cash on delivery outside Pakistan and above the limit, and not otherwise", () => {
    const uk = rules({ lines: [{ quantity: 10, kind: "garment" }] })
    expect(checkoutRefusals(uk, { usesCashOnDelivery: true, checkMinimum: true })).toEqual([
      "Cash on delivery is available in Pakistan only.",
    ])
    expect(checkoutRefusals(uk, { usesCashOnDelivery: false, checkMinimum: true })).toEqual([])

    const pakistan = {
      region: { name: "Pakistan", countryCodes: ["pk"], metadata: { min_garment_quantity: 1 } },
      currencyCode: "pkr",
    }
    const over = rules({ ...pakistan, total: 22250 })
    expect(
      checkoutRefusals(over, {
        usesCashOnDelivery: true,
        checkMinimum: true,
        currencyCode: "pkr",
        total: 22250,
      })
    ).toEqual(["Cash on delivery is available up to 20000 PKR. This cart's total is 22250 PKR."])
    const under = rules({ ...pakistan, total: 2250 })
    expect(checkoutRefusals(under, { usesCashOnDelivery: true, checkMinimum: true })).toEqual([])
  })
})
