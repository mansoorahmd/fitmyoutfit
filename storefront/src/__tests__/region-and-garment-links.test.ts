import { describe, expect, it } from "vitest"

import { toGarmentLinks } from "@lib/util/garment-links"
import {
  findRegionChoice,
  pathWithoutCountry,
  regionChipLabel,
  toRegionChoices,
} from "@lib/util/region-choices"

const regions = [
  {
    id: "reg_us",
    currency_code: "usd",
    countries: [{ iso_2: "us", display_name: "United States" }],
  },
  {
    id: "reg_pk",
    currency_code: "pkr",
    countries: [{ iso_2: "pk", display_name: "Pakistan" }],
  },
  {
    id: "reg_gb",
    currency_code: "gbp",
    countries: [{ iso_2: "gb", display_name: "United Kingdom" }],
  },
] as any

describe("region choices", () => {
  it("lists every country with its region's currency, sorted by name", () => {
    expect(toRegionChoices(regions)).toEqual([
      { countryCode: "pk", countryName: "Pakistan", currencyCode: "PKR" },
      { countryCode: "gb", countryName: "United Kingdom", currencyCode: "GBP" },
      { countryCode: "us", countryName: "United States", currencyCode: "USD" },
    ])
    expect(toRegionChoices(null)).toEqual([])
  })

  it("labels the chip with country and currency", () => {
    const choices = toRegionChoices(regions)
    expect(regionChipLabel(findRegionChoice(choices, "pk")!)).toBe("PK · PKR")
    expect(regionChipLabel(findRegionChoice(choices, "GB")!)).toBe("GB · GBP")
    expect(findRegionChoice(choices, "fr")).toBeUndefined()
  })

  it("strips only the leading country code from the path", () => {
    expect(pathWithoutCountry("/pk/products/jersey", "pk")).toBe("/products/jersey")
    expect(pathWithoutCountry("/pk", "pk")).toBe("")
    expect(pathWithoutCountry("/pk/", "pk")).toBe("/")
    // the starter's split() broke on a path that contains the code again
    expect(pathWithoutCountry("/pk/products/pk-kit", "pk")).toBe(
      "/products/pk-kit"
    )
    expect(pathWithoutCountry("/pkx/store", "pk")).toBe("/pkx/store")
  })
})

describe("garment links", () => {
  it("links each garment by handle, keeping the backend's order", () => {
    expect(
      toGarmentLinks([
        { id: "p1", handle: "jersey", title: "Jersey", thumbnail: "j.png" },
        { id: "p2", handle: "t-shirt", title: "T-Shirt", thumbnail: null },
        { id: "p3", handle: null, title: "No handle", thumbnail: null },
      ] as any)
    ).toEqual([
      { id: "p1", title: "Jersey", href: "/products/jersey", thumbnail: "j.png" },
      { id: "p2", title: "T-Shirt", href: "/products/t-shirt", thumbnail: null },
    ])
  })
})
