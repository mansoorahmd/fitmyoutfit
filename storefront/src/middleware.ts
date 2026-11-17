import { HttpTypes } from "@medusajs/types"
import { NextRequest, NextResponse } from "next/server"
import { urlHasCountryCode as hasCountryCode } from "@lib/util/url-country"
import { chooseVisitorCountry } from "@lib/util/visitor-country"
import { endsWithResetPage, resetLinkRedirect, resetSecret, withoutResetParams } from "@lib/util/reset-cookie"

const BACKEND_URL = process.env.MEDUSA_BACKEND_URL
const PUBLISHABLE_API_KEY = process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY
const DEFAULT_REGION = process.env.NEXT_PUBLIC_DEFAULT_REGION || "pk"

const regionMapCache = {
  regionMap: new Map<string, HttpTypes.StoreRegion>(),
  regionMapUpdated: Date.now(),
}

async function getRegionMap(cacheId: string) {
  const { regionMap, regionMapUpdated } = regionMapCache

  if (!BACKEND_URL) {
    throw new Error(
      "Middleware.ts: Error fetching regions. Did you set up regions in your Medusa Admin and define a MEDUSA_BACKEND_URL environment variable? Note that the variable is no longer named NEXT_PUBLIC_MEDUSA_BACKEND_URL."
    )
  }

  if (
    !regionMap.keys().next().value ||
    regionMapUpdated < Date.now() - 3600 * 1000
  ) {
    // Fetch regions from Medusa. We can't use the JS client here because middleware is running on Edge and the client needs a Node environment.
    const { regions } = await fetch(`${BACKEND_URL}/store/regions`, {
      headers: {
        "x-publishable-api-key": PUBLISHABLE_API_KEY!,
      },
      next: {
        revalidate: 3600,
        tags: [`regions-${cacheId}`],
      },
      cache: "force-cache",
    }).then(async (response) => {
      const json = await response.json()

      if (!response.ok) {
        throw new Error(json.message)
      }

      return json
    })

    if (!regions?.length) {
      throw new Error(
        "No regions found. Please set up regions in your Medusa Admin."
      )
    }

    // Create a map of country codes to regions.
    regions.forEach((region: HttpTypes.StoreRegion) => {
      region.countries?.forEach((c) => {
        regionMapCache.regionMap.set(c.iso_2 ?? "", region)
      })
    })

    regionMapCache.regionMapUpdated = Date.now()
  }

  return regionMapCache.regionMap
}

/**
 * The visitor's country: the one in the URL (the region switch), else the
 * first host country header with a region, else the default region. The
 * rule and the header names are in lib/util/visitor-country.ts.
 */
async function getCountryCode(
  request: NextRequest,
  regionMap: Map<string, HttpTypes.StoreRegion | number>
) {
  try {
    return chooseVisitorCountry({
      pathname: request.nextUrl.pathname,
      header: (name) => request.headers.get(name),
      regionCountries: regionMap,
      defaultCountry: DEFAULT_REGION,
    })
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.error(
        "Middleware.ts: Error getting the country code. Did you set up regions in your Medusa Admin and define a MEDUSA_BACKEND_URL environment variable? Note that the variable is no longer named NEXT_PUBLIC_MEDUSA_BACKEND_URL."
      )
    }
  }
}

/**
 * Middleware to handle region selection and onboarding status.
 */
export async function middleware(request: NextRequest) {
  let redirectUrl = request.nextUrl.href

  let response = NextResponse.redirect(redirectUrl, 307)

  let cacheIdCookie = request.cookies.get("_medusa_cache_id")

  let cacheId = cacheIdCookie?.value || crypto.randomUUID()

  const regionMap = await getRegionMap(cacheId)

  const countryCode = regionMap && (await getCountryCode(request, regionMap))

  const urlHasCountryCode = hasCountryCode(request.nextUrl.pathname, countryCode)

  // A password-reset link (contract m1-password-reset, section 3): the token
  // and email in its address go into a sealed, http-only cookie scoped to the
  // page, and the browser is sent to the same page without a query, so no
  // token stays in the address bar, the history or a Referer. The country
  // code counts in any letter case, and the backend's link (no country) is
  // sealed for the visitor's country in the same step, so no redirect holds
  // the token either.
  if (endsWithResetPage(request.nextUrl.pathname)) {
    const reset = await resetLinkRedirect(
      request.nextUrl.pathname,
      request.nextUrl.search,
      () => resetSecret(),
      Date.now(),
      { has: (code) => regionMap.has(code), fallback: countryCode }
    )
    if (reset) {
      const sealed = NextResponse.redirect(new URL(reset.location, request.nextUrl.origin), 303)
      sealed.cookies.set(reset.cookie.name, reset.cookie.value, {
        path: reset.cookie.path,
        maxAge: reset.cookie.maxAge,
        httpOnly: true,
        sameSite: "lax", // sent on the redirect that follows a click from an email, which "strict" would withhold
        secure: process.env.NODE_ENV === "production",
      })
      if (!cacheIdCookie) {
        sealed.cookies.set("_medusa_cache_id", cacheId, { maxAge: 60 * 60 * 24 })
      }
      sealed.headers.set("Referrer-Policy", "no-referrer")
      sealed.headers.set("Cache-Control", "no-store")
      return sealed
    }
    // Any other path of that shape (an unknown country, a longer path, static-looking): no page is
    // answered and no redirect is made with a token or email in the address. They are dropped.
    const clean = withoutResetParams(request.nextUrl.search)
    if (clean !== request.nextUrl.search) {
      const dropped = NextResponse.redirect(`${request.nextUrl.origin}${request.nextUrl.pathname}${clean}`, 303)
      dropped.headers.set("Referrer-Policy", "no-referrer")
      dropped.headers.set("Cache-Control", "no-store")
      return dropped
    }
  }

  // if one of the country codes is in the url and the cache id is set, return next
  if (urlHasCountryCode && cacheIdCookie) {
    return NextResponse.next()
  }

  // if one of the country codes is in the url and the cache id is not set, set the cache id and redirect
  if (urlHasCountryCode && !cacheIdCookie) {
    response.cookies.set("_medusa_cache_id", cacheId, {
      maxAge: 60 * 60 * 24,
    })

    return response
  }

  // check if the url is a static asset
  if (request.nextUrl.pathname.includes(".")) {
    return NextResponse.next()
  }

  const redirectPath =
    request.nextUrl.pathname === "/" ? "" : request.nextUrl.pathname

  const queryString = request.nextUrl.search ? request.nextUrl.search : ""

  // If no country code is set, we redirect to the relevant region.
  if (!urlHasCountryCode && countryCode) {
    redirectUrl = `${request.nextUrl.origin}/${countryCode}${redirectPath}${queryString}`
    response = NextResponse.redirect(`${redirectUrl}`, 307)
  } else if (!urlHasCountryCode && !countryCode) {
    // Handle case where no valid country code exists (empty regions)
    return new NextResponse(
      "No valid regions configured. Please set up regions with countries in your Medusa Admin.",
      { status: 500 }
    )
  }

  return response
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|images|assets|png|svg|jpg|jpeg|gif|webp).*)",
  ],
}
