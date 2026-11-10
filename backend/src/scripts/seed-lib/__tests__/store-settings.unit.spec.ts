import { seedData } from "../../seed-data"
import { missingStoreSettings } from "../store-settings"

describe("missingStoreSettings", () => {
  const defaults = seedData.settings.data

  it("ships rush_percentage 20 as the placeholder", () => {
    expect(seedData.settings.placeholder).toBe(true)
    expect(defaults).toEqual({ rush_percentage: 20 })
  })

  it("returns every setting when the store has no metadata", () => {
    expect(missingStoreSettings(null, defaults)).toEqual({ rush_percentage: 20 })
    expect(missingStoreSettings({}, defaults)).toEqual({ rush_percentage: 20 })
    expect(missingStoreSettings({ rush_percentage: null }, defaults)).toEqual({
      rush_percentage: 20,
    })
  })

  it("never overwrites a value that is there, even one an admin changed or broke", () => {
    expect(missingStoreSettings({ rush_percentage: 35 }, defaults)).toEqual({})
    expect(missingStoreSettings({ rush_percentage: "oops" }, defaults)).toEqual({})
  })

  it("ignores other metadata keys", () => {
    expect(missingStoreSettings({ something_else: 1 }, defaults)).toEqual({ rush_percentage: 20 })
  })
})
