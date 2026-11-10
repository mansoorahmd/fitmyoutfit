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

  it("assertValidSeedData throws one error that lists every problem", () => {
    const seed = clone()
    seed.sizes.data = []
    delete seed.prices.data.jersey.pkr
    expect(() => assertValidSeedData(seed)).toThrow(SeedDataError)
    expect(() => assertValidSeedData(seed)).toThrow(/size list must not be empty[\s\S]*no price in pkr/)
  })
})
