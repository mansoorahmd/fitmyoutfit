import { describe, expect, it } from "vitest"

import { cardImages } from "@lib/util/card-images"
import {
  desktopColumns,
  phoneColumns,
  productCardImageSizes,
  productGridClasses,
  showsSort,
} from "@modules/products/components/product-grid/grid"

const classes = (count: number) => productGridClasses(count).split(" ")

describe("product grid rules", () => {
  it("is one column on phones while there are 3 products or fewer, two above", () => {
    expect([1, 2, 3].map(phoneColumns)).toEqual([1, 1, 1])
    expect([4, 8, 12].map(phoneColumns)).toEqual([2, 2, 2])
    expect(classes(3)).toContain("grid-cols-1")
    expect(classes(4)).toContain("grid-cols-2")
  })

  it("is three columns from 768 px, and four from 1280 px above 6 products", () => {
    for (const count of [1, 3, 6, 7, 12]) {
      expect(classes(count)).toContain("md:grid-cols-3")
    }
    expect(desktopColumns(6)).toBe(3)
    expect(desktopColumns(7)).toBe(4)
    expect(classes(6)).toContain("xl:grid-cols-3")
    expect(classes(7)).toContain("xl:grid-cols-4")
  })

  it("has gaps of 16, 24 and 32 px and no starter breakpoints", () => {
    expect(classes(3)).toEqual(
      expect.arrayContaining(["gap-4", "md:gap-6", "xl:gap-8"])
    )
    expect(productGridClasses(3)).not.toMatch(/\b(small|medium|large):/)
  })

  it("hides Sort by until there are more than 8 products", () => {
    expect([0, 1, 3, 8].map(showsSort)).toEqual([false, false, false, false])
    expect([9, 20].map(showsSort)).toEqual([true, true])
  })

  it("asks for phone-sized images on phones", () => {
    expect(productCardImageSizes(3)).toContain("100vw")
    expect(productCardImageSizes(4)).toContain("50vw")
    expect(productCardImageSizes(3)).toContain("(min-width: 768px) 33vw")
  })
})

describe("card images", () => {
  it("shows the thumbnail and swaps to the first other image", () => {
    expect(
      cardImages({
        thumbnail: "front.png",
        images: [{ url: "front.png" }, { url: "back.png" }] as any,
      })
    ).toEqual({ primary: "front.png", secondary: "back.png" })
  })

  it("uses the first image when there is no thumbnail", () => {
    expect(
      cardImages({ thumbnail: null, images: [{ url: "a.png" }, { url: "b.png" }] as any })
    ).toEqual({ primary: "a.png", secondary: "b.png" })
  })

  it("has no hover image when the product has one photo", () => {
    expect(
      cardImages({ thumbnail: "a.png", images: [{ url: "a.png" }] as any })
    ).toEqual({ primary: "a.png", secondary: null })
  })

  it("has no image at all when the product has none", () => {
    expect(cardImages({ thumbnail: null, images: null })).toEqual({
      primary: null,
      secondary: null,
    })
    expect(cardImages({ thumbnail: "", images: [{ url: "" }] as any })).toEqual({
      primary: null,
      secondary: null,
    })
  })
})
