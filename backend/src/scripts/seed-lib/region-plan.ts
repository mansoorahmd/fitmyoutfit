/**
 * Which seed regions the store still needs, and which existing regions need repair.
 * Plain TypeScript, no Medusa imports.
 *
 * Regions are matched by country code, not by name: an admin may rename "Pakistan", but the
 * country `pk` still belongs to that region, and Medusa allows a country in one region only.
 */
import type { RegionSeed } from "../seed-data/types"

export type ExistingRegion = {
  id: string
  name?: string | null
  metadata?: Record<string, unknown> | null
  countries?: readonly ({ iso_2?: string | null } | null)[] | null
  payment_providers?: readonly ({ id?: string | null } | null)[] | null
}

export type RegionPlan = {
  /** Seed regions none of whose countries is in a region yet: create these. */
  create: RegionSeed[]
  /**
   * Existing seed regions that lack one of the seed's payment providers (a region-create that
   * stopped before its providers were linked, or a database seeded before the provider existed).
   * `providers` is the full list to set: the region's current providers plus `added`, so a
   * provider an admin linked is kept.
   */
  linkPaymentProviders: {
    regionId: string
    seedName: string
    providers: string[]
    added: string[]
  }[]
  /**
   * Existing seed regions whose metadata lacks a key of the seed's metadata (for example
   * `min_garment_quantity` on a database seeded before it existed). `metadata` is the full object
   * to set: the current metadata plus `added`; a key that is present keeps its value.
   */
  addMetadata: {
    regionId: string
    seedName: string
    metadata: Record<string, unknown>
    added: string[]
  }[]
}

function countryCodes(region: ExistingRegion): string[] {
  return (region.countries ?? [])
    .map((c) => c?.iso_2?.toLowerCase())
    .filter((code): code is string => !!code)
}

export function planRegions(
  existing: readonly ExistingRegion[],
  seeds: readonly RegionSeed[]
): RegionPlan {
  const regionByCountry = new Map<string, ExistingRegion>()
  for (const region of existing) {
    for (const code of countryCodes(region)) {
      regionByCountry.set(code, region)
    }
  }

  const plan: RegionPlan = { create: [], linkPaymentProviders: [], addMetadata: [] }
  const seen = new Set<string>()
  for (const seed of seeds) {
    const match = seed.country_codes
      .map((code) => regionByCountry.get(code.toLowerCase()))
      .find((region): region is ExistingRegion => !!region)
    if (!match) {
      plan.create.push(seed)
      continue
    }
    if (seen.has(match.id)) {
      continue
    }
    seen.add(match.id)

    const current = (match.payment_providers ?? [])
      .map((p) => p?.id)
      .filter((id): id is string => !!id)
    const added = seed.payment_providers.filter((id) => !current.includes(id))
    if (added.length > 0) {
      plan.linkPaymentProviders.push({
        regionId: match.id,
        seedName: seed.name,
        providers: [...current, ...added],
        added,
      })
    }

    const metadata = match.metadata ?? {}
    const missingKeys = Object.keys(seed.metadata).filter(
      (key) => metadata[key] === undefined || metadata[key] === null
    )
    if (missingKeys.length > 0) {
      plan.addMetadata.push({
        regionId: match.id,
        seedName: seed.name,
        metadata: {
          ...metadata,
          ...Object.fromEntries(missingKeys.map((key) => [key, seed.metadata[key]])),
        },
        added: missingKeys,
      })
    }
  }
  return plan
}
