import { seedData } from "../../seed-data"
import { buildProductInput, buildSizeRanks } from "../build-product-input"

const ctx = {
  sizes: seedData.sizes.data,
  prices: seedData.prices.data,
  currencies: seedData.store.data.supported_currencies,
  shippingProfileId: "sp_1",
  salesChannelId: "sc_1",
}

const byHandle = (handle: string) => seedData.products.data.find((p) => p.handle === handle)!

describe("buildProductInput", () => {
  it("builds one variant per size for a garment, priced in all four currencies", () => {
    const input = buildProductInput(byHandle("jersey"), { ...ctx, collectionId: "pcol_1" })
    expect(input.variants.map((v) => v.title)).toEqual(seedData.sizes.data)
    expect(input.options).toHaveLength(1)
    expect(input.options[0].title).toBe("Size")
    expect(input.options[0].values).toEqual(seedData.sizes.data)
    expect(input.collection_id).toBe("pcol_1")
    expect(input.metadata).toEqual({ kind: "garment" })
    for (const variant of input.variants) {
      expect(variant.manage_inventory).toBe(false)
      expect(variant.prices).toEqual([
        { amount: 3500, currency_code: "pkr" },
        { amount: 22, currency_code: "gbp" },
        { amount: 95, currency_code: "aed" },
        { amount: 28, currency_code: "usd" },
      ])
    }
  })

  it("gives every variant a unique SKU", () => {
    const skus = buildProductInput(byHandle("t-shirt"), ctx).variants.map((v) => v.sku)
    expect(new Set(skus).size).toBe(skus.length)
    expect(skus[0]).toBe("TSHIRT-YS")
  })

  it("builds a single default variant for the extras, with no collection", () => {
    const fitKit = buildProductInput(byHandle("fit-kit"), ctx)
    expect(fitKit.variants).toHaveLength(1)
    expect(fitKit.collection_id).toBeUndefined()
    expect(fitKit.metadata).toEqual({ kind: "fit_kit" })
    expect(fitKit.variants[0].prices.find((p) => p.currency_code === "gbp")?.amount).toBe(30)

    const rush = buildProductInput(byHandle("rush-add-on"), ctx)
    expect(rush.metadata).toEqual({ kind: "rush_add_on" })
    expect(rush.variants).toHaveLength(1)
  })

  it("publishes the product in the given sales channel", () => {
    const input = buildProductInput(byHandle("jacket"), ctx)
    expect(input.status).toBe("published")
    expect(input.sales_channels).toEqual([{ id: "sc_1" }])
    expect(input.shipping_profile_id).toBe("sp_1")
  })

  it("throws when a price is missing instead of creating a free product", () => {
    expect(() =>
      buildProductInput(byHandle("jersey"), { ...ctx, currencies: [...ctx.currencies, "eur"] })
    ).toThrow(/No eur price/)
    expect(() => buildProductInput(byHandle("jersey"), { ...ctx, prices: {} })).toThrow(
      /No prices/
    )
  })

  it("ranks the sizes in the order of the size list", () => {
    const ranks = buildSizeRanks(seedData.sizes.data)
    expect(ranks.YS).toBe(0)
    expect(ranks["3XL"]).toBe(seedData.sizes.data.length - 1)
    expect(Object.keys(ranks)).toEqual(seedData.sizes.data)
  })

  it("reads sizes from the data, not from the code", () => {
    const input = buildProductInput(byHandle("jersey"), { ...ctx, sizes: ["ONE"] })
    expect(input.variants).toHaveLength(1)
    expect(input.variants[0].sku).toBe("JERSEY-ONE")
  })
})
