import { seedData } from "../../seed-data"
import { MEDUSA_DEFAULT_STORE_NAME, planStoreCurrencies, planStoreName } from "../store-plan"

const wanted = seedData.store.data.supported_currencies
const exactlyFour = [
  { currency_code: "pkr", is_default: true },
  { currency_code: "gbp", is_default: false },
  { currency_code: "aed", is_default: false },
  { currency_code: "usd", is_default: false },
]

describe("planStoreCurrencies", () => {
  it("removes Medusa's default eur and makes pkr the default", () => {
    expect(planStoreCurrencies([{ currency_code: "eur", is_default: true }], wanted, "pkr")).toEqual(
      exactlyFour
    )
  })

  it("removes eur from an already-seeded store that has the four plus eur", () => {
    const seededBefore = [{ currency_code: "eur", is_default: false }, ...exactlyFour]
    expect(planStoreCurrencies(seededBefore, wanted, "pkr")).toEqual(exactlyFour)
  })

  it("changes nothing when the store has exactly the four with pkr as default", () => {
    expect(planStoreCurrencies([...exactlyFour].reverse(), wanted, "pkr")).toBeNull()
  })

  it("fixes the default when another currency is marked default", () => {
    const wrongDefault = exactlyFour.map((c) => ({ ...c, is_default: c.currency_code === "usd" }))
    expect(planStoreCurrencies(wrongDefault, wanted, "pkr")).toEqual(exactlyFour)
  })

  it("writes the list again when a currency lacks its price preference (interrupted update)", () => {
    expect(planStoreCurrencies(exactlyFour, wanted, "pkr", ["pkr", "gbp", "aed", "usd"])).toBeNull()
    expect(planStoreCurrencies(exactlyFour, wanted, "pkr", ["pkr", "gbp"])).toEqual(exactlyFour)
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
