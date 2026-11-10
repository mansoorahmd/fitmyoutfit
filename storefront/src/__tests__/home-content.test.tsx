import fs from "node:fs"
import path from "node:path"
import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

// Uses the real content file (no mock of it): checks the shipped placeholder
// copy is wired up, and that the button goes to the store listing with the
// country code kept.
vi.mock("next/navigation", () => ({
  useParams: () => ({ countryCode: "pk" }),
}))
vi.mock("next/image", () => ({
  default: ({ src, alt }: { src: string; alt: string }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} />
  ),
}))
vi.mock("styles/globals.css", () => ({}))
vi.mock("@lib/config", () => ({ sdk: { client: { fetch: vi.fn() } } }))
vi.mock("@lib/data/collections", () => ({
  getGarmentsCollection: async () => undefined,
}))
vi.mock("@lib/data/regions", () => ({
  getRegion: async (countryCode: string) => ({ id: `reg_${countryCode}` }),
}))

import { homeContent } from "@content/home"
import Home, { metadata as homeMetadata } from "../app/[countryCode]/(main)/page"
import Hero from "@modules/home/components/hero"

describe("home content file (placeholder copy)", () => {
  it("has a headline, subline, button label and a store destination", () => {
    expect(homeContent.headline).not.toBe("")
    expect(homeContent.subline).not.toBe("")
    expect(homeContent.button.label).not.toBe("")
    expect(homeContent.button.href).toBe("/store")
  })

  it("hero shows the content file's copy with a /pk/store button", () => {
    render(<Hero />)

    expect(
      screen.getByRole("heading", { level: 1, name: homeContent.headline })
    ).toBeInTheDocument()
    expect(screen.getByText(homeContent.subline)).toBeInTheDocument()
    expect(
      screen.getByRole("link", { name: homeContent.button.label })
    ).toHaveAttribute("href", "/pk/store")
  })

  it("home meta description equals the subline", () => {
    expect(homeMetadata.description).toBe(homeContent.subline)
  })
})

describe("home content file (draft wording for the sections)", () => {
  it("is marked as draft wording", () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, "..", "content", "home.ts"),
      "utf8"
    )
    expect(source.startsWith("// DRAFT WORDING.")).toBe(true)
  })

  it("has the development stand-in hero image and the secondary button", () => {
    expect(homeContent.heroImage).toEqual({
      src: "https://www.spized.com/thumbnail/ee/83/13/1787036820/header-trikot-selbst-gestalten-desktop_1920x1920.webp?ts=1789131738",
      alt: "A player wearing a custom team jersey",
    })
    expect(homeContent.secondaryButton).toEqual({
      label: "See the garments",
      href: "/store",
    })
    expect(homeContent.howItWorksLink.href).toBe(`#${homeContent.howItWorks.id}`)
  })

  it("adds no minimum order, WhatsApp, reviews or club logos", () => {
    const all = JSON.stringify(homeContent)
    for (const word of [/minimum/i, /whatsapp/i, /review/i, /logo/i, /size chart/i]) {
      expect(all).not.toMatch(word)
    }
  })
})

describe("home page", () => {
  const renderHome = async (countryCode: string) =>
    render(await Home({ params: Promise.resolve({ countryCode }) }))

  it("has the sections in the spec's order, under one h1", async () => {
    await renderHome("pk")

    const headings = screen
      .getAllByRole("heading")
      .map((h) => [h.tagName, h.textContent])
    expect(headings.filter(([tag]) => tag === "H1")).toEqual([
      ["H1", homeContent.headline],
    ])
    expect(headings.filter(([tag]) => tag === "H2").map(([, text]) => text)).toEqual([
      "What we promise",
      "Choose your garment",
      "How team orders work",
      "One page everyone signs off",
      "Not sure of sizes?",
      "Questions",
    ])
  })

  it("never skips a heading level", async () => {
    await renderHome("gb")

    const levels = screen
      .getAllByRole("heading")
      .map((h) => Number(h.tagName.slice(1)))
    levels.forEach((level, i) => {
      if (i > 0) expect(level - levels[i - 1]).toBeLessThanOrEqual(1)
    })
  })

  it("differs by region in the promise strip and the questions", async () => {
    const { unmount } = await renderHome("pk")
    expect(screen.getByText("Pay your way")).toBeInTheDocument()
    expect(screen.queryByText("Who pays shipping and duties?")).not.toBeInTheDocument()
    unmount()

    await renderHome("gb")
    expect(screen.getByText("Shipping and duties included")).toBeInTheDocument()
    expect(screen.getByText("Who pays shipping and duties?")).toBeInTheDocument()
    expect(screen.queryByText("Pay your way")).not.toBeInTheDocument()
  })
})
