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
