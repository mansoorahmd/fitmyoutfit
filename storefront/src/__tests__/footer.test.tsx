import { render, screen, within } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

const { updateRegion } = vi.hoisted(() => ({ updateRegion: vi.fn(async () => {}) }))

vi.mock("next/navigation", () => ({
  useParams: () => ({ countryCode: "gb" }),
  usePathname: () => "/gb/store",
}))
vi.mock("@lib/store-config", () => ({ STORE_NAME: "FitMyOutfit" }))
vi.mock("@lib/data/cart", () => ({ updateRegion }))
vi.mock("@lib/data/regions", () => ({
  listRegions: async () => [
    {
      id: "reg_pk",
      currency_code: "pkr",
      countries: [{ iso_2: "pk", display_name: "Pakistan" }],
    },
    {
      id: "reg_gb",
      currency_code: "gbp",
      countries: [{ iso_2: "gb", display_name: "United Kingdom" }],
    },
  ],
}))
vi.mock("@lib/data/garment-links", () => ({
  listGarmentLinks: async () => [
    { id: "p1", title: "Jersey", href: "/products/jersey", thumbnail: null },
    { id: "p2", title: "T-Shirt", href: "/products/t-shirt", thumbnail: null },
    { id: "p3", title: "Jacket", href: "/products/jacket", thumbnail: null },
  ],
}))

import Footer from "@modules/layout/templates/footer"

const renderFooter = async () => render(await Footer({ countryCode: "gb" }))

const linksIn = (testId: string) =>
  within(screen.getByTestId(testId))
    .getAllByRole("link")
    .map((a) => [a.textContent, a.getAttribute("href")])

describe("footer", () => {
  it("is navy", async () => {
    await renderFooter()

    expect(screen.getByTestId("footer").className).toContain("bg-brand-inverse")
  })

  it("links the garments from the collection, then the fit kit", async () => {
    await renderFooter()

    expect(
      within(screen.getByTestId("footer-shop")).getByRole("heading", { level: 2 })
    ).toHaveTextContent("Shop")
    expect(linksIn("footer-shop")).toEqual([
      ["Jersey", "/gb/products/jersey"],
      ["T-Shirt", "/gb/products/t-shirt"],
      ["Jacket", "/gb/products/jacket"],
      ["Fit kit", "/gb/products/fit-kit"],
    ])
  })

  it("links How it works to the home page section, and the account pages", async () => {
    await renderFooter()

    expect(linksIn("footer-team-orders")).toEqual([
      ["How it works", "/gb#how-team-orders-work"],
    ])
    expect(linksIn("footer-account")).toEqual([
      ["Sign in", "/gb/account"],
      ["Cart", "/gb/cart"],
    ])
  })

  it("links only to pages that exist: no help, legal or company pages", async () => {
    const { container } = await renderFooter()

    const hrefs = Array.from(container.querySelectorAll("a")).map((a) =>
      a.getAttribute("href")
    )
    expect(hrefs.every((href) => /^\/gb(\/|#|$)/.test(href ?? ""))).toBe(true)
    for (const text of [/shipping/i, /terms/i, /privacy/i, /about/i, /contact/i, /powered by/i]) {
      expect(screen.queryByText(text)).not.toBeInTheDocument()
    }
  })

  it("puts links in two columns on phones and more from 768 px", async () => {
    await renderFooter()

    const grid = screen.getByTestId("footer-shop").parentElement!
    expect(grid.className.split(/\s+/)).toEqual(
      expect.arrayContaining(["grid-cols-2", "md:grid-cols-4"])
    )
    expect(grid.className).not.toMatch(/\b(small|medium|large|xsmall):/)
  })

  it("every link is a 44 px target", async () => {
    await renderFooter()

    for (const testId of ["footer-shop", "footer-team-orders", "footer-account"]) {
      for (const link of within(screen.getByTestId(testId)).getAllByRole("link")) {
        expect(link.className).toContain("min-h-[44px]")
      }
    }
    expect(screen.getByTestId("footer-store-link").className).toContain("min-h-[44px]")
  })

  it("has the header's region selector, the store name and the copyright year", async () => {
    await renderFooter()

    expect(screen.getByTestId("region-chip")).toHaveTextContent("GB · GBP")
    expect(screen.getByTestId("footer-store-link")).toHaveTextContent("FitMyOutfit")
    expect(
      screen.getByText(`© ${new Date().getFullYear()} FitMyOutfit. All rights reserved.`)
    ).toBeInTheDocument()
  })
})
