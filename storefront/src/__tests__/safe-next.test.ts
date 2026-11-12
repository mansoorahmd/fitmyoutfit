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
})
