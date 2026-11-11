import { describe, expect, it } from "vitest"

import {
  VISITOR_COUNTRY_HEADERS,
  chooseVisitorCountry,
  countryFromHeaders,
} from "@lib/util/visitor-country"

const regions = new Map([
  ["pk", 1],
  ["gb", 2],
  ["ae", 3],
  ["us", 4],
])

const headersOf =
  (values: Record<string, string>) =>
  (name: string): string | null =>
    values[name] ?? null

const choose = (
  pathname: string,
  headers: Record<string, string> = {},
  defaultCountry = "pk"
) =>
  chooseVisitorCountry({
    pathname,
    header: headersOf(headers),
    regionCountries: regions,
    defaultCountry,
  })

describe("VISITOR_COUNTRY_HEADERS", () => {
  it("reads Cloudflare first, then Vercel", () => {
    expect(VISITOR_COUNTRY_HEADERS.indexOf("cf-ipcountry")).toBe(0)
    expect(VISITOR_COUNTRY_HEADERS).toContain("x-vercel-ip-country")
    expect(VISITOR_COUNTRY_HEADERS.indexOf("cf-ipcountry")).toBeLessThan(
      VISITOR_COUNTRY_HEADERS.indexOf("x-vercel-ip-country")
    )
  })
})

describe("chooseVisitorCountry", () => {
  it("keeps the country in the URL: the region switch beats the location", () => {
    expect(choose("/gb/store", { "cf-ipcountry": "PK" })).toBe("gb")
    expect(choose("/US", { "x-vercel-ip-country": "GB" })).toBe("us")
  })

  it("uses the Cloudflare header when the URL has no region", () => {
    expect(choose("/store", { "cf-ipcountry": "AE" })).toBe("ae")
  })

  it("uses the Vercel header too", () => {
    expect(choose("/", { "x-vercel-ip-country": "gb" })).toBe("gb")
  })

  it("prefers the earlier header when both are present", () => {
    expect(
      choose("/", { "cf-ipcountry": "US", "x-vercel-ip-country": "GB" })
    ).toBe("us")
  })

  it("skips a header whose country has no region and reads the next one", () => {
    // Cloudflare's "unknown" and "Tor" codes, and a country we don't sell to
    for (const code of ["XX", "T1", "FR"]) {
      expect(
        choose("/", { "cf-ipcountry": code, "x-vercel-ip-country": "AE" })
      ).toBe("ae")
    }
  })

  it("falls back to the default region, then to any region", () => {
    expect(choose("/store", { "cf-ipcountry": "FR" })).toBe("pk")
    expect(choose("/store", {}, "gb")).toBe("gb")
    expect(choose("/store", {}, "de")).toBe("pk")
  })

  it("ignores a URL segment that is not a region", () => {
    expect(choose("/sitemap.xml", { "cf-ipcountry": "gb" })).toBe("gb")
    expect(choose("/pkx/store")).toBe("pk")
  })

  it("trims and lower-cases what it reads", () => {
    expect(choose("/", { "cf-ipcountry": " Gb " })).toBe("gb")
  })

  it("is undefined when there are no regions", () => {
    expect(
      chooseVisitorCountry({
        pathname: "/",
        header: () => "gb",
        regionCountries: new Map(),
        defaultCountry: "pk",
      })
    ).toBeUndefined()
  })

  it("never returns the empty key a region without countries leaves", () => {
    expect(
      chooseVisitorCountry({
        pathname: "/",
        header: () => null,
        regionCountries: new Map([
          ["", 1],
          ["ae", 2],
        ]),
        defaultCountry: "",
      })
    ).toBe("ae")
  })
})

describe("countryFromHeaders", () => {
  it("reads only the header names it is given, in their order", () => {
    const header = headersOf({ "x-country": "gb", "cf-ipcountry": "us" })
    expect(countryFromHeaders(header, regions, ["x-country"])).toBe("gb")
    expect(countryFromHeaders(header, regions, [])).toBeUndefined()
  })
})
