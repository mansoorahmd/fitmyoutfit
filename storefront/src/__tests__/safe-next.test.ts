import { describe, expect, it } from "vitest"

import { MAX_NEXT_LENGTH, afterSignInPath, safeNextPath } from "@lib/util/safe-next"

describe("safeNextPath: where sign-in may return to (05, 8.1; a security rule)", () => {
  it("keeps a path inside the store, with its query and fragment", () => {
    expect(safeNextPath("/cart")).toBe("/cart")
    expect(safeNextPath("/account/orders")).toBe("/account/orders")
    expect(safeNextPath("/account/orders/details/order_01M768NPZTPMSBTP33ES97Z3KX")).toBe(
      "/account/orders/details/order_01M768NPZTPMSBTP33ES97Z3KX"
    )
    expect(safeNextPath("/checkout?step=address")).toBe("/checkout?step=address")
    expect(safeNextPath("/products/jersey#size-chart")).toBe("/products/jersey#size-chart")
  })

  it("refuses full URLs and other schemes", () => {
    for (const value of [
      "https://evil.example/",
      "http://localhost:8006/pk/cart",
      "javascript:alert(1)",
      "data:text/html,hi",
      "evil.example",
      "cart",
      "",
    ]) {
      expect(safeNextPath(value), value).toBeNull()
    }
  })

  it("refuses protocol-relative URLs and backslash tricks", () => {
    for (const value of [
      "//evil.example",
      "//evil.example/cart",
      "///evil.example",
      "/\\evil.example",
      "\\\\evil.example",
      "\\/evil.example",
      "/cart\\..\\..\\evil",
    ]) {
      expect(safeNextPath(value), value).toBeNull()
    }
  })

  it("refuses control characters and spaces that a browser would drop", () => {
    for (const value of ["/\t/evil.example", "/\n/evil.example", "/\r/evil.example", "/ /evil.example", "/cart\u0000", "/x" + String.fromCharCode(0x2028) + "y"]) {
      expect(safeNextPath(value), JSON.stringify(value)).toBeNull()
    }
  })

  it("refuses encoded slashes, backslashes and dots in the path", () => {
    for (const value of ["/%2f%2fevil.example", "/%2F/evil.example", "/%5cevil.example", "/%2e%2e/evil", "/%09/evil"]) {
      expect(safeNextPath(value), value).toBeNull()
    }
    // an encoded character in the query is the query's business
    expect(safeNextPath("/store?q=a%2Fb")).toBe("/store?q=a%2Fb")
  })

  it("refuses credentials, non-strings, arrays and values that are too long", () => {
    expect(safeNextPath("/@evil.example")).toBe("/@evil.example") // a path on our site, harmless
    expect(safeNextPath(undefined)).toBeNull()
    expect(safeNextPath(null)).toBeNull()
    expect(safeNextPath(["/cart"])).toBeNull()
    expect(safeNextPath(42)).toBeNull()
    expect(safeNextPath(`/${"a".repeat(MAX_NEXT_LENGTH)}`)).toBeNull()
  })

  it("never answers with anything that leaves our origin", () => {
    const tricky = ["/..//evil.example", "/./evil.example", "/a/../../evil.example"]
    for (const value of tricky) {
      const result = safeNextPath(value)
      if (result !== null) {
        expect(result.startsWith("/")).toBe(true)
        expect(result.startsWith("//")).toBe(false)
      }
    }
  })
})

describe("afterSignInPath", () => {
  it("puts the safe path in the visitor's country", () => {
    expect(afterSignInPath("pk", "/cart")).toBe("/pk/cart")
    expect(afterSignInPath("gb", "/account/orders")).toBe("/gb/account/orders")
  })

  it("goes to the account when next is missing or unsafe", () => {
    expect(afterSignInPath("pk", null)).toBe("/pk/account")
    expect(afterSignInPath("pk", "//evil.example")).toBe("/pk/account")
    expect(afterSignInPath("pk", "https://evil.example")).toBe("/pk/account")
  })

  it("ignores a country code that isn't two letters", () => {
    expect(afterSignInPath("//evil", "/cart")).toBe("/cart")
  })

  it("a next that already starts with a country the store serves is used as it is (QA S1-4c, m7)", () => {
    const served = ["pk", "gb", "ae", "us"]
    expect(afterSignInPath("pk", "/gb/cart", served)).toBe("/gb/cart")
    expect(afterSignInPath("pk", "/us", served)).toBe("/us")
    expect(afterSignInPath("gb", "/pk/account/orders?shown=20", served)).toBe("/pk/account/orders?shown=20")
    // a first segment that isn't a served country is a path in the visitor's country
    expect(afterSignInPath("pk", "/fr/cart", served)).toBe("/pk/fr/cart")
    expect(afterSignInPath("pk", "/gbx/cart", served)).toBe("/pk/gbx/cart")
    expect(afterSignInPath("pk", "/cart", served)).toBe("/pk/cart")
    // every refusal still holds: the account in the visitor's country
    for (const unsafe of ["//gb/cart", "/\\gb", "https://evil.example/gb/cart", "/gb%2f%2fevil.example", "/\t/evil.example", null]) {
      expect(afterSignInPath("pk", unsafe, served), String(unsafe)).toBe("/pk/account")
    }
  })
})
