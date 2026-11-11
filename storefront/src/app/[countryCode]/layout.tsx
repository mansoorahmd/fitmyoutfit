import { notFound } from "next/navigation"

import { listRegions } from "@lib/data/regions"
import { countryCodeStatus } from "@lib/util/url-country"

/**
 * Every page sits under a country code ("/pk/store"). A first segment that
 * is not a region's country, such as "/sitemap.xml" (the middleware lets
 * paths with a dot through, since they may be files), is not found: the
 * root not-found page with status 404, never an empty page with status 200.
 */
export default async function CountryLayout(props: {
  children: React.ReactNode
  params: Promise<{ countryCode: string }>
}) {
  const { countryCode } = await props.params
  const regions = await listRegions().catch(() => null)

  if (countryCodeStatus(countryCode, regions ?? null) === "unknown") {
    notFound()
  }

  return props.children
}
