import { seedData } from "../../seed-data"
import type { SeedData } from "../../seed-data/types"
import {
  assertValidSeedData,
  SeedDataError,
  validateSeedData,
} from "../validate-seed-data"

/** Deep copy so each test can break one thing without affecting the others. */
function clone(): SeedData {
  return JSON.parse(JSON.stringify(seedData)) as SeedData
}

describe("validateSeedData", () => {
  it("accepts the shipped placeholder data", () => {
    expect(validateSeedData(seedData)).toEqual([])
    expect(() => assertValidSeedData(seedData)).not.toThrow()
  })

  it("matches the Sprint 0 contract: 4 regions, 5 products, 11 sizes, 4 currencies", () => {
    expect(seedData.regions.data.map((r) => r.currency_code)).toEqual([
      "pkr",
      "gbp",
      "aed",
      "usd",
    ])
    expect(seedData.store.data.default_currency_code).toBe("pkr")
    expect(seedData.products.data.map((p) => p.handle)).toEqual([
      "jersey",
      "t-shirt",
      "jacket",
      "fit-kit",
      "rush-add-on",
    ])
    expect(seedData.sizes.data).toHaveLength(11)
    expect(seedData.regions.data.every((r) => r.metadata.tax_final === false)).toBe(true)
  })

  it("requires every data file to be marked as placeholder with a note", () => {
    const seed = clone()
    ;(seed.sizes as { placeholder: boolean }).placeholder = false
    seed.prices.note = " "
    const problems = validateSeedData(seed)
    expect(problems).toContain("sizes: must be marked placeholder: true")
    expect(problems.some((p) => p.startsWith("prices: needs a non-empty note"))).toBe(true)
  })

  it("rejects a product without a price in every supported currency", () => {
    const seed = clone()
    delete seed.prices.data.jersey.aed
    expect(validateSeedData(seed)).toContain('prices: product "jersey" has no price in aed')
  })

  it("rejects a product with no price row, and a price row for no product", () => {
    const seed = clone()
    delete seed.prices.data.jacket
    seed.prices.data.ghost = { pkr: 1, gbp: 1, aed: 1, usd: 1 }
    const problems = validateSeedData(seed)
    expect(problems).toContain('prices: product "jacket" has no prices')
    expect(problems).toContain('prices: "ghost" is not a product')
  })

  it("rejects zero, negative, non-numeric and over-precise prices", () => {
    const seed = clone()
    seed.prices.data.jersey.pkr = 0
    seed.prices.data["t-shirt"].gbp = -3
    seed.prices.data.jacket.aed = Number.NaN
    seed.prices.data["fit-kit"].usd = 10.123
    const problems = validateSeedData(seed)
    expect(problems.filter((p) => p.includes("above zero"))).toHaveLength(3)
    expect(problems).toContain('prices: product "fit-kit" price in usd has more than 2 decimals')
  })

  it("takes the price rule per product from the data: rush-add-on has no fixed prices", () => {
    expect(
      seedData.products.data.map((p) => [p.handle, p.has_fixed_prices])
    ).toEqual([
      ["jersey", true],
      ["t-shirt", true],
      ["jacket", true],
      ["fit-kit", true],
      ["rush-add-on", false],
    ])
    expect(seedData.prices.data["rush-add-on"]).toBeUndefined()
  })

  it("rejects prices for a product marked has_fixed_prices: false", () => {
    const seed = clone()
    seed.prices.data["rush-add-on"] = { pkr: 500, gbp: 4, aed: 15, usd: 5 }
    expect(validateSeedData(seed)).toContain(
      'prices: product "rush-add-on" has has_fixed_prices: false, so it must have no prices'
    )
  })

  it("requires prices once a product is switched to has_fixed_prices: true", () => {
    const seed = clone()
    seed.products.data[4].has_fixed_prices = true
    expect(validateSeedData(seed)).toContain('prices: product "rush-add-on" has no prices')
  })

  it("rejects a product without a has_fixed_prices flag", () => {
    const seed = clone()
    delete (seed.products.data[0] as { has_fixed_prices?: boolean }).has_fixed_prices
    expect(validateSeedData(seed)).toContain(
      'products: "jersey" has_fixed_prices must be true or false'
    )
  })

  it("checks the rush_percentage setting: present, a number, 0 to 100", () => {
    expect(seedData.settings.data.rush_percentage).toBe(20)
    const seed = clone()
    seed.settings.data.rush_percentage = 150
    expect(validateSeedData(seed)).toContain(
      "settings: rush_percentage must not be above 100, got 150."
    )
    delete (seed.settings.data as { rush_percentage?: number }).rush_percentage
    expect(validateSeedData(seed).some((p) => p.startsWith("settings: rush_percentage is not set"))).toBe(
      true
    )
  })

  it("rejects a price in a currency the store does not support", () => {
    const seed = clone()
    seed.prices.data.jersey.eur = 20
    expect(validateSeedData(seed)).toContain(
      'prices: product "jersey" has a price in unsupported currency "eur"'
    )
  })

  it("rejects duplicate product handles and duplicate sku prefixes", () => {
    const seed = clone()
    seed.products.data[1].handle = "jersey"
    seed.products.data[2].sku_prefix = "JERSEY"
    const problems = validateSeedData(seed)
    expect(problems).toContain('products: handle "jersey" is used twice')
    expect(problems).toContain('products: sku_prefix "JERSEY" is used twice')
  })

  it("rejects malformed handles and unknown collections or kinds", () => {
    const seed = clone()
    seed.products.data[0].handle = "Jersey Shirt"
    seed.products.data[1].collection_handle = "nope"
    ;(seed.products.data[2] as { kind: string }).kind = "hat"
    const problems = validateSeedData(seed)
    expect(problems).toContain('products: handle "Jersey Shirt" is not a valid handle')
    expect(problems).toContain('products: "t-shirt" refers to unknown collection "nope"')
    expect(problems).toContain('products: "jacket" has an unknown kind "hat"')
  })

  it("rejects an empty, blank or duplicate size list", () => {
    const empty = clone()
    empty.sizes.data = []
    expect(validateSeedData(empty)).toContain("sizes: the size list must not be empty")

    const blank = clone()
    blank.sizes.data = ["S", " ", "M", "M"]
    const problems = validateSeedData(blank)
    expect(problems.some((p) => p.includes("non-blank string"))).toBe(true)
    expect(problems).toContain('sizes: "M" is listed twice')
  })

  it("rejects region problems: duplicate country, bad codes, unsupported currency, bad metadata", () => {
    const seed = clone()
    seed.regions.data[1].country_codes = ["pk"]
    seed.regions.data[2].currency_code = "AED"
    seed.regions.data[3].currency_code = "eur"
    ;(seed.regions.data[0].metadata as Record<string, unknown>).tax_final = "no"
    const problems = validateSeedData(seed)
    expect(problems).toContain('regions: country "pk" belongs to more than one region')
    expect(problems.some((p) => p.includes('currency "AED" must be 3 lower-case letters'))).toBe(
      true
    )
    expect(problems.some((p) => p.includes('currency "eur" is not in the store'))).toBe(true)
    expect(problems).toContain('regions: "Pakistan" metadata.tax_final must be true or false')
  })

  it("rejects a default currency that is not supported, and a currency without a region", () => {
    const seed = clone()
    seed.store.data.default_currency_code = "eur"
    seed.store.data.supported_currencies.push("sek")
    const problems = validateSeedData(seed)
    expect(problems).toContain('store: default currency "eur" is not in supported_currencies')
    expect(problems).toContain('store: currency "sek" has no region')
  })

  it("names the store FitMyOutfit and rejects a blank store name", () => {
    expect(seedData.store.data.name).toBe("FitMyOutfit")
    const seed = clone()
    seed.store.data.name = " "
    expect(validateSeedData(seed)).toContain("store: name must not be blank")
  })

  it("gives every product https image URLs marked placeholder (no network needed)", () => {
    for (const product of seedData.products.data) {
      expect(product.images.placeholder).toBe(true)
      expect(product.images.urls.length).toBeGreaterThan(0)
      for (const url of product.images.urls) {
        expect(url).toMatch(/^https:\/\//)
      }
    }
    expect(validateSeedData(seedData).filter((p) => p.includes("image"))).toEqual([])
  })

  it("rejects image URLs that are not https, an empty list, duplicates and a missing marker", () => {
    const seed = clone()
    seed.products.data[0].images.urls = ["http://example.com/jersey.png"]
    seed.products.data[1].images.urls = ["t-shirt.png"]
    seed.products.data[2].images.urls = []
    seed.products.data[3].images.urls = ["https://x.example/a.png", "https://x.example/a.png"]
    ;(seed.products.data[4].images as { placeholder: boolean }).placeholder = false
    const problems = validateSeedData(seed)
    expect(problems).toContain(
      'products: "jersey" image "http://example.com/jersey.png" must be an https URL'
    )
    expect(problems).toContain('products: "t-shirt" image "t-shirt.png" must be an https URL')
    expect(problems).toContain('products: "jacket" needs at least one image URL')
    expect(problems).toContain('products: "fit-kit" image "https://x.example/a.png" is listed twice')
    expect(problems).toContain('products: "rush-add-on" images must be marked placeholder: true')
  })

  it("rejects a product without an images entry", () => {
    const seed = clone()
    delete (seed.products.data[0] as { images?: unknown }).images
    expect(validateSeedData(seed)).toContain(
      'products: "jersey" needs images: { placeholder, urls }'
    )
  })

  it("matches the M1 checkout contract: settings, minimums and payment providers", () => {
    expect(seedData.settings.data).toMatchObject({
      cod_max_total: 20000,
      delivery_days_standard: 15,
      delivery_days_rush: 10,
    })
    const byCountry = Object.fromEntries(
      seedData.regions.data.map((r) => [r.country_codes[0], r])
    )
    expect(byCountry.pk.metadata.min_garment_quantity).toBe(1)
    expect(byCountry.pk.payment_providers).toEqual(["pp_system_default", "pp_cod_cod"])
    for (const country of ["gb", "ae", "us"]) {
      expect(byCountry[country].metadata.min_garment_quantity).toBe(10)
      expect(byCountry[country].payment_providers).toEqual(["pp_system_default"])
    }
  })

  it("rejects invalid checkout settings and region settings", () => {
    const seed = clone()
    ;(seed.settings.data as Record<string, unknown>).cod_max_total = "lots"
    delete (seed.settings.data as Partial<typeof seed.settings.data>).delivery_days_rush
    seed.regions.data[1].metadata.min_garment_quantity = 0
    seed.regions.data[2].payment_providers = []
    seed.regions.data[3].payment_providers = ["stripe", "pp_system_default", "pp_system_default"]
    const problems = validateSeedData(seed)
    expect(problems).toContain(
      'settings: cod_max_total in the store\'s metadata must be a number, 0 or more, got "lots".'
    )
    expect(problems.some((p) => p.startsWith("settings: delivery_days_rush is not set"))).toBe(true)
    expect(problems).toContain(
      'regions: min_garment_quantity in the metadata of the region "United Kingdom" must not be below 1, got 0.'
    )
    expect(problems).toContain('regions: "United Arab Emirates" needs at least one payment provider')
    expect(problems).toContain(
      'regions: "United States" payment provider "stripe" must look like pp_<identifier>_<id>'
    )
    expect(problems).toContain(
      'regions: "United States" payment provider "pp_system_default" is listed twice'
    )
  })

  it("rejects seed rush days that are not lower than the standard days", () => {
    const seed = clone()
    seed.settings.data.delivery_days_rush = seed.settings.data.delivery_days_standard
    expect(
      validateSeedData(seed).some((p) =>
        p.startsWith("settings: delivery_days_rush in the store's metadata must be lower than delivery_days_standard")
      )
    ).toBe(true)
  })

  it("rejects size charts that miss a product, a size or a measurement", () => {
    const seed = clone()
    delete seed.sizeCharts.data.jacket
    seed.sizeCharts.data["rush-add-on"] = seed.sizeCharts.data.jersey
    seed.sizeCharts.data.jersey.rows.pop()
    seed.sizeCharts.data["t-shirt"].rows[0].values.chest = -1
    seed.sizeCharts.data["t-shirt"].rows[1].values.waist = 30
    ;(seed.sizeCharts.data["fit-kit"] as { unit: string }).unit = "in"
    const problems = validateSeedData(seed)
    expect(problems).toContain('sizeCharts: "jacket" needs a size chart')
    expect(problems).toContain('sizeCharts: "rush-add-on" is a rush_add_on, which has no size chart')
    expect(problems).toContain(
      'sizeCharts: "jersey" rows must be the sizes YS, YM, YL, YXL, XS, S, M, L, XL, 2XL, 3XL in that order'
    )
    expect(problems).toContain('sizeCharts: "t-shirt" size YS chest must be a number above zero')
    expect(problems).toContain('sizeCharts: "t-shirt" size YM has a value for unknown column "waist"')
    expect(problems).toContain('sizeCharts: "fit-kit" unit must be "cm"')
  })

  it("rejects shipping data without an option for every region, or with a bad one", () => {
    const seed = clone()
    const options = seed.shipping.data.options
    options.pop()
    options[0].amount = -1
    options[1].region_country_code = "fr"
    options[2].service_zone_name = options[0].service_zone_name
    const problems = validateSeedData(seed)
    expect(problems).toContain('shipping: option for "pk" amount must be a number, 0 or more')
    expect(problems).toContain('shipping: option for "fr" does not match a seed region\'s country')
    expect(problems).toContain('shipping: service zone name "Pakistan" is used twice')
    expect(problems).toContain('shipping: region "United Kingdom" has no shipping option')
    expect(problems).toContain('shipping: region "United States" has no shipping option')
  })

  it("assertValidSeedData throws one error that lists every problem", () => {
    const seed = clone()
    seed.sizes.data = []
    delete seed.prices.data.jersey.pkr
    expect(() => assertValidSeedData(seed)).toThrow(SeedDataError)
    expect(() => assertValidSeedData(seed)).toThrow(/size list must not be empty[\s\S]*no price in pkr/)
  })
})
