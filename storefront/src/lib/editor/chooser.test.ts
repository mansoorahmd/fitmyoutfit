import { existsSync } from "node:fs"
import { resolve } from "node:path"
import { beforeEach, describe, expect, it } from "vitest"

import { resolveEditorAsset } from "./asset-path"
import { chooserCardHref, chooserCards } from "./chooser"
import { openingGarment } from "./garment-choice"
import { editorProductFor } from "./products"
import { hasSavedDesign, hasSavedGarmentDesign, setSavedDesignFlag } from "./saved-design"

const samples = resolve(import.meta.dirname, "../../../../packages/editor/samples")
const jersey = editorProductFor("jersey")!
const tshirt = editorProductFor("t-shirt")!

describe("one chooser card per garment", () => {
  const products = [{ handle: "jacket" }, { handle: "t-shirt" }, { handle: "fit-kit" }, { handle: "jersey" }, { handle: null }] as { handle: string }[]

  it("three cards: the jersey's two necks, then the T-shirt, named as the garments are", () => {
    const cards = chooserCards(products)
    expect(cards.map((c) => [c.garmentId, c.name, c.product.handle])).toEqual([
      ["match-jersey-vneck", "Jersey, V-neck", "jersey"],
      ["match-jersey-round", "Jersey, round neck", "jersey"],
      ["stand-in-tshirt", "T-shirt", "t-shirt"],
    ])
  })

  it("each card has its garment's own front picture, a file the store serves and the repository has", () => {
    const cards = chooserCards(products)
    expect(cards.map((c) => c.picture)).toEqual([
      "/api/editor-assets/pictures/products/jersey-vneck-front.webp",
      "/api/editor-assets/pictures/products/jersey-round-front.webp",
      "/api/editor-assets/pictures/products/tshirt-front.webp",
    ])
    for (const g of [...jersey.garments, ...tshirt.garments]) {
      expect(resolveEditorAsset(g.productPicture!.split("/"))).toEqual({ relative: g.productPicture, type: "image/webp" })
      expect(existsSync(resolve(samples, g.productPicture!))).toBe(true)
    }
  })

  it("a garment without a picture of its own has none, so its card falls back to the product's thumbnail", () => {
    const garments = jersey.garments as unknown as Record<string, unknown>[]
    const saved = garments[1]!
    const { productPicture: _gone, ...bare } = saved
    garments[1] = bare
    try {
      const cards = chooserCards([{ handle: "jersey" }])
      expect(cards[0]!.picture).toBeDefined()
      expect(cards[1]!.picture).toBeUndefined()
    } finally {
      garments[1] = saved
    }
  })

  it("the jersey's cards name their garment in the address; the T-shirt's needs none", () => {
    expect(chooserCards(products).map((c) => c.href)).toEqual([
      "/design/jersey?garment=match-jersey-vneck",
      "/design/jersey?garment=match-jersey-round",
      "/design/t-shirt",
    ])
    expect(chooserCardHref("jersey")).toBe("/design/jersey")
    expect(chooserCardHref("jersey", "stand-in-tshirt")).toBe("/design/jersey")
    expect(chooserCardHref("t-shirt", "stand-in-tshirt")).toBe("/design/t-shirt")
  })

  it("is empty for no designable product", () => {
    expect(chooserCards([{ handle: "jacket" }])).toEqual([])
    expect(chooserCards(null)).toEqual([])
  })
})

describe("the asset route's shapes", () => {
  it("allows webp in pictures/products/ and nothing else new", () => {
    expect(resolveEditorAsset(["pictures", "products", "tshirt-front.webp"])).toEqual({ relative: "pictures/products/tshirt-front.webp", type: "image/webp" })
    for (const segments of [
      ["pictures", "products", "tshirt-front.png"],
      ["pictures", "products", "tshirt-front.jpg"],
      ["pictures", "tshirt-front.webp"],
      ["pictures", "products", "x", "y.webp"],
      ["pictures", "products", "..", "x.webp"],
      ["pictures", "products", "..", "..", "package.webp"],
      ["pictures", "products", "Tshirt.webp"],
      ["models", "x.webp"],
      ["products", "x.webp"],
      ["fonts", "x.webp"],
      ["pictures", "products"],
    ]) {
      expect(resolveEditorAsset(segments), segments.join("/")).toBeNull()
    }
    // what was readable before still is
    expect(resolveEditorAsset(["pictures", "match-jersey-round.png"])?.type).toBe("image/png")
  })
})

describe("the garment a request opens the designer on", () => {
  it("outside a team order the requested garment is honoured, even over a newer design on the other neck", () => {
    const device = [{ id: "match-jersey-vneck", savedAt: 50 }]
    expect(openingGarment(jersey, { device, requested: "match-jersey-round" }).definition).toBe("match-jersey-round")
    expect(openingGarment(jersey, { requested: "match-jersey-vneck", device: [{ id: "match-jersey-round", savedAt: 9 }] }).definition).toBe("match-jersey-vneck")
  })

  it("inside a team order it is ignored: the order's design decides", () => {
    const order = { design: { product: { id: "match-jersey-vneck" } } }
    expect(openingGarment(jersey, { order, requested: "match-jersey-round" }).definition).toBe("match-jersey-vneck")
    expect(openingGarment(jersey, { order: { design: { product: { id: "match-jersey-round" } } }, requested: "match-jersey-vneck" }).definition).toBe("match-jersey-round")
  })

  it("a garment that is unknown or another product's is ignored", () => {
    const device = [{ id: "match-jersey-round", savedAt: 5 }]
    expect(openingGarment(jersey, { device, requested: "no-such-garment" }).definition).toBe("match-jersey-round")
    expect(openingGarment(jersey, { device, requested: "stand-in-tshirt" }).definition).toBe("match-jersey-round")
    expect(openingGarment(jersey, { requested: "stand-in-tshirt" }).definition).toBe("match-jersey-vneck")
    expect(openingGarment(tshirt, { requested: "match-jersey-round" }).definition).toBe("stand-in-tshirt")
    expect(openingGarment(jersey, { requested: null }).definition).toBe("match-jersey-vneck")
  })
})

describe("the saved-design flags, per garment", () => {
  beforeEach(() => window.localStorage.clear())

  it("a design on the V-neck says nothing about the round neck", () => {
    setSavedDesignFlag("jersey", true, "match-jersey-vneck")
    expect(hasSavedGarmentDesign("match-jersey-vneck")).toBe(true)
    expect(hasSavedGarmentDesign("match-jersey-round")).toBe(false)
    expect(hasSavedGarmentDesign("stand-in-tshirt")).toBe(false)
    // the product page's button still sees a design for the jersey
    expect(hasSavedDesign("jersey")).toBe(true)
    expect(hasSavedDesign("t-shirt")).toBe(false)
  })

  it("forgetting one neck keeps the product saved while the other is; forgetting the product forgets both", () => {
    setSavedDesignFlag("jersey", true, "match-jersey-vneck")
    setSavedDesignFlag("jersey", true, "match-jersey-round")
    setSavedDesignFlag("jersey", false, "match-jersey-vneck")
    expect(hasSavedGarmentDesign("match-jersey-vneck")).toBe(false)
    expect(hasSavedGarmentDesign("match-jersey-round")).toBe(true)
    expect(hasSavedDesign("jersey")).toBe(true)
    setSavedDesignFlag("jersey", false)
    expect(hasSavedGarmentDesign("match-jersey-round")).toBe(false)
    expect(hasSavedDesign("jersey")).toBe(false)
  })

  it("forgetting the last neck forgets the product", () => {
    setSavedDesignFlag("jersey", true, "match-jersey-round")
    setSavedDesignFlag("jersey", false, "match-jersey-round")
    expect(hasSavedDesign("jersey")).toBe(false)
  })
})
