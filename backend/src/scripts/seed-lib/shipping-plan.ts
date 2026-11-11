/**
 * What the seed still has to create or link for shipping: one stock location, linked to the
 * manual fulfillment provider and the default sales channel; one shipping fulfillment set on it;
 * one service zone per region; one shipping option per zone. Plain TypeScript, no Medusa imports.
 *
 * Everything is matched so that a re-run creates nothing twice, even after an admin renames or
 * re-prices things: the stock location by name (else the oldest one), the fulfillment set as the
 * location's shipping set (else by name), a zone by the region's country, an option as any
 * store (non-return) option in that zone.
 */
import type { RegionSeed, ShippingOptionSeed, ShippingSeed } from "../seed-data/types"

/** Medusa's manual fulfillment provider (`manual` provider registered with id `manual`). */
export const MANUAL_FULFILLMENT_PROVIDER = "manual_manual"

type Ref = { id?: string | null } | null

export type ExistingShippingOption = {
  id: string
  rules?: ({ attribute?: string | null; value?: unknown } | null)[] | null
}

export type ExistingServiceZone = {
  id: string
  name?: string | null
  geo_zones?: ({ type?: string | null; country_code?: string | null } | null)[] | null
  shipping_options?: (ExistingShippingOption | null)[] | null
}

export type ExistingFulfillmentSet = {
  id: string
  name?: string | null
  type?: string | null
  service_zones?: (ExistingServiceZone | null)[] | null
}

export type ExistingStockLocation = {
  id: string
  name?: string | null
  created_at?: string | Date | null
  sales_channels?: Ref[] | null
  fulfillment_providers?: Ref[] | null
  fulfillment_sets?: (ExistingFulfillmentSet | null)[] | null
}

/** The seed's stock location: the one with the seed's name, else the oldest; null when none. */
export function pickStockLocation(
  locations: readonly ExistingStockLocation[],
  name: string
): ExistingStockLocation | null {
  const byName = locations.find((l) => l.name === name)
  if (byName) {
    return byName
  }
  const sorted = [...locations].sort(
    (a, b) => new Date(a.created_at ?? 0).getTime() - new Date(b.created_at ?? 0).getTime()
  )
  return sorted[0] ?? null
}

export function hasLink(refs: readonly Ref[] | null | undefined, id: string): boolean {
  return (refs ?? []).some((ref) => ref?.id === id)
}

/** The location's shipping fulfillment set: the one with the seed's name, else any of type shipping. */
export function pickShippingSet(
  location: ExistingStockLocation,
  name: string
): ExistingFulfillmentSet | null {
  const sets = (location.fulfillment_sets ?? []).filter(
    (s): s is ExistingFulfillmentSet => !!s && s.type === "shipping"
  )
  return sets.find((s) => s.name === name) ?? sets[0] ?? null
}

/** The zone of the set that covers the country (a geo zone of type country with that code). */
export function zoneForCountry(
  set: ExistingFulfillmentSet,
  countryCode: string
): ExistingServiceZone | null {
  const code = countryCode.toLowerCase()
  return (
    (set.service_zones ?? []).find(
      (zone): zone is ExistingServiceZone =>
        !!zone &&
        (zone.geo_zones ?? []).some(
          (geo) => geo?.type === "country" && geo.country_code?.toLowerCase() === code
        )
    ) ?? null
  )
}

/** True when the option is a return option (rule `is_return` = "true"). */
export function isReturnOption(option: ExistingShippingOption): boolean {
  return (option.rules ?? []).some(
    (rule) => rule?.attribute === "is_return" && String(rule.value) === "true"
  )
}

/** True when the zone already has an option customers can pick at checkout. */
export function hasStoreShippingOption(zone: ExistingServiceZone): boolean {
  return (zone.shipping_options ?? []).some((option) => !!option && !isReturnOption(option))
}

export type ZoneToCreate = { name: string; countryCodes: string[]; option: ShippingOptionSeed }

/**
 * The service zones to create in the set: one for each seed option whose region's country no
 * zone of the set covers. The zone covers all of the region's countries.
 */
export function planServiceZones(
  set: ExistingFulfillmentSet,
  shipping: ShippingSeed,
  regions: readonly RegionSeed[]
): ZoneToCreate[] {
  const plan: ZoneToCreate[] = []
  for (const option of shipping.options) {
    if (zoneForCountry(set, option.region_country_code)) {
      continue
    }
    const region = regions.find((r) => r.country_codes.includes(option.region_country_code))
    plan.push({
      name: option.service_zone_name,
      countryCodes: region ? [...region.country_codes] : [option.region_country_code],
      option,
    })
  }
  return plan
}

export type ShippingOptionToCreate = {
  option: ShippingOptionSeed
  serviceZoneId: string
  currencyCode: string
  regionName: string
}

/**
 * The shipping options to create: one for each seed option whose zone exists and has no store
 * option yet. Priced in the currency of the region the option is for.
 */
export function planShippingOptions(
  set: ExistingFulfillmentSet,
  shipping: ShippingSeed,
  regions: readonly RegionSeed[]
): ShippingOptionToCreate[] {
  const plan: ShippingOptionToCreate[] = []
  for (const option of shipping.options) {
    const zone = zoneForCountry(set, option.region_country_code)
    const region = regions.find((r) => r.country_codes.includes(option.region_country_code))
    if (!zone || !region || hasStoreShippingOption(zone)) {
      continue
    }
    plan.push({
      option,
      serviceZoneId: zone.id,
      currencyCode: region.currency_code,
      regionName: region.name,
    })
  }
  return plan
}

/** Medusa's input for one flat-rate store shipping option. */
export function buildShippingOptionInput(
  entry: ShippingOptionToCreate,
  shippingProfileId: string
) {
  const { option } = entry
  return {
    name: option.name,
    price_type: "flat" as const,
    provider_id: MANUAL_FULFILLMENT_PROVIDER,
    service_zone_id: entry.serviceZoneId,
    shipping_profile_id: shippingProfileId,
    data: option.ddp ? { ddp: true } : {},
    type: { ...option.type },
    prices: [{ currency_code: entry.currencyCode, amount: option.amount }],
    rules: [
      { attribute: "enabled_in_store", value: "true", operator: "eq" as const },
      { attribute: "is_return", value: "false", operator: "eq" as const },
    ],
  }
}
