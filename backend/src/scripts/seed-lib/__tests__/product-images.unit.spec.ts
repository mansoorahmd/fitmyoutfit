import { seedData } from "../../seed-data"
import { isHttpsUrl, needsPlaceholderImage, planPlaceholderImages } from "../product-images"

/**
 * The contract's "Product images" table (docs/contracts/sprint-0-dev-setup.md, as changed on
 * 10 Nov 2026), written out in full so a typo in the seed data fails here. No network needed.
 */
const CONTRACT_IMAGES: Record<string, string[]> = {
  jersey: [
    "https://www.spized.com/thumbnail/4b/cb/26/1744736603/abc184bc-ffaa-6972-d8f4-67ad4c530dd0_784006_600x600.webp?ts=1793783716",
    "https://www.spized.com/thumbnail/5a/6f/9d/1744736603/99ed42a2-57cd-9912-8d85-67c407751689_784006_600x600.webp?ts=1793799289",
  ],
  "t-shirt": [
    "https://www.spized.com/thumbnail/ec/18/b3/1752243175/e3ad4da2-a889-3963-c6e8-f7a0582cff6f_781001-V2_600x600.png?ts=1752243175",
    "https://www.spized.com/thumbnail/18/c3/8b/1744797261/custom-football-jersey-red-white-chevron-pattern_600x600.webp?ts=1794311519",
  ],
  jacket: [
    "https://www.spized.com/thumbnail/e9/e8/b6/1698000660/trainingsanzugjacke-herren-premium1-3_470x580.jpg?ts=1745265681",
    "https://www.spized.com/thumbnail/0c/9e/d4/1701168696/trainingsjacke-damen-premium1-1_470x580.jpg?ts=1745265645",
  ],
  "fit-kit": [
    "https://www.spized.com/thumbnail/74/0b/41/1731488347/fussball-trikot-herren-kurzarm-basic1-1_%281%29_470x580.jpg?ts=1745265613",
    "https://www.spized.com/thumbnail/de/c0/3c/1731488347/fussball-trikot-herren-kurzarm-basic2-2_%281%29_320x400.jpg?ts=1745265613",
  ],
  "rush-add-on": ["https://medusa-public-images.s3.eu-west-1.amazonaws.com/shorts-vintage-front.png"],
}

describe("the placeholder image URLs in the seed data", () => {
  it("are exactly the contract's URLs, in order, marked placeholder", () => {
    const byHandle = Object.fromEntries(
      seedData.products.data.map((p) => [p.handle, p.images])
    )
    expect(byHandle).toEqual(
      Object.fromEntries(
        Object.entries(CONTRACT_IMAGES).map(([handle, urls]) => [handle, { placeholder: true, urls }])
      )
    )
  })

  it("keeps the query strings and the encoded brackets of the spized.com links", () => {
    for (const product of seedData.products.data.filter((p) => p.handle !== "rush-add-on")) {
      for (const url of product.images.urls) {
        expect(url).toMatch(/^https:\/\/www\.spized\.com\/thumbnail\/.+\?ts=\d+$/)
        expect(isHttpsUrl(url)).toBe(true)
      }
    }
    expect(seedData.products.data.find((p) => p.handle === "fit-kit")!.images.urls[0]).toContain(
      "basic1-1_%281%29_470x580.jpg"
    )
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
    const [jersey1, jersey2] = CONTRACT_IMAGES.jersey
    const [fitKit1, fitKit2] = CONTRACT_IMAGES["fit-kit"]
    expect(plan).toEqual([
      {
        productId: "p1",
        handle: "jersey",
        thumbnail: jersey1,
        images: [{ url: jersey1 }, { url: jersey2 }],
      },
      {
        productId: "p3",
        handle: "fit-kit",
        thumbnail: fitKit1,
        images: [{ url: fitKit1 }, { url: fitKit2 }],
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
    expect(isHttpsUrl(CONTRACT_IMAGES["t-shirt"][0])).toBe(true)
    expect(isHttpsUrl("http://example.com/a.png")).toBe(false)
    expect(isHttpsUrl("//example.com/a.png")).toBe(false)
    expect(isHttpsUrl("tee-black-front.png")).toBe(false)
    expect(isHttpsUrl(" https://example.com/a.png")).toBe(false)
    expect(isHttpsUrl("")).toBe(false)
    expect(isHttpsUrl(undefined)).toBe(false)
  })
})
