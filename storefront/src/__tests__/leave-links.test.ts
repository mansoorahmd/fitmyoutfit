import { describe, expect, it } from "vitest"

import { designContent } from "@content/design"
import { CHOOSER_PATH, chooserCardHref, designableProducts } from "@lib/editor/chooser"
import { designerReturnPath, leaveLinks } from "@lib/editor/leave-links"

const base = { countryCode: "pk", handle: "jersey", orderId: null, returnTo: "/design/jersey" }

describe("the designer's links out", () => {
  it("a signed-out visitor: home, the product, the chooser, and sign in that comes back to the designer", () => {
    const links = leaveLinks({ ...base, signedIn: false })
    expect(links.map((l) => [l.id, l.href])).toEqual([
      ["home", "/pk"],
      ["product", "/pk/products/jersey"],
      ["chooser", "/pk/design"],
      ["sign-in", "/pk/account?view=signin&next=%2Fdesign%2Fjersey"],
    ])
  })

  it("a signed-in visitor: team orders and the account, and no sign in", () => {
    const links = leaveLinks({ ...base, signedIn: true })
    expect(links.map((l) => l.id)).toEqual(["home", "product", "chooser", "team-orders", "account"])
    expect(links.find((l) => l.id === "team-orders")!.href).toBe("/pk/account/team-orders")
  })

  it("for a team order: its own page too, in the order's country", () => {
    const links = leaveLinks({ ...base, countryCode: "gb", signedIn: true, orderId: "teamord_1" })
    expect(links.find((l) => l.id === "order")).toMatchObject({ label: designContent.leave.thisOrder, href: "/gb/account/team-orders/teamord_1" })
    expect(links.every((l) => l.href.startsWith("/gb"))).toBe(true)
  })

  it("comes back to the order's designer after signing in", () => {
    expect(designerReturnPath("jersey", "teamord_1")).toBe("/design/jersey?order=teamord_1")
    expect(designerReturnPath("jersey", null)).toBe("/design/jersey")
  })

  it("every link has a label", () => {
    for (const l of leaveLinks({ ...base, signedIn: true, orderId: "o" })) expect(l.label.trim()).not.toBe("")
  })
})

describe("the garment chooser's data", () => {
  it("lists only the products the designer knows, in the designer's order, whatever the collection holds", () => {
    const products = [{ handle: "jacket" }, { handle: "t-shirt" }, { handle: "fit-kit" }, { handle: "jersey" }, { handle: null }]
    expect(designableProducts(products as { handle: string }[]).map((p) => p.handle)).toEqual(["jersey", "t-shirt"])
  })

  it("is empty for nothing, and keeps one garment", () => {
    expect(designableProducts(null)).toEqual([])
    expect(designableProducts([])).toEqual([])
    expect(designableProducts([{ handle: "jersey" }])).toHaveLength(1)
  })

  it("a card leads to the designer of its garment", () => {
    expect(chooserCardHref("t-shirt")).toBe("/design/t-shirt")
    expect(CHOOSER_PATH).toBe("/design")
  })
})
