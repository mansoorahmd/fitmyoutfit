import { describe, expect, it } from "vitest"

import {
  hasProductPage,
  isListed,
  kindRules,
  listedOnly,
  productKind,
} from "@lib/util/product-kind"

const garment = { metadata: { kind: "garment" } }
const fitKit = { metadata: { kind: "fit_kit" } }
const rush = { metadata: { kind: "rush_add_on" } }

describe("product kinds", () => {
  it("reads the kind from the metadata, and only kinds the store knows", () => {
    expect(productKind(garment)).toBe("garment")
    expect(productKind(fitKit)).toBe("fit_kit")
    expect(productKind(rush)).toBe("rush_add_on")
    expect(productKind({ metadata: null })).toBeUndefined()
    expect(productKind({ metadata: {} })).toBeUndefined()
    expect(productKind({ metadata: { kind: "Rush_Add_On" } })).toBeUndefined()
    expect(productKind({ metadata: { kind: 3 } })).toBeUndefined()
    expect(productKind({ metadata: { kind: "constructor" } })).toBeUndefined()
    expect(productKind(undefined)).toBeUndefined()
  })

  it("gives every kind a page except the rush add-on", () => {
    expect(hasProductPage(garment)).toBe(true)
    expect(hasProductPage(fitKit)).toBe(true)
    expect(hasProductPage(rush)).toBe(false)
    // no kind, or one the store does not know: the page stays
    expect(hasProductPage({ metadata: null })).toBe(true)
    expect(hasProductPage({ metadata: { kind: "gift_card" } })).toBe(true)
  })

  it("never lists the rush add-on", () => {
    expect(isListed(garment)).toBe(true)
    expect(isListed(fitKit)).toBe(true)
    expect(isListed(rush)).toBe(false)
    expect(isListed({ metadata: null })).toBe(true)
  })

  it("decides by kind, not by handle", () => {
    expect(hasProductPage({ handle: "rush-add-on", metadata: { kind: "garment" } } as any)).toBe(
      true
    )
    expect(hasProductPage({ handle: "anything", metadata: { kind: "rush_add_on" } } as any)).toBe(
      false
    )
  })

  it("filters a list, keeping the order", () => {
    const a = { id: "a", metadata: { kind: "garment" } }
    const b = { id: "b", metadata: { kind: "rush_add_on" } }
    const c = { id: "c", metadata: { kind: "fit_kit" } }
    const d = { id: "d", metadata: null }
    expect(listedOnly([a, b, c, d]).map((p) => p.id)).toEqual(["a", "c", "d"])
    expect(listedOnly([])).toEqual([])
  })

  it("keeps the rules consistent: a listed kind has a page; facts only where per piece", () => {
    for (const product of [garment, fitKit, rush, { metadata: null }]) {
      const rules = kindRules(product)
      if (rules.listed) expect(rules.page).toBe(true)
      if (rules.facts) expect(rules.perPiece).toBe(true)
    }
    expect(kindRules(garment)).toEqual({
      page: true,
      listed: true,
      facts: true,
      perPiece: true,
    })
    expect(kindRules(rush)).toEqual({
      page: false,
      listed: false,
      facts: false,
      perPiece: false,
    })
  })
})
