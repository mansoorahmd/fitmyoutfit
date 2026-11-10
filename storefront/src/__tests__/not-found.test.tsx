import { render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const { notFound, listProducts, getRegion } = vi.hoisted(() => ({
  // like Next.js: notFound() throws so nothing after it runs
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND")
  }),
  listProducts: vi.fn(),
  getRegion: vi.fn(),
}))

vi.mock("next/navigation", () => ({
  notFound,
  useParams: () => ({ countryCode: "pk" }),
}))
vi.mock("@lib/data/products", () => ({ listProducts }))
vi.mock("@lib/data/regions", () => ({ getRegion, listRegions: vi.fn() }))
vi.mock("@modules/products/templates", () => ({ default: () => null }))

import RootNotFound from "../app/not-found"
import RegionNotFound from "../app/[countryCode]/(main)/not-found"
import CatchAll from "../app/[countryCode]/(main)/[...not_found]/page"
import ProductPage from "../app/[countryCode]/(main)/products/[handle]/page"

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
