import { describe, expect, it } from "vitest"

import { urlHasCountryCode } from "@lib/util/url-country"

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
