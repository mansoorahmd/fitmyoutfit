/**
 * Which seed regions the store still needs, and which existing regions need repair.
 * Plain TypeScript, no Medusa imports.
 *
 * Regions are matched by country code, not by name: an admin may rename "Pakistan", but the
 * country `pk` still belongs to that region, and Medusa allows a country in one region only.
 */
import type { RegionSeed } from "../seed-data/types"

/** Medusa's built-in payment provider. Real providers are Sprint 1. */
export const DEFAULT_PAYMENT_PROVIDER = "pp_system_default"

export type ExistingRegion = {
  id: string
  name?: string | null
  countries?: readonly ({ iso_2?: string | null } | null)[] | null
  payment_providers?: readonly ({ id?: string | null } | null)[] | null
}

export type RegionPlan = {
  /** Seed regions none of whose countries is in a region yet: create these. */
  create: RegionSeed[]
  /**
   * Existing seed regions with no payment provider at all (a region-create that stopped after
   * the region was written and before its provider was linked): link the default provider.
   */
  linkPaymentProvider: { regionId: string; seedName: string }[]
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

  const plan: RegionPlan = { create: [], linkPaymentProvider: [] }
  const repaired = new Set<string>()
  for (const seed of seeds) {
    const match = seed.country_codes
      .map((code) => regionByCountry.get(code.toLowerCase()))
      .find((region): region is ExistingRegion => !!region)
    if (!match) {
      plan.create.push(seed)
      continue
    }
    const hasProvider = (match.payment_providers ?? []).some((p) => !!p?.id)
    if (!hasProvider && !repaired.has(match.id)) {
      plan.linkPaymentProvider.push({ regionId: match.id, seedName: seed.name })
      repaired.add(match.id)
    }
  }
  return plan
}
