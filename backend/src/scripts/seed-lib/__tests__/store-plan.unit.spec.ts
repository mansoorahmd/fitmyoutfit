import { seedData } from "../../seed-data"
import { MEDUSA_DEFAULT_STORE_NAME, planStoreCurrencies, planStoreName } from "../store-plan"

const wanted = seedData.store.data.supported_currencies
const ctx = { wanted, defaultCode: "pkr" }
const exactlyFour = [
  { currency_code: "pkr", is_default: true },
  { currency_code: "gbp", is_default: false },
  { currency_code: "aed", is_default: false },
  { currency_code: "usd", is_default: false },
]
const seedRegionCurrencies = ["pkr", "gbp", "aed", "usd"]

describe("planStoreCurrencies", () => {
  it("removes Medusa's default eur on a fresh store and makes pkr the default", () => {
    expect(planStoreCurrencies([{ currency_code: "eur", is_default: true }], ctx)).toEqual(
      exactlyFour
    )
    // The seed's own regions do not use eur either.
    expect(
      planStoreCurrencies([{ currency_code: "eur", is_default: true }], {
        ...ctx,
        regionCurrencies: seedRegionCurrencies,
      })
    ).toEqual(exactlyFour)
  })

  it("removes eur from an already-seeded store that has the four plus eur, when no region uses it", () => {
    const seededBefore = [{ currency_code: "eur", is_default: false }, ...exactlyFour]
    expect(
      planStoreCurrencies(seededBefore, { ...ctx, regionCurrencies: seedRegionCurrencies })
    ).toEqual(exactlyFour)
  })

  it("keeps eur when a region uses it", () => {
    const withEur = [...exactlyFour, { currency_code: "eur", is_default: false }]
    expect(
      planStoreCurrencies(withEur, { ...ctx, regionCurrencies: [...seedRegionCurrencies, "eur"] })
    ).toBeNull()
    // eur was the default: it stays, but pkr becomes the only default.
    expect(
      planStoreCurrencies([{ currency_code: "eur", is_default: true }], {
        ...ctx,
        regionCurrencies: ["eur"],
      })
    ).toEqual([...exactlyFour, { currency_code: "eur", is_default: false }])
  })

  it("keeps any other currency an admin added, with or without a region", () => {
    const withCad = [...exactlyFour, { currency_code: "cad", is_default: false }]
    expect(planStoreCurrencies(withCad, { ...ctx, regionCurrencies: ["cad"] })).toBeNull()
    expect(planStoreCurrencies(withCad, ctx)).toBeNull()
    // A missing seed currency is added back without dropping the admin's.
    const lostGbp = withCad.filter((c) => c.currency_code !== "gbp")
    expect(planStoreCurrencies(lostGbp, ctx)).toEqual(withCad)
  })

  it("changes nothing when the store has exactly the four with pkr as default", () => {
    expect(planStoreCurrencies([...exactlyFour].reverse(), ctx)).toBeNull()
  })

  it("fixes the default when another currency is marked default", () => {
    const wrongDefault = exactlyFour.map((c) => ({ ...c, is_default: c.currency_code === "usd" }))
    expect(planStoreCurrencies(wrongDefault, ctx)).toEqual(exactlyFour)
    const adminDefault = [
      ...exactlyFour.map((c) => ({ ...c, is_default: false })),
      { currency_code: "cad", is_default: true },
    ]
    expect(planStoreCurrencies(adminDefault, ctx)).toEqual([
      ...exactlyFour,
      { currency_code: "cad", is_default: false },
    ])
  })

  it("writes the list again when a seed currency lacks its price preference (interrupted update)", () => {
    expect(
      planStoreCurrencies(exactlyFour, { ...ctx, withPricePreference: ["pkr", "gbp", "aed", "usd"] })
    ).toBeNull()
    expect(
      planStoreCurrencies(exactlyFour, { ...ctx, withPricePreference: ["pkr", "gbp"] })
    ).toEqual(exactlyFour)
  })
})

describe("planStoreName", () => {
  it("renames a store that still has Medusa's default name, or none", () => {
    expect(planStoreName(MEDUSA_DEFAULT_STORE_NAME, "FitMyOutfit")).toBe("FitMyOutfit")
    expect(planStoreName("", "FitMyOutfit")).toBe("FitMyOutfit")
    expect(planStoreName(null, "FitMyOutfit")).toBe("FitMyOutfit")
  })

  it("keeps a name already set, by the seed or by an admin", () => {
    expect(planStoreName("FitMyOutfit", "FitMyOutfit")).toBeNull()
    expect(planStoreName("FitMyOutfit Lahore", "FitMyOutfit")).toBeNull()
  })
})
