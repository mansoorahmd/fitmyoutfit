import { seedData } from "../../seed-data"
import {
  describeRepair,
  orderedIds,
  planProductRepair,
  type ExistingSeededProduct,
  type ExistingVariant,
} from "../product-repair-plan"

const sizes = seedData.sizes.data
const ctx = {
  sizes,
  prices: seedData.prices.data,
  currencies: seedData.store.data.supported_currencies,
  salesChannelId: "sc_1",
  shippingProfileId: "sp_1",
}
const seedFor = (handle: string) => seedData.products.data.find((p) => p.handle === handle)!

function pricedVariant(size: string, rank: number | null = sizes.indexOf(size)): ExistingVariant {
  return {
    id: `var_${size}`,
    title: size,
    variant_rank: rank,
    options: [{ value: size }],
    price_set: { id: `pset_${size}`, prices: [{ id: `price_${size}` }] },
  }
}

/** A jersey exactly as a complete seed run leaves it. */
function completeJersey(): ExistingSeededProduct {
  return {
    id: "prod_1",
    handle: "jersey",
    options: [
      { id: "opt_size", title: "Size", values: sizes.map((value, rank) => ({ value, rank })) },
    ],
    variants: sizes.map((size) => pricedVariant(size)),
    sales_channels: [{ id: "sc_1" }],
    shipping_profile: { id: "sp_1" },
  }
}

describe("planProductRepair", () => {
  it("changes nothing on a complete product", () => {
    const repair = planProductRepair(completeJersey(), seedFor("jersey"), ctx)
    expect(describeRepair(repair)).toEqual([])
  })

  it("restores the size ranks when the option values have none (interrupted before ranking)", () => {
    const product = completeJersey()
    product.options = [
      { id: "opt_size", title: "Size", values: [...sizes].reverse().map((value) => ({ value, rank: null })) },
    ]
    const repair = planProductRepair(product, seedFor("jersey"), ctx)
    expect(repair.sizeRanks).toEqual({
      optionId: "opt_size",
      ranks: Object.fromEntries(sizes.map((s, i) => [s, i])),
    })
  })

  it("restores the size ranks when two sizes share one rank", () => {
    const product = completeJersey()
    product.options = [{ id: "opt_size", title: "Size", values: sizes.map((value) => ({ value, rank: 0 })) }]
    expect(planProductRepair(product, seedFor("jersey"), ctx).sizeRanks).not.toBeNull()
  })

  it("keeps an order an admin set with distinct ranks", () => {
    const product = completeJersey()
    product.options = [
      { id: "opt_size", title: "Size", values: sizes.map((value, i) => ({ value, rank: 100 - i })) },
    ]
    expect(planProductRepair(product, seedFor("jersey"), ctx).sizeRanks).toBeNull()
  })

  it("restores variant ranks when the variants have none or all share one", () => {
    const product = completeJersey()
    product.variants = sizes.map((size) => pricedVariant(size, 0))
    const repair = planProductRepair(product, seedFor("jersey"), ctx)
    expect(repair.variantRanks).toHaveLength(sizes.length)
    expect(repair.variantRanks.find((v) => v.id === "var_3XL")?.variant_rank).toBe(10)
    expect(repair.variantRanks.find((v) => v.id === "var_YS")?.variant_rank).toBe(0)
  })

  it("gives the seed prices to variants with no price at all, with or without a price set", () => {
    const product = completeJersey()
    const variants = product.variants as ExistingVariant[]
    variants[0] = { ...variants[0], price_set: null }
    variants[1] = { ...variants[1], price_set: { id: "pset_empty", prices: [] } }
    const repair = planProductRepair(product, seedFor("jersey"), ctx)
    expect(repair.prices).toEqual([
      {
        variantId: "var_YS",
        priceSetId: null,
        prices: [
          { amount: 3500, currency_code: "pkr" },
          { amount: 22, currency_code: "gbp" },
          { amount: 95, currency_code: "aed" },
          { amount: 28, currency_code: "usd" },
        ],
      },
      expect.objectContaining({ variantId: "var_YM", priceSetId: "pset_empty" }),
    ])
  })

  it("leaves a variant with some prices alone (an admin may have changed them)", () => {
    const repair = planProductRepair(completeJersey(), seedFor("jersey"), ctx)
    expect(repair.prices).toEqual([])
  })

  it("never prices the rush add-on, which has no fixed prices", () => {
    const rush: ExistingSeededProduct = {
      id: "prod_r",
      handle: "rush-add-on",
      options: [],
      variants: [{ id: "var_r", title: "Rush Production", price_set: null }],
      sales_channels: [{ id: "sc_1" }],
      shipping_profile: { id: "sp_1" },
    }
    expect(describeRepair(planProductRepair(rush, seedFor("rush-add-on"), ctx))).toEqual([])
  })

  it("creates the seed variants for a product left with none (interrupted before variants)", () => {
    const product = { ...completeJersey(), variants: [] }
    const repair = planProductRepair(product, seedFor("jersey"), ctx)
    expect(repair.createVariants.map((v) => v.title)).toEqual(sizes)
    expect(repair.createVariants.every((v) => v.product_id === "prod_1")).toBe(true)
    expect(repair.createVariants[0].prices).toHaveLength(4)
    expect(repair.createVariants.map((v) => v.variant_rank)).toEqual(sizes.map((_, i) => i))
  })

  it("links a product left without a sales channel or shipping profile", () => {
    const product = { ...completeJersey(), sales_channels: [], shipping_profile: null }
    const repair = planProductRepair(product, seedFor("jersey"), ctx)
    expect(repair.linkSalesChannel).toBe(true)
    expect(repair.linkShippingProfile).toBe(true)
    expect(describeRepair(repair)).toEqual(["jersey: sales channel", "jersey: shipping profile"])
  })
})

describe("orderedIds", () => {
  it("hands out generated ids sorted, so the first seed product gets the smallest", () => {
    const generated = ["prod_01C", "prod_01A", "prod_01B"]
    expect(orderedIds(3, () => generated.shift() as string)).toEqual([
      "prod_01A",
      "prod_01B",
      "prod_01C",
    ])
  })

  it("refuses duplicate ids", () => {
    expect(() => orderedIds(2, () => "prod_same")).toThrow("not unique")
  })
})
