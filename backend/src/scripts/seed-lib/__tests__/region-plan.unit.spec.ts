import { seedData } from "../../seed-data"
import { planRegions, type ExistingRegion } from "../region-plan"

const seeds = seedData.regions.data
const provider = [{ id: "pp_system_default" }]

function region(id: string, name: string, country: string, withProvider = true): ExistingRegion {
  return {
    id,
    name,
    countries: [{ iso_2: country }],
    payment_providers: withProvider ? provider : [],
  }
}

describe("planRegions", () => {
  it("creates all four on an empty store", () => {
    const plan = planRegions([], seeds)
    expect(plan.create.map((r) => r.name)).toEqual([
      "Pakistan",
      "United Kingdom",
      "United Arab Emirates",
      "United States",
    ])
    expect(plan.linkPaymentProvider).toEqual([])
  })

  it("matches regions by country code, so a region renamed in the admin is not created again", () => {
    const existing = [
      region("reg_pk", "Pakistan (PKR)", "pk"),
      region("reg_gb", "UK", "gb"),
      region("reg_ae", "United Arab Emirates", "ae"),
      region("reg_us", "United States", "us"),
    ]
    expect(planRegions(existing, seeds)).toEqual({ create: [], linkPaymentProvider: [] })
  })

  it("does not take a region with the seed's name but another country as a match", () => {
    const plan = planRegions([region("reg_x", "Pakistan", "in")], seeds)
    expect(plan.create.map((r) => r.name)).toContain("Pakistan")
  })

  it("creates only the missing ones, and accepts upper-case country codes", () => {
    const plan = planRegions([region("reg_pk", "Pakistan", "PK")], seeds)
    expect(plan.create.map((r) => r.country_codes[0])).toEqual(["gb", "ae", "us"])
  })

  it("links the default payment provider to a seed region left without any", () => {
    const plan = planRegions(
      [region("reg_pk", "Pakistan", "pk", false), region("reg_gb", "UK", "gb")],
      seeds
    )
    expect(plan.linkPaymentProvider).toEqual([{ regionId: "reg_pk", seedName: "Pakistan" }])
  })

  it("ignores regions that hold none of the seed countries", () => {
    const plan = planRegions([region("reg_fr", "France", "fr", false)], seeds)
    expect(plan.create).toHaveLength(4)
    expect(plan.linkPaymentProvider).toEqual([])
  })
})
