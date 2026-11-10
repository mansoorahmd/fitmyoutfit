import { seedData } from "../../seed-data"
import { isHttpsUrl, needsPlaceholderImage, planPlaceholderImages } from "../product-images"

const BASE = "https://medusa-public-images.s3.eu-west-1.amazonaws.com/"

describe("the placeholder image URLs in the seed data", () => {
  it("are the contract's Medusa demo photos, marked placeholder, first one the thumbnail", () => {
    const byHandle = Object.fromEntries(
      seedData.products.data.map((p) => [p.handle, p.images])
    )
    expect(byHandle).toEqual({
      jersey: { placeholder: true, urls: [`${BASE}ls-black-front.png`, `${BASE}ls-black-back.png`] },
      "t-shirt": {
        placeholder: true,
        urls: [`${BASE}tee-black-front.png`, `${BASE}tee-black-back.png`],
      },
      jacket: {
        placeholder: true,
        urls: [`${BASE}sweatshirt-vintage-front.png`, `${BASE}sweatshirt-vintage-back.png`],
      },
      "fit-kit": { placeholder: true, urls: [`${BASE}sweatpants-gray-front.png`] },
      "rush-add-on": { placeholder: true, urls: [`${BASE}shorts-vintage-front.png`] },
    })
  })
})

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

  it("sets the first URL as thumbnail and all URLs as images, only on products without a picture", () => {
    const plan = planPlaceholderImages(
      [
        { id: "p1", handle: "jersey", thumbnail: null, images: [] },
        { id: "p2", handle: "jacket", thumbnail: "http://x/real.jpg", images: [{ id: "i" }] },
        { id: "p3", handle: "fit-kit", thumbnail: null, images: [] },
      ],
      seeds
    )
    expect(plan).toEqual([
      {
        productId: "p1",
        handle: "jersey",
        thumbnail: `${BASE}ls-black-front.png`,
        images: [{ url: `${BASE}ls-black-front.png` }, { url: `${BASE}ls-black-back.png` }],
      },
      {
        productId: "p3",
        handle: "fit-kit",
        thumbnail: `${BASE}sweatpants-gray-front.png`,
        images: [{ url: `${BASE}sweatpants-gray-front.png` }],
      },
    ])
  })

  it("leaves a product with an admin's images alone, even without a thumbnail", () => {
    expect(
      planPlaceholderImages([{ id: "p1", handle: "jersey", thumbnail: null, images: [{}] }], seeds)
    ).toEqual([])
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
      thumbnail: p.images.urls[0],
      images: [{ id: `i${i}` }],
    }))
    expect(planPlaceholderImages(existing, seeds)).toEqual([])
  })
})

describe("isHttpsUrl", () => {
  it("accepts absolute https URLs only", () => {
    expect(isHttpsUrl(`${BASE}tee-black-front.png`)).toBe(true)
    expect(isHttpsUrl("http://example.com/a.png")).toBe(false)
    expect(isHttpsUrl("//example.com/a.png")).toBe(false)
    expect(isHttpsUrl("tee-black-front.png")).toBe(false)
    expect(isHttpsUrl(" https://example.com/a.png")).toBe(false)
    expect(isHttpsUrl("")).toBe(false)
    expect(isHttpsUrl(undefined)).toBe(false)
  })
})
