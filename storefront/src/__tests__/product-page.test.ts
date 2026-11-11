import { describe, expect, it } from "vitest"

import { productContent } from "@content/product"
import {
  descriptionOf,
  fabricRows,
  factsFor,
  hasPriceRange,
  hasRelatedProducts,
  showsFacts,
  showsPerPiece,
  showsTaxNote,
} from "@lib/util/product-page"

const jersey = { handle: "jersey", metadata: { kind: "garment" } }
const fitKit = { handle: "fit-kit", metadata: { kind: "fit_kit" } }
const rush = { handle: "rush-add-on", metadata: { kind: "rush_add_on" } }

const titles = (facts: { title: string }[]) => facts.map((f) => f.title)

describe("product page rules", () => {
  it("shows the facts boxes on garments only", () => {
    expect(showsFacts(jersey)).toBe(true)
    expect(showsFacts(fitKit)).toBe(false)
    expect(showsFacts(rush)).toBe(false)
    expect(showsFacts({ handle: "jersey", metadata: null })).toBe(false)
    expect(showsFacts({ handle: "jersey", metadata: {} })).toBe(false)
    expect(showsFacts({ handle: "x", metadata: { kind: "gift_card" } })).toBe(false)
  })

  it("says 'per piece' for garments only", () => {
    expect(showsPerPiece(jersey)).toBe(true)
    expect(showsPerPiece({ handle: "x", metadata: null })).toBe(true)
    expect(showsPerPiece(fitKit)).toBe(false)
    expect(showsPerPiece(rush)).toBe(false)
  })

  it("shows three facts in Pakistan and adds the shipping box in export regions", () => {
    expect(titles(factsFor(productContent.facts, "pk", jersey))).toEqual([
      "Delivered in 15 days",
      "Free replacement",
      "Not sure of sizes?",
    ])
    for (const country of ["gb", "ae", "us"]) {
      expect(titles(factsFor(productContent.facts, country, jersey))).toEqual([
        "Delivered in 15 days",
        "Free replacement",
        "Shipping and duties included",
        "Not sure of sizes?",
      ])
    }
  })

  it("gives the fit kit, the rush add-on and a product with no kind no facts, in every region", () => {
    for (const country of ["pk", "gb", "ae", "us", undefined]) {
      expect(factsFor(productContent.facts, country, fitKit)).toEqual([])
      expect(factsFor(productContent.facts, country, rush)).toEqual([])
      expect(
        factsFor(productContent.facts, country, { handle: "jersey", metadata: null })
      ).toEqual([])
    }
  })

  it("shows the tax note until the region's tax is marked final", () => {
    expect(showsTaxNote({ metadata: { tax_final: false } })).toBe(true)
    expect(showsTaxNote({ metadata: null })).toBe(true)
    expect(showsTaxNote(undefined)).toBe(true)
    expect(showsTaxNote({ metadata: { tax_final: true } })).toBe(false)
  })

  it("knows when the sizes do not all cost the same", () => {
    const priced = (...amounts: number[]) =>
      ({
        variants: amounts.map((a) => ({ calculated_price: { calculated_amount: a } })),
      }) as any
    expect(hasPriceRange(priced(3500, 3500, 3500))).toBe(false)
    expect(hasPriceRange(priced(3500, 3900))).toBe(true)
    expect(hasPriceRange({ variants: [] } as any)).toBe(false)
  })

  it("treats an empty or blank description as none", () => {
    expect(descriptionOf({ description: "A jersey." })).toBe("A jersey.")
    expect(descriptionOf({ description: "   " })).toBeNull()
    expect(descriptionOf({ description: null })).toBeNull()
  })

  it("lists only the fabric rows the product has data for, never a placeholder", () => {
    const labels = productContent.details.rows
    expect(fabricRows({ material: "Polyester mesh" }, labels)).toEqual([
      { label: "Fabric", value: "Polyester mesh" },
    ])
    expect(fabricRows({ material: null }, labels)).toEqual([])
    expect(fabricRows({ material: " " }, labels)).toEqual([])
    expect(fabricRows({ material: "-" }, labels)).toEqual([])
  })

  it("has related products only with a collection or tags", () => {
    expect(hasRelatedProducts({ collection_id: "pcol_1", tags: [] })).toBe(true)
    expect(
      hasRelatedProducts({ collection_id: null, tags: [{ id: "t" }] } as any)
    ).toBe(true)
    expect(hasRelatedProducts({ collection_id: null, tags: [] })).toBe(false)
    expect(hasRelatedProducts({ collection_id: null } as any)).toBe(false)
  })
})
