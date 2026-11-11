import { describe, expect, it } from "vitest"

import { countryCodeStatus, urlHasCountryCode } from "@lib/util/url-country"

describe("urlHasCountryCode", () => {
  it("matches the first segment exactly", () => {
    expect(urlHasCountryCode("/pk", "pk")).toBe(true)
    expect(urlHasCountryCode("/pk/store", "pk")).toBe(true)
    expect(urlHasCountryCode("/PK/store", "pk")).toBe(true)
  })

  it("does not treat a segment that only contains the code as a region", () => {
    expect(urlHasCountryCode("/pkx", "pk")).toBe(false)
    expect(urlHasCountryCode("/apk/store", "pk")).toBe(false)
    expect(urlHasCountryCode("/store", "pk")).toBe(false)
    expect(urlHasCountryCode("/", "pk")).toBe(false)
  })

  it("is false without a country code", () => {
    expect(urlHasCountryCode("/pk", undefined)).toBe(false)
  })
})

describe("countryCodeStatus", () => {
  const regions = [
    { countries: [{ iso_2: "pk" }] },
    { countries: [{ iso_2: "gb" }] },
    { countries: null },
  ]

  it("knows a country one of the regions sells to", () => {
    expect(countryCodeStatus("pk", regions)).toBe("region")
    expect(countryCodeStatus("GB", regions)).toBe("region")
  })

  it("does not know file names and other segments, so they are not found", () => {
    for (const segment of ["sitemap.xml", "robots.txt", "fr", "pkx", "", undefined]) {
      expect(countryCodeStatus(segment, regions)).toBe("unknown")
    }
  })

  it("is unverified when the regions could not be read", () => {
    expect(countryCodeStatus("sitemap.xml", null)).toBe("unverified")
  })
})
