/**
 * True when the path's first segment is exactly the country code: "/pk/store"
 * for "pk". The starter tested `segment.includes(code)`, so "/pkx" counted as
 * Pakistan and rendered an empty page instead of the not-found page.
 */
export const urlHasCountryCode = (
  pathname: string,
  countryCode: string | undefined
): boolean =>
  !!countryCode && pathname.split("/")[1]?.toLowerCase() === countryCode

/**
 * What the first path segment is, for the `[countryCode]` layout:
 * - "region": a country one of the regions sells to;
 * - "unknown": not one, so the page is not found (404). This is how
 *   "/sitemap.xml" and other top-level paths with a dot end up: the
 *   middleware lets paths with a dot through untouched (they may be files),
 *   so the app sees "sitemap.xml" as a country code;
 * - "unverified": the regions could not be read (backend down). The page
 *   renders as before rather than claiming every page is missing.
 */
export const countryCodeStatus = (
  countryCode: string | undefined,
  regions: { countries?: { iso_2?: string | null }[] | null }[] | null
): "region" | "unknown" | "unverified" => {
  if (regions === null) {
    return "unverified"
  }
  const code = countryCode?.toLowerCase()
  if (!code) {
    return "unknown"
  }
  const known = regions.some((region) =>
    (region.countries ?? []).some((c) => c.iso_2?.toLowerCase() === code)
  )
  return known ? "region" : "unknown"
}
