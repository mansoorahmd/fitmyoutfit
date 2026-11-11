import { describe, expect, it } from "vitest"

import {
  blocksCheckout,
  codLimitNote,
  minimumView,
  parseCheckoutRules,
  promisedDate,
  regionMinimum,
} from "@lib/util/checkout-rules"

const plain = (s: string | null) => s?.replace(/\s/g, " ")

import { rulesFixture } from "./fixtures/m1"

// The example from docs/contracts/m1-checkout.md, section 6, as the route returns it.
const CONTRACT_EXAMPLE = rulesFixture()

const rulesWith = (over: Record<string, unknown>) =>
  parseCheckoutRules({ ...CONTRACT_EXAMPLE, ...over })

describe("parseCheckoutRules", () => {
  it("reads the contract's example", () => {
    expect(parseCheckoutRules(CONTRACT_EXAMPLE)).toEqual({
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
    })
  })

  it("reads the section 8 addition: which date applies", () => {
    const rules = rulesWith({
      delivery_promise: { ...CONTRACT_EXAMPLE.delivery_promise, applies: "rush" },
    })
    expect(rules?.delivery_promise?.applies).toBe("rush")
  })

  it("reads nothing about shipping: the duty-paid marker is on the shipping option (contract section 3)", () => {
    expect(rulesWith({ shipping: { ddp: true } })).not.toHaveProperty("shipping")
  })

  it("is null for anything but an object", () => {
    for (const value of [null, undefined, "x", 3, []]) {
      expect(parseCheckoutRules(value)).toBeNull()
    }
  })

  it("leaves out a malformed part and keeps the others", () => {
    const rules = rulesWith({
      minimum_quantity: { required: "10", counted: 4, ok: false },
      delivery_promise: { standard: { days: 15, date: "26/11/2026" } },
    })
    expect(rules?.minimum_quantity).toBeNull()
    expect(rules?.delivery_promise).toBeNull()
    expect(rules?.cash_on_delivery?.limit).toBe(20000)
  })
})

describe("minimumView", () => {
  it("shows progress below the minimum", () => {
    expect(minimumView(rulesWith({}))).toEqual({
      required: 10,
      counted: 4,
      missing: 6,
      reached: false,
      fraction: 0.4,
    })
  })

  it("is reached at or above the minimum, with a full bar", () => {
    const view = minimumView(
      rulesWith({ minimum_quantity: { required: 10, counted: 12, ok: true } })
    )
    expect(view).toMatchObject({ reached: true, missing: 0, fraction: 1 })
    expect(blocksCheckout(view)).toBe(false)
  })

  it("shows nothing in Pakistan (required 1)", () => {
    expect(
      minimumView(rulesWith({ minimum_quantity: { required: 1, counted: 3, ok: true } }))
    ).toBeNull()
  })

  it("shows nothing for a cart without garments (only a fit kit)", () => {
    expect(
      minimumView(rulesWith({ minimum_quantity: { required: 10, counted: 0, ok: true } }))
    ).toBeNull()
  })

  it("shows nothing without rules", () => {
    expect(minimumView(null)).toBeNull()
    expect(blocksCheckout(null)).toBe(false)
  })

  it("blocks checkout only below the minimum", () => {
    expect(blocksCheckout(minimumView(rulesWith({})))).toBe(true)
  })
})

describe("promisedDate", () => {
  it("is the standard date until rush applies", () => {
    expect(promisedDate(rulesWith({}))).toBe("2026-11-26")
    expect(
      promisedDate(
        rulesWith({
          delivery_promise: { ...CONTRACT_EXAMPLE.delivery_promise, applies: "rush" },
        })
      )
    ).toBe("2026-11-21")
  })

  it("is null when the rules or the promise are missing: never a guess", () => {
    expect(promisedDate(null)).toBeNull()
    expect(promisedDate(rulesWith({ delivery_promise: null }))).toBeNull()
  })
})

describe("codLimitNote", () => {
  it("gives the limit, in the limit's currency, when the cart is over it", () => {
    const rules = rulesWith({
      cash_on_delivery: {
        available: false,
        reason: "over_limit",
        limit: 20000,
        limit_currency_code: "pkr",
      },
    })
    expect(plain(codLimitNote(rules))).toBe("PKR 20,000")
  })

  it("says nothing when it is available, outside Pakistan, or without rules", () => {
    expect(
      codLimitNote(
        rulesWith({
          cash_on_delivery: {
            available: true,
            reason: null,
            limit: 20000,
            limit_currency_code: "pkr",
          },
        })
      )
    ).toBeNull()
    expect(codLimitNote(rulesWith({}))).toBeNull()
    expect(codLimitNote(null)).toBeNull()
  })
})

describe("regionMinimum", () => {
  it("reads the region's min_garment_quantity when it is above 1", () => {
    expect(regionMinimum({ metadata: { min_garment_quantity: 10 } })).toBe(10)
    expect(regionMinimum({ metadata: { min_garment_quantity: "12" } })).toBe(12)
  })

  it("is null for 1, missing or bad values", () => {
    for (const metadata of [{ min_garment_quantity: 1 }, {}, { min_garment_quantity: "x" }, null]) {
      expect(regionMinimum({ metadata })).toBeNull()
    }
    expect(regionMinimum(null)).toBeNull()
  })
})
