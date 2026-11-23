import path from "node:path"
import { seedData } from "../../seed-data"
import {
  classifyPictures,
  isHttpsUrl,
  isUploadOf,
  needsPlaceholderImage,
  planProductPictures,
  settlePicturePlan,
} from "../product-images"
import { pictureDirectories, pictureMimeType, readPictureFiles } from "../product-picture-files"

/**
 * The contract's "Product images" table (docs/contracts/sprint-0-dev-setup.md, as changed on
 * 10 Nov 2026), written out in full so a typo in the seed data fails here. These are the stand-in
 * links (the old stand-ins for the jersey and the T-shirt). No network needed.
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

/** Our own pictures: the jersey (V-neck then round neck, front then back) and the T-shirt. */
const OUR_FILES: Record<string, string[]> = {
  jersey: [
    "jersey-vneck-front.webp",
    "jersey-vneck-back.webp",
    "jersey-round-front.webp",
    "jersey-round-back.webp",
  ],
  "t-shirt": ["tshirt-front.webp", "tshirt-back.webp"],
}

describe("the product pictures in the seed data", () => {
  it("are the contract's stand-in URLs in order, plus our own files for the jersey and the T-shirt, marked placeholder", () => {
    const byHandle = Object.fromEntries(seedData.products.data.map((p) => [p.handle, p.images]))
    expect(byHandle).toEqual(
      Object.fromEntries(
        Object.entries(CONTRACT_IMAGES).map(([handle, urls]) => [
          handle,
          { placeholder: true, urls, ...(OUR_FILES[handle] ? { files: OUR_FILES[handle] } : {}) },
        ])
      )
    )
  })

  it("name our own files as plain file names, and no file for the jacket and the fit kit", () => {
    for (const product of seedData.products.data) {
      for (const file of product.images.files ?? []) {
        expect(file).toMatch(/^[a-z-]+\.webp$/)
      }
    }
    for (const handle of ["jacket", "fit-kit", "rush-add-on"]) {
      expect(seedData.products.data.find((p) => p.handle === handle)!.images.files).toBeUndefined()
    }
  })

  it("name files that exist in packages/editor/samples/pictures/products/ (WebP)", async () => {
    const { found, unreadable } = await readPictureFiles(Object.values(OUR_FILES).flat(), [
      path.resolve(__dirname, "../../../../../packages/editor/samples/pictures/products"),
    ])
    expect(unreadable).toEqual([])
    for (const content of found.values()) {
      expect(content.subarray(0, 4).toString("latin1")).toBe("RIFF")
      expect(content.subarray(8, 12).toString("latin1")).toBe("WEBP")
    }
  })

  it("keep the query strings and the encoded brackets of the spized.com links", () => {
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

describe("planProductPictures", () => {
  const seeds = seedData.products.data
  const seedOf = (handle: string) => seeds.find((p) => p.handle === handle)!
  const standIns = (handle: string) => ({
    thumbnail: seedOf(handle).images.urls[0],
    images: seedOf(handle).images.urls.map((url) => ({ url })),
  })
  const ours = (handle: string) => {
    const urls = seedOf(handle).images.files!.map(
      (file) => `http://localhost:9009/static/1700000000000-${file}`
    )
    return { thumbnail: urls[0], images: urls.map((url) => ({ url })) }
  }

  it("gives a product with no picture our files, or the stand-in links when it has no files", () => {
    const plan = planProductPictures(
      [
        { id: "p1", handle: "jersey", thumbnail: null, images: [] },
        { id: "p2", handle: "jacket", thumbnail: "http://x/real.jpg", images: [{ url: "http://x/real.jpg" }] },
        { id: "p3", handle: "fit-kit", thumbnail: null, images: [] },
      ],
      seeds
    )
    expect(plan).toEqual([
      {
        productId: "p1",
        handle: "jersey",
        kind: "fresh",
        urls: CONTRACT_IMAGES.jersey,
        files: OUR_FILES.jersey,
      },
      { productId: "p3", handle: "fit-kit", kind: "fresh", urls: CONTRACT_IMAGES["fit-kit"], files: [] },
    ])
  })

  it("replaces exactly the old stand-in photos of a product that has files, and only those", () => {
    const plan = planProductPictures(
      [
        { id: "p1", handle: "jersey", ...standIns("jersey") },
        { id: "p2", handle: "t-shirt", ...standIns("t-shirt") },
        { id: "p3", handle: "jacket", ...standIns("jacket") },
      ],
      seeds
    )
    expect(plan.map((e) => [e.handle, e.kind])).toEqual([
      ["jersey", "replace"],
      ["t-shirt", "replace"],
    ])
  })

  it("leaves a changed picture alone: another thumbnail, an extra or a missing image, an admin photo", () => {
    const jersey = standIns("jersey")
    const adminPhoto = "https://cdn.example.com/our-photo.jpg"
    const cases = [
      { thumbnail: adminPhoto, images: jersey.images },
      { thumbnail: jersey.thumbnail, images: [...jersey.images, { url: adminPhoto }] },
      { thumbnail: jersey.thumbnail, images: [jersey.images[0]] },
      { thumbnail: adminPhoto, images: [{ url: adminPhoto }] },
      { thumbnail: null, images: [{ url: adminPhoto }] },
      { thumbnail: jersey.thumbnail, images: [] },
    ]
    for (const state of cases) {
      expect(planProductPictures([{ id: "p1", handle: "jersey", ...state }], seeds)).toEqual([])
    }
  })

  it("plans nothing for a product that already shows our pictures, so a second run uploads nothing", () => {
    expect(classifyPictures({ id: "p1", handle: "jersey", ...ours("jersey") }, seedOf("jersey"))).toBe(
      "ours"
    )
    expect(
      planProductPictures(
        [
          { id: "p1", handle: "jersey", ...ours("jersey") },
          { id: "p2", handle: "t-shirt", ...ours("t-shirt") },
        ],
        seeds
      )
    ).toEqual([])
  })

  it("ignores products that are not in the seed data", () => {
    expect(planProductPictures([{ id: "p9", handle: "admin-made", thumbnail: null }], seeds)).toEqual([])
  })

  it("plans nothing once every product has a picture", () => {
    const existing = seeds.map((p, i) => ({
      id: `p${i}`,
      handle: p.handle,
      ...(p.images.files ? ours(p.handle) : standIns(p.handle)),
    }))
    expect(planProductPictures(existing, seeds)).toEqual([])
  })
})

describe("isUploadOf", () => {
  it("matches the stored name with a prefix, not another file that merely ends alike", () => {
    expect(isUploadOf("http://h/static/1700-tshirt-front.webp", "tshirt-front.webp")).toBe(true)
    expect(isUploadOf("https://s3.example/bucket/01ABC-tshirt-front.webp?x=1", "tshirt-front.webp")).toBe(true)
    expect(isUploadOf("http://h/static/tshirt-front.webp", "tshirt-front.webp")).toBe(true)
    expect(isUploadOf("http://h/static/mytshirt-front.webp", "tshirt-front.webp")).toBe(false)
    expect(isUploadOf("http://h/static/1700-tshirt-back.webp", "tshirt-front.webp")).toBe(false)
  })
})

describe("settlePicturePlan", () => {
  const fresh = {
    productId: "p1",
    handle: "jersey",
    kind: "fresh" as const,
    urls: ["https://a/1"],
    files: ["a.webp", "b.webp"],
  }
  const replace = { ...fresh, productId: "p2", handle: "t-shirt", kind: "replace" as const }
  const plain = { ...fresh, productId: "p3", handle: "fit-kit", files: [] }

  it("sets the files when all are readable, the links for a product without files", () => {
    expect(
      settlePicturePlan([fresh, replace, plain], new Set()).map((s) => [s.entry.handle, s.set])
    ).toEqual([
      ["jersey", "files"],
      ["t-shirt", "files"],
      ["fit-kit", "urls"],
    ])
  })

  it("leaves a replace entry as it is, and gives a fresh one its links, when a file is unreadable", () => {
    expect(
      settlePicturePlan([fresh, replace], new Set(["b.webp"])).map((s) => [s.entry.handle, s.set])
    ).toEqual([["jersey", "urls"]])
  })
})

describe("the picture files reader", () => {
  it("lists what it cannot read, in the order asked", async () => {
    const { found, unreadable } = await readPictureFiles(["nope-1.webp", "nope-2.webp"], [
      path.join(__dirname, "no-such-folder"),
    ])
    expect(found.size).toBe(0)
    expect(unreadable).toEqual(["nope-1.webp", "nope-2.webp"])
  })

  it("looks in the repo's packages folder from backend/ and from backend/.medusa/server", () => {
    const [fromBackend] = pictureDirectories(path.resolve("/repo/backend")).map((dir) =>
      dir.replace(/\\/g, "/")
    )
    expect(fromBackend).toMatch(/\/repo\/packages\/editor\/samples\/pictures\/products$/)
    expect(
      pictureDirectories(path.resolve("/repo/backend/.medusa/server")).map((d) => d.replace(/\\/g, "/"))[1]
    ).toMatch(/\/repo\/packages\/editor\/samples\/pictures\/products$/)
  })

  it("gives the MIME type from the extension", () => {
    expect(pictureMimeType("a.webp")).toBe("image/webp")
    expect(pictureMimeType("a.PNG")).toBe("image/png")
    expect(pictureMimeType("a.jpeg")).toBe("image/jpeg")
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
