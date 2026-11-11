import { seedData } from "../../seed-data"
import {
  buildShippingOptionInput,
  hasLink,
  hasStoreShippingOption,
  MANUAL_FULFILLMENT_PROVIDER,
  pickShippingSet,
  pickStockLocation,
  planServiceZones,
  planShippingOptions,
  type ExistingFulfillmentSet,
  type ExistingServiceZone,
} from "../shipping-plan"

const shipping = seedData.shipping.data
const regions = seedData.regions.data

function zone(id: string, country: string, options: ExistingServiceZone["shipping_options"] = []) {
  return { id, name: id, geo_zones: [{ type: "country", country_code: country }], shipping_options: options }
}

function storeOption(id: string) {
  return { id, rules: [{ attribute: "is_return", value: "false" }] }
}

describe("shipping seed data", () => {
  it("matches the contract: one option per region, the export ones duty-paid and free", () => {
    const byCountry = Object.fromEntries(shipping.options.map((o) => [o.region_country_code, o]))
    expect(byCountry.pk).toMatchObject({ name: "Delivery in Pakistan", amount: 250, ddp: false })
    for (const country of ["gb", "ae", "us"]) {
      expect(byCountry[country]).toMatchObject({
        name: "Shipping & duties included",
        amount: 0,
        ddp: true,
      })
    }
  })
})

describe("pickStockLocation", () => {
  it("takes the location with the seed's name, else the oldest, else none", () => {
    const a = { id: "a", name: "Other", created_at: "2026-01-02T00:00:00Z" }
    const b = { id: "b", name: "Renamed hub", created_at: "2026-01-01T00:00:00Z" }
    const hub = { id: "c", name: shipping.stock_location.name, created_at: "2026-01-03T00:00:00Z" }
    expect(pickStockLocation([a, b, hub], shipping.stock_location.name)?.id).toBe("c")
    expect(pickStockLocation([a, b], shipping.stock_location.name)?.id).toBe("b")
    expect(pickStockLocation([], shipping.stock_location.name)).toBeNull()
  })
})

describe("hasLink", () => {
  it("finds an id among linked records, ignoring nulls", () => {
    expect(hasLink([null, { id: MANUAL_FULFILLMENT_PROVIDER }], MANUAL_FULFILLMENT_PROVIDER)).toBe(true)
    expect(hasLink(undefined, "x")).toBe(false)
  })
})

describe("pickShippingSet", () => {
  it("takes the location's shipping set, preferring the seed's name, never a pickup set", () => {
    const location = {
      id: "loc",
      fulfillment_sets: [
        { id: "pickup", name: shipping.fulfillment_set_name, type: "pickup" },
        { id: "other", name: "Admin set", type: "shipping" },
      ],
    }
    expect(pickShippingSet(location, shipping.fulfillment_set_name)?.id).toBe("other")
    expect(
      pickShippingSet(
        {
          id: "loc",
          fulfillment_sets: [
            ...location.fulfillment_sets,
            { id: "seed", name: shipping.fulfillment_set_name, type: "shipping" },
          ],
        },
        shipping.fulfillment_set_name
      )?.id
    ).toBe("seed")
    expect(pickShippingSet({ id: "loc", fulfillment_sets: [] }, "x")).toBeNull()
  })
})

describe("planServiceZones and planShippingOptions", () => {
  it("creates a zone per region on an empty set, and options only once zones exist", () => {
    const set: ExistingFulfillmentSet = { id: "set", type: "shipping", service_zones: [] }
    expect(planServiceZones(set, shipping, regions)).toEqual(
      shipping.options.map((option) => ({
        name: option.service_zone_name,
        countryCodes: [option.region_country_code],
        option,
      }))
    )
    expect(planShippingOptions(set, shipping, regions)).toEqual([])
  })

  it("matches zones by country, so a renamed zone is not created again", () => {
    const set = {
      id: "set",
      service_zones: [zone("renamed", "PK"), zone("z-gb", "gb"), zone("z-ae", "ae")],
    }
    expect(planServiceZones(set, shipping, regions).map((z) => z.name)).toEqual(["United States"])
  })

  it("creates an option, in the region's currency, only for a zone with no store option", () => {
    const set = {
      id: "set",
      service_zones: [
        zone("z-pk", "pk", [storeOption("so_pk")]),
        zone("z-gb", "gb", [{ id: "return", rules: [{ attribute: "is_return", value: "true" }] }]),
        zone("z-ae", "ae", [storeOption("so_ae")]),
        zone("z-us", "us"),
      ],
    }
    const plan = planShippingOptions(set, shipping, regions)
    expect(plan.map((p) => [p.regionName, p.serviceZoneId, p.currencyCode])).toEqual([
      ["United Kingdom", "z-gb", "gbp"],
      ["United States", "z-us", "usd"],
    ])
  })

  it("counts an option without rules as a store option", () => {
    expect(hasStoreShippingOption(zone("z", "pk", [{ id: "so" }]))).toBe(true)
    expect(hasStoreShippingOption(zone("z", "pk", [null]))).toBe(false)
  })
})

describe("buildShippingOptionInput", () => {
  const plan = planShippingOptions(
    { id: "set", service_zones: ["pk", "gb"].map((c) => zone(`z-${c}`, c)) },
    shipping,
    regions
  )

  it("builds a flat, manual, store option with data.ddp only on export options", () => {
    const pk = buildShippingOptionInput(plan[0], "sp_1")
    expect(pk).toMatchObject({
      name: "Delivery in Pakistan",
      price_type: "flat",
      provider_id: "manual_manual",
      service_zone_id: "z-pk",
      shipping_profile_id: "sp_1",
      data: {},
      prices: [{ currency_code: "pkr", amount: 250 }],
    })
    expect(pk.rules).toEqual([
      { attribute: "enabled_in_store", value: "true", operator: "eq" },
      { attribute: "is_return", value: "false", operator: "eq" },
    ])
    const gb = buildShippingOptionInput(plan[1], "sp_1")
    expect(gb).toMatchObject({
      name: "Shipping & duties included",
      data: { ddp: true },
      prices: [{ currency_code: "gbp", amount: 0 }],
    })
  })
})
