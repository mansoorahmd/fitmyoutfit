import { checkMinimumQuantity, countGarmentPieces } from "../minimum-quantity"

describe("countGarmentPieces", () => {
  it("adds up the quantities of garment lines across the cart", () => {
    expect(
      countGarmentPieces([
        { quantity: 4, kind: "garment" },
        { quantity: 3, kind: "garment" },
      ])
    ).toBe(7)
  })

  it("does not count the fit kit, the rush add-on or a product without a kind", () => {
    expect(
      countGarmentPieces([
        { quantity: 2, kind: "garment" },
        { quantity: 1, kind: "fit_kit" },
        { quantity: 1, kind: "rush_add_on" },
        { quantity: 5, kind: null },
        { quantity: 5 },
      ])
    ).toBe(2)
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
