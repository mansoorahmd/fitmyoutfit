import { describe, expect, it } from "vitest"

import {
  canGoNext,
  canGoPrevious,
  clampIndex,
  imageAlt,
  indexFromScroll,
  nextIndex,
  positionLabel,
  previousIndex,
  showImageLabel,
} from "@modules/products/components/image-gallery/gallery-index"

describe("gallery index logic", () => {
  it("clamps an index into the range of images", () => {
    expect(clampIndex(-3, 4)).toBe(0)
    expect(clampIndex(2, 4)).toBe(2)
    expect(clampIndex(9, 4)).toBe(3)
    expect(clampIndex(1.7, 4)).toBe(1)
    expect(clampIndex(Number.NaN, 4)).toBe(0)
  })

  it("returns 0 when there are no images", () => {
    expect(clampIndex(5, 0)).toBe(0)
    expect(canGoNext(0, 0)).toBe(false)
    expect(canGoPrevious(0, 0)).toBe(false)
  })

  it("moves to the next and previous image without wrapping", () => {
    expect(nextIndex(0, 3)).toBe(1)
    expect(nextIndex(2, 3)).toBe(2)
    expect(previousIndex(2, 3)).toBe(1)
    expect(previousIndex(0, 3)).toBe(0)
  })

  it("knows when it can go next and previous", () => {
    expect(canGoPrevious(0, 3)).toBe(false)
    expect(canGoNext(0, 3)).toBe(true)
    expect(canGoPrevious(1, 3)).toBe(true)
    expect(canGoNext(1, 3)).toBe(true)
    expect(canGoPrevious(2, 3)).toBe(true)
    expect(canGoNext(2, 3)).toBe(false)
  })

  it("treats an out-of-range index as the nearest valid one", () => {
    expect(canGoNext(7, 3)).toBe(false)
    expect(canGoPrevious(-2, 3)).toBe(false)
  })

  it("writes the labels, counting from 1", () => {
    expect(positionLabel(1, 4)).toBe("Image 2 of 4")
    expect(positionLabel(9, 4)).toBe("Image 4 of 4")
    expect(showImageLabel(1, 4)).toBe("Show image 2 of 4")
    expect(imageAlt("Jersey", 1, 4)).toBe("Jersey, image 2 of 4")
  })

  it("finds the slide from the scroll position", () => {
    expect(indexFromScroll(0, 300, 3)).toBe(0)
    expect(indexFromScroll(140, 300, 3)).toBe(0)
    expect(indexFromScroll(160, 300, 3)).toBe(1)
    expect(indexFromScroll(600, 300, 3)).toBe(2)
    expect(indexFromScroll(900, 300, 3)).toBe(2)
    expect(indexFromScroll(100, 0, 3)).toBe(0)
  })
})
