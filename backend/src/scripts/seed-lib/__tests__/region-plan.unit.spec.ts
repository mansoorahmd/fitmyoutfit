import { seedData } from "../../seed-data"
import { planRegions, type ExistingRegion } from "../region-plan"

const seeds = seedData.regions.data
const seedByCountry = Object.fromEntries(seeds.map((s) => [s.country_codes[0], s]))

/** An existing region as a complete seed run leaves it: the seed's providers and metadata. */
function region(
  id: string,
  name: string,
  country: string,
  overrides: Partial<ExistingRegion> = {}
): ExistingRegion {
  const seed = seedByCountry[country.toLowerCase()]
  return {
    id,
    name,
    countries: [{ iso_2: country }],
    payment_providers: (seed?.payment_providers ?? ["pp_system_default"]).map((p) => ({ id: p })),
    metadata: { ...(seed?.metadata ?? {}) },
    ...overrides,
  }
}

const empty = { create: [], linkPaymentProviders: [], addMetadata: [] }

describe("planRegions", () => {
  it("creates all four on an empty store", () => {
    const plan = planRegions([], seeds)
    expect(plan.create.map((r) => r.name)).toEqual([
      "Pakistan",
      "United Kingdom",
      "United Arab Emirates",
      "United States",
    ])
    expect(plan.linkPaymentProviders).toEqual([])
    expect(plan.addMetadata).toEqual([])
  })

  it("matches regions by country code, so a region renamed in the admin is not created again", () => {
    const existing = [
      region("reg_pk", "Pakistan (PKR)", "pk"),
      region("reg_gb", "UK", "gb"),
      region("reg_ae", "United Arab Emirates", "ae"),
      region("reg_us", "United States", "us"),
    ]
    expect(planRegions(existing, seeds)).toEqual(empty)
  })

  it("does not take a region with the seed's name but another country as a match", () => {
    const plan = planRegions([region("reg_x", "Pakistan", "in")], seeds)
    expect(plan.create.map((r) => r.name)).toContain("Pakistan")
  })

  it("creates only the missing ones, and accepts upper-case country codes", () => {
    const plan = planRegions([region("reg_pk", "Pakistan", "PK")], seeds)
    expect(plan.create.map((r) => r.country_codes[0])).toEqual(["gb", "ae", "us"])
  })

  it("links the seed's payment providers to a seed region left without any", () => {
    const plan = planRegions(
      [region("reg_pk", "Pakistan", "pk", { payment_providers: [] }), region("reg_gb", "UK", "gb")],
      seeds
    )
    expect(plan.linkPaymentProviders).toEqual([
      {
        regionId: "reg_pk",
        seedName: "Pakistan",
        providers: ["pp_system_default", "pp_cod_cod"],
        added: ["pp_system_default", "pp_cod_cod"],
      },
    ])
  })

  it("adds cash on delivery to a Pakistan seeded before it existed, keeping an admin's provider", () => {
    const plan = planRegions(
      [
        region("reg_pk", "Pakistan", "pk", {
          payment_providers: [{ id: "pp_system_default" }, { id: "pp_other_admin" }],
        }),
      ],
      seeds
    )
    expect(plan.linkPaymentProviders).toEqual([
      {
        regionId: "reg_pk",
        seedName: "Pakistan",
        providers: ["pp_system_default", "pp_other_admin", "pp_cod_cod"],
        added: ["pp_cod_cod"],
      },
    ])
  })

  it("never links cash on delivery to the export regions", () => {
    const plan = planRegions(
      ["gb", "ae", "us"].map((c) => region(`reg_${c}`, c, c, { payment_providers: [] })),
      seeds
    )
    for (const entry of plan.linkPaymentProviders) {
      expect(entry.providers).toEqual(["pp_system_default"])
    }
  })

  it("adds a missing metadata key and keeps every value that is set", () => {
    const plan = planRegions(
      [
        region("reg_gb", "UK", "gb", { metadata: { tax_final: true, note: "admin" } }),
        region("reg_pk", "Pakistan", "pk", { metadata: { tax_final: false, min_garment_quantity: 5 } }),
      ],
      seeds
    )
    expect(plan.addMetadata).toEqual([
      {
        regionId: "reg_gb",
        seedName: "United Kingdom",
        metadata: { tax_final: true, note: "admin", min_garment_quantity: 10 },
        added: ["min_garment_quantity"],
      },
    ])
  })

  it("treats null metadata as empty", () => {
    const plan = planRegions([region("reg_pk", "Pakistan", "pk", { metadata: null })], seeds)
    expect(plan.addMetadata[0].added).toEqual(["tax_final", "min_garment_quantity"])
  })

  it("ignores regions that hold none of the seed countries", () => {
    const plan = planRegions(
      [region("reg_fr", "France", "fr", { payment_providers: [], metadata: null })],
      seeds
    )
    expect(plan.create).toHaveLength(4)
    expect(plan.linkPaymentProviders).toEqual([])
    expect(plan.addMetadata).toEqual([])
  })
})
