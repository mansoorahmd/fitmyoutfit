import { render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const { notFound, listProducts, getRegion, listRegions } = vi.hoisted(() => ({
  // like Next.js: notFound() throws so nothing after it runs
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND")
  }),
  listProducts: vi.fn(),
  getRegion: vi.fn(),
  listRegions: vi.fn(),
}))

vi.mock("next/navigation", () => ({
  notFound,
  useParams: () => ({ countryCode: "pk" }),
}))
vi.mock("@lib/data/products", () => ({ listProducts }))
vi.mock("@lib/data/regions", () => ({ getRegion, listRegions }))
vi.mock("@modules/products/templates", () => ({ default: () => null }))

import RootNotFound from "../app/not-found"
import RegionNotFound from "../app/[countryCode]/(main)/not-found"
import CatchAll from "../app/[countryCode]/(main)/[...not_found]/page"
import ProductPage, {
  generateMetadata,
  generateStaticParams,
} from "../app/[countryCode]/(main)/products/[handle]/page"

describe("not-found page", () => {
  it("inside a region: the heading and links to the garments and home, with the country code", () => {
    render(<RegionNotFound />)

    expect(
      screen.getByRole("heading", { level: 1, name: "We can't find that page" })
    ).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Browse garments" })).toHaveAttribute(
      "href",
      "/pk/store"
    )
    expect(
      screen.getByRole("link", { name: "Go to the home page" })
    ).toHaveAttribute("href", "/pk")
  })

  it("outside a region: the same page with bare links", () => {
    render(<RootNotFound />)

    expect(
      screen.getByRole("heading", { name: "We can't find that page" })
    ).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Browse garments" })).toHaveAttribute(
      "href",
      "/store"
    )
    expect(
      screen.getByRole("link", { name: "Go to the home page" })
    ).toHaveAttribute("href", "/")
  })

  it("the main button is the only red one; home is secondary", () => {
    render(<RegionNotFound />)

    expect(
      screen.getByRole("link", { name: "Browse garments" }).className
    ).toContain("bg-brand-primary")
    expect(
      screen.getByRole("link", { name: "Go to the home page" }).className
    ).not.toContain("brand-primary")
  })
})

describe("unknown paths reach the not-found page", () => {
  beforeEach(() => {
    notFound.mockClear()
  })

  it("an unmatched path inside a region calls notFound()", () => {
    expect(() => CatchAll()).toThrow("NEXT_NOT_FOUND")
    expect(notFound).toHaveBeenCalledTimes(1)
  })

  it("an unknown product handle calls notFound() instead of crashing", async () => {
    getRegion.mockResolvedValue({ id: "reg_pk" })
    listProducts.mockResolvedValue({ response: { products: [], count: 0 } })

    await expect(
      ProductPage({
        params: Promise.resolve({ countryCode: "pk", handle: "no-such-thing" }),
        searchParams: Promise.resolve({}),
      })
    ).rejects.toThrow("NEXT_NOT_FOUND")
    expect(notFound).toHaveBeenCalledTimes(1)
  })
})

describe("the rush add-on has no product page", () => {
  const rush = {
    id: "prod_rush",
    handle: "rush-add-on",
    title: "Rush production",
    metadata: { kind: "rush_add_on" },
  }

  beforeEach(() => {
    notFound.mockClear()
    listProducts.mockClear()
    getRegion.mockResolvedValue({ id: "reg" })
    listProducts.mockResolvedValue({ response: { products: [rush], count: 1 } })
  })

  it("its product URL is not found, in every region", async () => {
    for (const countryCode of ["pk", "gb", "ae", "us"]) {
      await expect(
        ProductPage({
          params: Promise.resolve({ countryCode, handle: "rush-add-on" }),
          searchParams: Promise.resolve({}),
        })
      ).rejects.toThrow("NEXT_NOT_FOUND")
      await expect(
        generateMetadata({
          params: Promise.resolve({ countryCode, handle: "rush-add-on" }),
          searchParams: Promise.resolve({}),
        })
      ).rejects.toThrow("NEXT_NOT_FOUND")
    }
    expect(notFound).toHaveBeenCalledTimes(8)
  })

  it("is found by kind, not by handle", async () => {
    listProducts.mockResolvedValue({
      response: {
        products: [{ ...rush, handle: "express", metadata: { kind: "rush_add_on" } }],
        count: 1,
      },
    })
    await expect(
      ProductPage({
        params: Promise.resolve({ countryCode: "pk", handle: "express" }),
        searchParams: Promise.resolve({}),
      })
    ).rejects.toThrow("NEXT_NOT_FOUND")
  })

  it("a garment and the fit kit still get their pages", async () => {
    for (const kind of ["garment", "fit_kit"]) {
      listProducts.mockResolvedValue({
        response: {
          products: [{ id: "p", handle: "x", title: "X", metadata: { kind }, images: [] }],
          count: 1,
        },
      })
      await expect(
        ProductPage({
          params: Promise.resolve({ countryCode: "pk", handle: "x" }),
          searchParams: Promise.resolve({}),
        })
      ).resolves.toBeTruthy()
    }
    expect(notFound).not.toHaveBeenCalled()
  })

  it("gets no static params; the others do, with the metadata asked for", async () => {
    listRegions.mockResolvedValue([
      { countries: [{ iso_2: "pk" }] },
      { countries: [{ iso_2: "gb" }] },
    ])
    listProducts.mockResolvedValue({
      response: {
        products: [
          { handle: "jersey", metadata: { kind: "garment" } },
          { handle: "fit-kit", metadata: { kind: "fit_kit" } },
          { handle: "rush-add-on", metadata: { kind: "rush_add_on" } },
        ],
        count: 3,
      },
    })

    const params = await generateStaticParams()

    expect(params).toEqual([
      { countryCode: "pk", handle: "jersey" },
      { countryCode: "pk", handle: "fit-kit" },
      { countryCode: "gb", handle: "jersey" },
      { countryCode: "gb", handle: "fit-kit" },
    ])
    for (const [call] of listProducts.mock.calls) {
      expect(call.queryParams.fields.split(",")).toContain("metadata")
    }
  })
})
