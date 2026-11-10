import { seedData } from "../../seed-data"
import {
  imageMimeType,
  needsPlaceholderImage,
  planPlaceholderImages,
} from "../product-images"

describe("needsPlaceholderImage", () => {
  it("is true for a product with no thumbnail and no images", () => {
    expect(needsPlaceholderImage({ thumbnail: null, images: [] })).toBe(true)
    expect(needsPlaceholderImage({})).toBe(true)
    expect(needsPlaceholderImage({ thumbnail: "  ", images: null })).toBe(true)
  })

  it("is false when the product has a thumbnail (an admin may have set a real photo)", () => {
    expect(needsPlaceholderImage({ thumbnail: "http://x/photo.jpg", images: [] })).toBe(false)
  })

  it("is false when the product has images but no thumbnail", () => {
    expect(needsPlaceholderImage({ thumbnail: null, images: [{ id: "img_1" }] })).toBe(false)
  })
})

describe("planPlaceholderImages", () => {
  const seeds = seedData.products.data

  it("plans an image for each seeded product without a picture, from the data file", () => {
    const plan = planPlaceholderImages(
      [
        { id: "p1", handle: "jersey", thumbnail: null, images: [] },
        { id: "p2", handle: "jacket", thumbnail: "http://x/real.jpg", images: [{ id: "i" }] },
        { id: "p3", handle: "fit-kit", thumbnail: null, images: [] },
      ],
      seeds
    )
    expect(plan).toEqual([
      { productId: "p1", handle: "jersey", image: "jersey.png" },
      { productId: "p3", handle: "fit-kit", image: "fit-kit.png" },
    ])
  })

  it("ignores products that are not in the seed data", () => {
    expect(
      planPlaceholderImages([{ id: "p9", handle: "admin-made", thumbnail: null }], seeds)
    ).toEqual([])
  })

  it("plans nothing once every product has a picture", () => {
    const existing = seeds.map((p, i) => ({
      id: `p${i}`,
      handle: p.handle,
      thumbnail: `http://x/${p.image}`,
      images: [{ id: `i${i}` }],
    }))
    expect(planPlaceholderImages(existing, seeds)).toEqual([])
  })
})

describe("imageMimeType", () => {
  it("knows PNG, WebP and JPEG, in any letter case", () => {
    expect(imageMimeType("jersey.png")).toBe("image/png")
    expect(imageMimeType("a.WEBP")).toBe("image/webp")
    expect(imageMimeType("a.jpg")).toBe("image/jpeg")
    expect(imageMimeType("a.jpeg")).toBe("image/jpeg")
  })

  it("rejects SVG and files without an extension", () => {
    expect(imageMimeType("a.svg")).toBeUndefined()
    expect(imageMimeType("png")).toBeUndefined()
  })
})
