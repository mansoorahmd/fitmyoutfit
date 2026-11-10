import type { RegionScope } from "@content/home"

/** Pakistan is the home market; every other region is an export region. */
export const PAKISTAN_COUNTRY_CODE = "pk"

export const isPakistan = (countryCode: string | undefined): boolean =>
  countryCode?.toLowerCase() === PAKISTAN_COUNTRY_CODE

/** Whether an item scoped to `scope` is shown to a visitor in `countryCode`. */
export const showsInRegion = (
  scope: RegionScope,
  countryCode: string | undefined
): boolean => {
  if (scope === "all") {
    return true
  }
  return scope === (isPakistan(countryCode) ? "pakistan" : "export")
}

/**
 * The items a visitor in `countryCode` sees, in their order: the promise
 * strip's fourth item and the shipping question depend on the region.
 */
export const forRegion = <T extends { showIn: RegionScope }>(
  items: T[],
  countryCode: string | undefined
): T[] => items.filter((item) => showsInRegion(item.showIn, countryCode))
