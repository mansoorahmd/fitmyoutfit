import { seedData } from "../../seed-data"
import { missingStoreSettings } from "../store-settings"

const all = {
  rush_percentage: 20,
  cod_max_total: 20000,
  delivery_days_standard: 15,
  delivery_days_rush: 10,
}

describe("missingStoreSettings", () => {
  const defaults = seedData.settings.data

  it("ships the contract's placeholders: rush 20, cash-on-delivery limit 20000, 15 and 10 days", () => {
    expect(seedData.settings.placeholder).toBe(true)
    expect(defaults).toEqual(all)
  })

  it("returns every setting when the store has no metadata", () => {
    expect(missingStoreSettings(null, defaults)).toEqual(all)
    expect(missingStoreSettings({}, defaults)).toEqual(all)
    expect(missingStoreSettings({ rush_percentage: null }, defaults)).toEqual(all)
  })

  it("never overwrites a value that is there, even one an admin changed or broke", () => {
    const { rush_percentage: _rush, ...withoutRush } = all
    expect(missingStoreSettings({ rush_percentage: 35 }, defaults)).toEqual(withoutRush)
    expect(missingStoreSettings({ rush_percentage: "oops" }, defaults)).toEqual(withoutRush)
    expect(
      missingStoreSettings(
        { rush_percentage: 1, cod_max_total: 5, delivery_days_standard: "x", delivery_days_rush: 0 },
        defaults
      )
    ).toEqual({})
  })

  it("returns only the settings a store seeded before M1 lacks", () => {
    expect(missingStoreSettings({ rush_percentage: 20 }, defaults)).toEqual({
      cod_max_total: 20000,
      delivery_days_standard: 15,
      delivery_days_rush: 10,
    })
  })

  it("ignores other metadata keys", () => {
    expect(missingStoreSettings({ something_else: 1 }, defaults)).toEqual(all)
  })
})
