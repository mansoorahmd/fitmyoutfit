// Which region a visitor lands in when the URL has none (src/middleware.ts).
// Plain data in, so it can be tested without a request. The hosts' country
// headers are configuration (VISITOR_COUNTRY_HEADERS), not code: adding a
// host means adding its header name to the list.

/**
 * Request headers that carry the visitor's country as ISO 3166-1 alpha-2,
 * in the order they are trusted. The first one present whose country has a
 * region wins.
 *
 * - `cf-ipcountry`: Cloudflare, when it sits in front of the store. Listed
 *   first: behind Cloudflare, the next host sees Cloudflare's edge, not the
 *   visitor. Cloudflare sends "XX" (unknown) and "T1" (Tor), which match no
 *   region and so fall through.
 * - `x-vercel-ip-country`: Vercel, the storefront's host (decision 003).
 * - `cloudfront-viewer-country`: AWS CloudFront, in case the store moves.
 *
 * A client can send these headers itself. The worst it can do is pick its
 * own region, which the region switch lets anyone do anyway.
 */
export const VISITOR_COUNTRY_HEADERS: readonly string[] = [
  "cf-ipcountry",
  "x-vercel-ip-country",
  "cloudfront-viewer-country",
]

export type CountryChoiceInput = {
  /** The request path, for example "/gb/store". */
  pathname: string
  /** Reads a request header; null when it is missing. */
  header: (name: string) => string | null | undefined
  /**
   * Country codes that belong to a region, lower case (the middleware's
   * region map). `keys` gives the last-resort choice.
   */
  regionCountries: {
    has: (code: string) => boolean
    keys?: () => Iterator<string>
  }
  /** NEXT_PUBLIC_DEFAULT_REGION. */
  defaultCountry: string
  /** Header names to read, in order. Defaults to VISITOR_COUNTRY_HEADERS. */
  headerNames?: readonly string[]
}

const normalize = (value: string | null | undefined): string =>
  (value ?? "").trim().toLowerCase()

/** The first configured header whose country has a region, or undefined. */
export const countryFromHeaders = (
  header: CountryChoiceInput["header"],
  regionCountries: CountryChoiceInput["regionCountries"],
  headerNames: readonly string[] = VISITOR_COUNTRY_HEADERS
): string | undefined => {
  for (const name of headerNames) {
    const code = normalize(header(name))
    if (code && regionCountries.has(code)) {
      return code
    }
  }
  return undefined
}

/**
 * The visitor's country, in this order:
 * 1. the country in the URL ("/gb/..."), which is the region switch, so a
 *    choice made by hand always wins over the visitor's location;
 * 2. the first country header with a region (see VISITOR_COUNTRY_HEADERS);
 * 3. the default region;
 * 4. any region at all (the first one the backend returned).
 * Undefined only when there are no regions.
 */
export const chooseVisitorCountry = ({
  pathname,
  header,
  regionCountries,
  defaultCountry,
  headerNames,
}: CountryChoiceInput): string | undefined => {
  const fromUrl = normalize(pathname.split("/")[1])
  if (fromUrl && regionCountries.has(fromUrl)) {
    return fromUrl
  }

  const fromHeaders = countryFromHeaders(header, regionCountries, headerNames)
  if (fromHeaders) {
    return fromHeaders
  }

  const fallback = normalize(defaultCountry)
  if (fallback && regionCountries.has(fallback)) {
    return fallback
  }

  const keys = regionCountries.keys?.()
  for (let next = keys?.next(); next && !next.done; next = keys!.next()) {
    if (next.value) {
      return next.value
    }
  }
  return undefined
}
