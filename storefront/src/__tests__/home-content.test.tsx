import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

// Uses the real content file (no mock of it): checks the shipped placeholder
// copy is wired up, and that the button goes to the store listing with the
// country code kept.
vi.mock("next/navigation", () => ({
  useParams: () => ({ countryCode: "pk" }),
}))
vi.mock("styles/globals.css", () => ({}))
vi.mock("@lib/config", () => ({ sdk: { client: { fetch: vi.fn() } } }))
vi.mock("@lib/data/collections", () => ({
  getGarmentsCollection: async () => undefined,
}))
vi.mock("@lib/data/regions", () => ({ getRegion: async () => null }))

import { homeContent } from "@content/home"
import { metadata as homeMetadata } from "../app/[countryCode]/(main)/page"
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
