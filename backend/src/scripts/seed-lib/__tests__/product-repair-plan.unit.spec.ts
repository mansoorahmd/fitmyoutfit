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

const jerseyPrices = seedData.prices.data.jersey
const currencies = seedData.store.data.supported_currencies

function pricedVariant(size: string, rank: number | null = sizes.indexOf(size)): ExistingVariant {
  return {
    id: `var_${size}`,
    sku: `JERSEY-${size}`,
    title: size,
    variant_rank: rank,
    options: [{ value: size, option_id: "opt_size" }],
    price_set: {
      id: `pset_${size}`,
      prices: currencies.map((code) => ({
        id: `price_${size}_${code}`,
        currency_code: code,
        price_list_id: null,
        rules_count: 0,
      })),
    },
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
        label: "JERSEY-YS",
        priceSetId: null,
        prices: [
          { amount: 3500, currency_code: "pkr" },
          { amount: 22, currency_code: "gbp" },
          { amount: 95, currency_code: "aed" },
          { amount: 28, currency_code: "usd" },
        ],
        partial: false,
      },
      expect.objectContaining({ variantId: "var_YM", priceSetId: "pset_empty", partial: false }),
    ])
    expect(describeRepair(repair)).toEqual(["jersey: prices"])
  })

  it("adds only the seed currencies a variant lacks, and never touches its other prices", () => {
    const product = completeJersey()
    const variants = product.variants as ExistingVariant[]
    const m = variants.findIndex((v) => v.title === "M")
    // JERSEY-M lost its pkr price; its other prices may hold amounts an admin set.
    variants[m] = {
      ...variants[m],
      price_set: {
        id: "pset_M",
        prices: variants[m].price_set!.prices!.filter((p) => p?.currency_code !== "pkr"),
      },
    }
    const repair = planProductRepair(product, seedFor("jersey"), ctx)
    expect(repair.prices).toEqual([
      {
        variantId: "var_M",
        label: "JERSEY-M",
        priceSetId: "pset_M",
        prices: [{ amount: jerseyPrices.pkr, currency_code: "pkr" }],
        partial: true,
      },
    ])
    expect(describeRepair(repair)).toEqual(["jersey: JERSEY-M prices pkr"])
  })

  it("counts only base prices: a price-list or region price does not stand in for a currency", () => {
    const product = completeJersey()
    const variants = product.variants as ExistingVariant[]
    variants[0] = {
      ...variants[0],
      price_set: {
        id: "pset_YS",
        prices: [
          ...variants[0].price_set!.prices!.filter((p) => p?.currency_code !== "usd"),
          { id: "sale", currency_code: "usd", price_list_id: "plist_1", rules_count: 0 },
          { id: "region", currency_code: "usd", price_list_id: null, rules_count: 1 },
        ],
      },
    }
    const repair = planProductRepair(product, seedFor("jersey"), ctx)
    expect(repair.prices.map((p) => [p.label, p.prices.map((x) => x.currency_code)])).toEqual([
      ["JERSEY-YS", ["usd"]],
    ])
  })

  it("leaves a variant priced in every seed currency alone (an admin may have changed the amounts)", () => {
    const repair = planProductRepair(completeJersey(), seedFor("jersey"), ctx)
    expect(repair.prices).toEqual([])
  })

  it("restores a seed variant's lost size value, found by SKU or title", () => {
    const product = completeJersey()
    const variants = product.variants as ExistingVariant[]
    const l = variants.findIndex((v) => v.title === "L")
    variants[l] = { ...variants[l], options: [] }
    const xl = variants.findIndex((v) => v.title === "XL")
    // Title renamed in the admin: the SKU still identifies it.
    variants[xl] = { ...variants[xl], title: "Extra large", options: null }
    const repair = planProductRepair(product, seedFor("jersey"), ctx)
    expect(repair.optionValues).toEqual([
      { variantId: "var_L", label: "JERSEY-L", options: { Size: "L" }, restored: { Size: "L" } },
      { variantId: "var_XL", label: "JERSEY-XL", options: { Size: "XL" }, restored: { Size: "XL" } },
    ])
    expect(repair.warnings).toEqual([])
    expect(describeRepair(repair)).toEqual([
      "jersey: JERSEY-L option Size L",
      "jersey: JERSEY-XL option Size XL",
    ])
  })

  it("keeps the variant's other option values when it restores the size", () => {
    const product = completeJersey()
    product.options = [
      ...(product.options ?? []),
      { id: "opt_color", title: "Color", values: [{ value: "Red" }, { value: "Blue" }] },
    ]
    product.variants = (product.variants as ExistingVariant[]).map((v) => ({
      ...v,
      options: [...(v.options ?? []), { value: "Red", option_id: "opt_color" }],
    }))
    const variants = product.variants as ExistingVariant[]
    variants[0] = { ...variants[0], options: [{ value: "Red", option_id: "opt_color" }] }
    const repair = planProductRepair(product, seedFor("jersey"), ctx)
    expect(repair.optionValues).toEqual([
      expect.objectContaining({ options: { Size: "YS", Color: "Red" }, restored: { Size: "YS" } }),
    ])
  })

  it("warns instead of guessing when a size cannot be restored safely", () => {
    const product = completeJersey()
    const variants = product.variants as ExistingVariant[]
    // An admin's own variant with no size: not a seed variant, so its size is unknown.
    variants.push({ id: "var_custom", sku: "JERSEY-CUSTOM", title: "Custom", options: [] })
    // The size value itself is gone from the option.
    product.options = [
      {
        id: "opt_size",
        title: "Size",
        values: sizes.filter((s) => s !== "S").map((value, rank) => ({ value, rank })),
      },
    ]
    const s = variants.findIndex((v) => v.title === "S")
    variants[s] = { ...variants[s], options: [] }
    // Another variant already holds this size.
    const m = variants.findIndex((v) => v.title === "M")
    variants[m] = { ...variants[m], sku: "JERSEY-M", options: [] }
    variants.push({ ...pricedVariant("M"), id: "var_M2", sku: "JERSEY-M-OLD" })
    const repair = planProductRepair(product, seedFor("jersey"), ctx)
    expect(repair.optionValues).toEqual([])
    expect(repair.warnings).toEqual([
      expect.stringMatching(/^jersey: variant JERSEY-S has no Size value .*the Size option has no value S/),
      expect.stringMatching(/^jersey: variant JERSEY-M has no Size value .*another variant \(JERSEY-M-OLD\)/),
      expect.stringMatching(/^jersey: variant JERSEY-CUSTOM has no Size value and is not a seed variant/),
    ])
    expect(describeRepair(repair).some((line) => line.includes("option"))).toBe(false)
  })

  it("restores the default option value of a single-variant product", () => {
    const fitKit: ExistingSeededProduct = {
      id: "prod_f",
      handle: "fit-kit",
      options: [
        { id: "opt_d", title: "Default option", values: [{ value: "Default option value" }] },
      ],
      variants: [
        {
          id: "var_f",
          sku: "FITKIT",
          title: "Fit Kit",
          options: [],
          price_set: {
            id: "pset_f",
            prices: currencies.map((code) => ({ id: `p_${code}`, currency_code: code })),
          },
        },
      ],
      sales_channels: [{ id: "sc_1" }],
      shipping_profile: { id: "sp_1" },
    }
    const repair = planProductRepair(fitKit, seedFor("fit-kit"), ctx)
    expect(repair.optionValues).toEqual([
      expect.objectContaining({ variantId: "var_f", options: { "Default option": "Default option value" } }),
    ])
  })

  it("never prices the rush add-on, but gives its variant the empty price set a clean run has", () => {
    const rush: ExistingSeededProduct = {
      id: "prod_r",
      handle: "rush-add-on",
      options: [],
      variants: [{ id: "var_r", title: "Rush Production", price_set: { id: "pset_r", prices: [] } }],
      sales_channels: [{ id: "sc_1" }],
      shipping_profile: { id: "sp_1" },
    }
    // As a clean run leaves it: an empty price set, so nothing to do.
    expect(describeRepair(planProductRepair(rush, seedFor("rush-add-on"), ctx))).toEqual([])

    // Without a price set (the admin's price editor could not add prices later): create one, empty.
    const withoutSet = { ...rush, variants: [{ id: "var_r", title: "Rush Production", price_set: null }] }
    const repair = planProductRepair(withoutSet, seedFor("rush-add-on"), ctx)
    expect(repair.prices).toEqual([
      { variantId: "var_r", label: "Rush Production", priceSetId: null, prices: [], partial: false },
    ])
    expect(describeRepair(repair)).toEqual(["rush-add-on: price set"])

    // An empty price set stays empty: the rush add-on has no price in any currency on purpose.
    const empty = planProductRepair(rush, seedFor("rush-add-on"), ctx)
    expect(empty.prices).toEqual([])
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
