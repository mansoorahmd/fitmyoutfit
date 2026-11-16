import { products } from "../../../scripts/seed-data/products"
import { toFixedString } from "../exact-amount"
import {
  hasGarment,
  isChargedForRush,
  isRushKind,
  lineBase,
  planRushLine,
  rushBase,
  rushCharge,
  rushMismatch,
  rushOffer,
  rushRefusalMessage,
  RUSH_KIND,
  RUSH_PRODUCT_HANDLE,
  type RushCartLine,
} from "../rush-charge"

const fixed = (lines: Parameters<typeof rushCharge>[0], percentage: number, digits: number) =>
  toFixedString(rushCharge(lines, percentage, digits), digits)

describe("the rush product", () => {
  it("is the seeded product with this handle and kind", () => {
    const seeded = products.data.filter((product) => product.kind === RUSH_KIND)
    expect(seeded.map((product) => product.handle)).toEqual([RUSH_PRODUCT_HANDLE])
  })
})

describe("which lines are charged", () => {
  it("charges every kind but the fit kit and rush itself, like the minimum quantity", () => {
    expect(isChargedForRush("garment")).toBe(true)
    expect(isChargedForRush(undefined)).toBe(true)
    expect(isChargedForRush("Fit_Kit")).toBe(true)
    expect(isChargedForRush("fit_kit")).toBe(false)
    expect(isChargedForRush("rush_add_on")).toBe(false)
    expect(isRushKind("rush_add_on")).toBe(true)
    expect(isRushKind("Rush_Add_On")).toBe(false)
  })

  it("needs a garment line with a quantity above 0", () => {
    expect(hasGarment([{ kind: "fit_kit", unitPrice: 5000, quantity: 1 }])).toBe(false)
    expect(hasGarment([{ kind: "garment", unitPrice: 2000, quantity: 0 }])).toBe(false)
    expect(hasGarment([{ kind: undefined, unitPrice: 2000, quantity: 1 }])).toBe(true)
  })
})

describe("the base", () => {
  it("is the garment lines after item discounts, before delivery and tax", () => {
    const lines = [
      { kind: "garment", unitPrice: 2000, quantity: 3, adjustments: [500, { value: "100" }] },
      { kind: "fit_kit", unitPrice: 5000, quantity: 1 },
      { kind: "rush_add_on", unitPrice: 1080, quantity: 1 },
    ]
    expect(toFixedString(rushBase(lines), 0)).toBe("5400")
  })

  it("never lets a line go below 0", () => {
    expect(toFixedString(lineBase({ kind: "garment", unitPrice: 10, quantity: 1, adjustments: [15] }), 0)).toBe("0")
    const lines = [
      { kind: "garment", unitPrice: 10, quantity: 1, adjustments: [15] },
      { kind: "garment", unitPrice: 20, quantity: 1 },
    ]
    expect(toFixedString(rushBase(lines), 0)).toBe("20")
  })

  it("takes the tax out of a tax-inclusive price at the line's rates", () => {
    // 120 including 20% tax is 100 before tax; less a 12 (tax-inclusive) discount: 90.
    const line = { kind: "garment", unitPrice: 120, quantity: 1, taxInclusive: true, taxRates: [20], adjustments: [12] }
    expect(toFixedString(lineBase(line), 2)).toBe("90.00")
  })
})

describe("rushCharge", () => {
  it("gives the contract's figures: PKR 2,000 at 20% is 400, GBP 220.00 at 20% is 44.00", () => {
    expect(fixed([{ kind: "garment", unitPrice: 2000, quantity: 1 }], 20, 0)).toBe("400")
    expect(fixed([{ kind: "garment", unitPrice: 22, quantity: 10 }], 20, 2)).toBe("44.00")
  })

  it("rounds half up to the currency's smallest unit, exactly", () => {
    // PKR (0 digits): 1,997.5 × 20% = 399.5 → 400; 1,997 × 20% = 399.4 → 399.
    expect(fixed([{ kind: "garment", unitPrice: "1997.5", quantity: 1 }], 20, 0)).toBe("400")
    expect(fixed([{ kind: "garment", unitPrice: 1997, quantity: 1 }], 20, 0)).toBe("399")
    // GBP (2 digits): 10.33 × 20% = 2.066 → 2.07; 10.325 × 20% = 2.065 → 2.07; 10.32 → 2.064 → 2.06.
    expect(fixed([{ kind: "garment", unitPrice: 10.33, quantity: 1 }], 20, 2)).toBe("2.07")
    expect(fixed([{ kind: "garment", unitPrice: "10.325", quantity: 1 }], 20, 2)).toBe("2.07")
    expect(fixed([{ kind: "garment", unitPrice: 10.32, quantity: 1 }], 20, 2)).toBe("2.06")
    // 0.1 + 0.2 lines at 50%: 0.15 exactly, never 0.15000000000000002 or 0.1499999.
    expect(
      fixed(
        [
          { kind: "garment", unitPrice: 0.1, quantity: 1 },
          { kind: "garment", unitPrice: 0.2, quantity: 1 },
        ],
        50,
        2
      )
    ).toBe("0.15")
    // 12.5% of 0.04 is 0.005: half a penny rounds up to 0.01.
    expect(fixed([{ kind: "garment", unitPrice: 0.04, quantity: 1 }], 12.5, 2)).toBe("0.01")
  })

  it("charges nothing for the fit kit, and 0 at 0%", () => {
    expect(fixed([{ kind: "fit_kit", unitPrice: 5000, quantity: 1 }], 20, 0)).toBe("0")
    expect(fixed([{ kind: "garment", unitPrice: 2000, quantity: 1 }], 0, 0)).toBe("0")
  })

  it("is 0 when a promotion makes the garments free", () => {
    expect(fixed([{ kind: "garment", unitPrice: 2000, quantity: 2, adjustments: [4000] }], 20, 0)).toBe("0")
  })

  it("refuses a negative percentage", () => {
    expect(() => rushCharge([], -1, 0)).toThrow()
  })
})

describe("rushOffer", () => {
  it("is not available without a garment line or at 0%, and then costs 0", () => {
    expect(rushOffer([{ kind: "fit_kit", unitPrice: 5000, quantity: 1 }], 20, 0)).toMatchObject({
      available: false,
      reason: "no_garment",
    })
    expect(rushOffer([{ kind: "garment", unitPrice: 2000, quantity: 1 }], 0, 0)).toMatchObject({
      available: false,
      reason: "not_offered",
    })
    const offer = rushOffer([{ kind: "garment", unitPrice: 2000, quantity: 1 }], 20, 0)
    expect(offer.available).toBe(true)
    expect(toFixedString(offer.amount, 0)).toBe("400")
  })

  it("has a sentence for each refusal", () => {
    expect(rushRefusalMessage("no_garment")).toMatch(/at least one garment/)
    expect(rushRefusalMessage("not_offered")).toMatch(/not offered/)
  })
})

const tee = (overrides: Partial<RushCartLine> = {}): RushCartLine => ({
  id: "item_tee",
  kind: "garment",
  unitPrice: 2000,
  quantity: 1,
  ...overrides,
})
const rush = (overrides: Partial<RushCartLine> = {}): RushCartLine => ({
  id: "item_rush",
  kind: "rush_add_on",
  unitPrice: 400,
  quantity: 1,
  isCustomPrice: false,
  isDiscountable: false,
  createdAt: "2026-11-12T10:00:00Z",
  ...overrides,
})

describe("planRushLine", () => {
  it("does nothing for a cart without rush", () => {
    expect(planRushLine([tee()], 20, 0)).toEqual({ remove: [], keep: null, removedBecause: null })
  })

  it("keeps a rush line that already holds the charge", () => {
    const plan = planRushLine([tee(), rush()], 20, 0)
    expect(plan.remove).toEqual([])
    expect(plan.keep?.id).toBe("item_rush")
    expect(plan.keep?.update).toBe(false)
  })

  it("prices it again when the garments change", () => {
    const plan = planRushLine([tee({ quantity: 3 }), rush()], 20, 0)
    expect(plan.keep && toFixedString(plan.keep.unitPrice, 0)).toBe("1200")
    expect(plan.keep?.update).toBe(true)
  })

  it("writes a line whose quantity, custom-price, discount or tax flags are wrong", () => {
    for (const wrong of [
      { quantity: 2 },
      { isCustomPrice: true },
      { isDiscountable: true },
      { isDiscountable: undefined },
      { taxInclusive: true },
      { adjustments: [10] },
      { unitPrice: null },
    ]) {
      expect(planRushLine([tee(), rush(wrong)], 20, 0).keep?.update).toBe(true)
    }
  })

  it("removes the rush line with the last garment, and when rush is switched off", () => {
    expect(planRushLine([rush()], 20, 0)).toEqual({ remove: ["item_rush"], keep: null, removedBecause: "no_garment" })
    expect(planRushLine([tee({ kind: "fit_kit" }), rush()], 20, 0).removedBecause).toBe("no_garment")
    expect(planRushLine([tee(), rush()], 0, 0)).toEqual({ remove: ["item_rush"], keep: null, removedBecause: "not_offered" })
  })

  it("keeps the oldest of two rush lines (two adds at once) on every server", () => {
    const older = rush({ id: "item_b", createdAt: "2026-11-12T10:00:00Z" })
    const newer = rush({ id: "item_a", createdAt: "2026-11-12T10:00:01Z" })
    for (const lines of [[tee(), older, newer], [tee(), newer, older]]) {
      const plan = planRushLine(lines, 20, 0)
      expect(plan.keep?.id).toBe("item_b")
      expect(plan.remove).toEqual(["item_a"])
      expect(plan.removedBecause).toBe("duplicate")
    }
    // Same time: the lower id stays.
    const same = planRushLine([tee(), rush({ id: "item_z" }), rush({ id: "item_c" })], 20, 0)
    expect(same.keep?.id).toBe("item_c")
  })
})

describe("rushMismatch", () => {
  it("accepts no rush, or exactly one line at the charge", () => {
    expect(rushMismatch([tee()], 20, 0)).toBeNull()
    expect(rushMismatch([tee(), rush()], 20, 0)).toBeNull()
    expect(rushMismatch([tee({ unitPrice: 22, quantity: 10 }), rush({ unitPrice: "44.00" })], 20, 2)).toBeNull()
  })

  it("names what differs", () => {
    expect(rushMismatch([tee({ quantity: 2 }), rush()], 20, 0)).toBe("the rush line costs 400 but the rule says 800")
    expect(rushMismatch([tee(), rush({ unitPrice: 399 })], 20, 0)).toMatch(/costs 399/)
    expect(rushMismatch([tee(), rush({ quantity: 2 })], 20, 0)).toMatch(/quantity 2/)
    expect(rushMismatch([tee(), rush(), rush({ id: "x" })], 20, 0)).toMatch(/2 rush lines/)
    expect(rushMismatch([rush()], 20, 0)).toMatch(/not available \(no_garment\)/)
    expect(rushMismatch([tee(), rush()], 0, 0)).toMatch(/not_offered/)
    expect(rushMismatch([tee(), rush({ adjustments: [1] })], 20, 0)).toMatch(/discount/)
  })
})
