import { checkMinimumQuantity, countGarmentPieces, countsTowardMinimum } from "../minimum-quantity"

describe("countGarmentPieces", () => {
  it("adds up the quantities of garment lines across the cart", () => {
    expect(
      countGarmentPieces([
        { quantity: 4, kind: "garment" },
        { quantity: 3, kind: "garment" },
      ])
    ).toBe(7)
  })

  it("does not count the fit kit or the rush add-on", () => {
    expect(
      countGarmentPieces([
        { quantity: 2, kind: "garment" },
        { quantity: 1, kind: "fit_kit" },
        { quantity: 1, kind: "rush_add_on" },
      ])
    ).toBe(2)
  })

  it("counts a product with no kind as a garment (QA defect D1: kind removed)", () => {
    expect(
      countGarmentPieces([
        { quantity: 5, kind: null },
        { quantity: 3 },
        { quantity: 1, kind: undefined },
      ])
    ).toBe(9)
  })

  it("counts a product with an unknown kind as a garment (QA defect D1: kind written as Garment)", () => {
    expect(
      countGarmentPieces([
        { quantity: 4, kind: "Garment" },
        { quantity: 2, kind: "jacket" },
        { quantity: 1, kind: "" },
        { quantity: 1, kind: 7 },
        { quantity: 1, kind: { nested: true } },
      ])
    ).toBe(9)
  })

  it("compares the not-counted kinds exactly, so a mistyped fit kit counts", () => {
    expect(countsTowardMinimum("fit_kit")).toBe(false)
    expect(countsTowardMinimum("rush_add_on")).toBe(false)
    expect(countsTowardMinimum("Fit_Kit")).toBe(true)
    expect(countsTowardMinimum(" fit_kit")).toBe(true)
    expect(countsTowardMinimum("garment")).toBe(true)
  })

  it("ignores a quantity that is not a positive number", () => {
    expect(
      countGarmentPieces([
        { quantity: 0, kind: "garment" },
        { quantity: -3, kind: "garment" },
        { quantity: Number.NaN, kind: "garment" },
        { quantity: 1, kind: "garment" },
      ])
    ).toBe(1)
  })
})

describe("checkMinimumQuantity", () => {
  const garments = (quantity: number) => [{ quantity, kind: "garment" }]

  it("fails one piece below the minimum and passes at it and above", () => {
    expect(checkMinimumQuantity(garments(9), 10)).toEqual({ required: 10, counted: 9, ok: false })
    expect(checkMinimumQuantity(garments(10), 10)).toEqual({ required: 10, counted: 10, ok: true })
    expect(checkMinimumQuantity(garments(11), 10)).toEqual({ required: 10, counted: 11, ok: true })
  })

  it("passes a single piece where the minimum is 1", () => {
    expect(checkMinimumQuantity(garments(1), 1)).toEqual({ required: 1, counted: 1, ok: true })
  })

  it("passes a cart with no garment, so a fit kit can be bought alone anywhere", () => {
    expect(checkMinimumQuantity([{ quantity: 1, kind: "fit_kit" }], 10)).toEqual({
      required: 10,
      counted: 0,
      ok: true,
    })
    expect(checkMinimumQuantity([], 10).ok).toBe(true)
  })

  it("refuses 9 UK pieces with no kind or with the kind Garment, as QA ordered them (QA defect D1)", () => {
    expect(checkMinimumQuantity([{ quantity: 9 }], 10)).toEqual({ required: 10, counted: 9, ok: false })
    expect(checkMinimumQuantity([{ quantity: 9, kind: "Garment" }], 10).ok).toBe(false)
    expect(checkMinimumQuantity([{ quantity: 10 }], 10).ok).toBe(true)
  })

  it("counts garments across different products and sizes, not per line", () => {
    const lines = [
      { quantity: 3, kind: "garment" },
      { quantity: 3, kind: "garment" },
      { quantity: 3, kind: "garment" },
      { quantity: 1, kind: "fit_kit" },
    ]
    expect(checkMinimumQuantity(lines, 10)).toEqual({ required: 10, counted: 9, ok: false })
  })
})
