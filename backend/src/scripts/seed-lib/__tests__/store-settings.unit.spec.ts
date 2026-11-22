import { seedData } from "../../seed-data"
import { missingStoreSettings } from "../store-settings"

const all = {
  rush_percentage: 20,
  cod_max_total: 20000,
  delivery_days_standard: 15,
  delivery_days_rush: 10,
  roster_max_lines: 100,
  roster_max_count: 10,
  roster_max_name_length: 18,
  schedule_time_zone: "Asia/Karachi",
  team_order_deposit_percentage: 50,
  team_order_payment_path: "/[countryCode]/account/team-orders/[id]/pay",
}

describe("missingStoreSettings", () => {
  const defaults = seedData.settings.data

  it("ships the placeholders: rush 20, cash-on-delivery limit 20000, 15 and 10 days, the roster limits, the store's time zone, the 50% deposit and the payment page", () => {
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
        {
          rush_percentage: 1,
          cod_max_total: 5,
          delivery_days_standard: "x",
          delivery_days_rush: 0,
          roster_max_lines: "y",
          roster_max_count: 0,
          roster_max_name_length: 3,
          schedule_time_zone: "nowhere",
          team_order_deposit_percentage: 0,
          team_order_payment_path: "bad",
        },
        defaults
      )
    ).toEqual({})
  })

  it("returns only the settings a store seeded before M1 lacks", () => {
    const { rush_percentage: _rush, ...rest } = all
    expect(missingStoreSettings({ rush_percentage: 20 }, defaults)).toEqual(rest)
    // a store seeded before the team lists: only the new keys are missing
    const { roster_max_lines: _a, roster_max_count: _b, roster_max_name_length: _c, schedule_time_zone: _d, team_order_deposit_percentage: _e, team_order_payment_path: _f, ...older } = all
    expect(missingStoreSettings(older, defaults)).toEqual({
      roster_max_lines: 100,
      roster_max_count: 10,
      roster_max_name_length: 18,
      schedule_time_zone: "Asia/Karachi",
      team_order_deposit_percentage: 50,
      team_order_payment_path: "/[countryCode]/account/team-orders/[id]/pay",
    })
    // a store seeded before team-order payments (M3-3): only the two new keys are missing
    const { team_order_deposit_percentage: _g, team_order_payment_path: _h, ...beforePayments } = all
    expect(missingStoreSettings(beforePayments, defaults)).toEqual({
      team_order_deposit_percentage: 50,
      team_order_payment_path: "/[countryCode]/account/team-orders/[id]/pay",
    })
  })

  it("ignores other metadata keys", () => {
    expect(missingStoreSettings({ something_else: 1 }, defaults)).toEqual(all)
  })
})
