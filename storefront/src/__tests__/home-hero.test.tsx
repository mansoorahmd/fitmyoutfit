import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

// The copy comes from the content file. Replace it with different strings:
// if the hero (or the metadata) hard-coded the wording, these tests fail.
vi.mock("@content/home", () => ({
  homeContent: {
    headline: "Test headline from the content file",
    subline: "Test subline from the content file.",
    button: { label: "Test button label", href: "/test-destination" },
    secondaryButton: { label: "Test secondary label", href: "/test-secondary" },
    howItWorksLink: { label: "Test how link", href: "#test-section" },
    heroImage: null,
  },
}))

vi.mock("next/navigation", () => ({
  useParams: () => ({ countryCode: "pk" }),
}))
vi.mock("styles/globals.css", () => ({}))
vi.mock("@lib/config", () => ({ sdk: { client: { fetch: vi.fn() } } }))
vi.mock("@lib/data/collections", () => ({
  getGarmentsCollection: async () => undefined,
}))
vi.mock("@lib/data/regions", () => ({ getRegion: async () => null }))

import { metadata as homeMetadata } from "../app/[countryCode]/(main)/page"
import Hero from "@modules/home/components/hero"

describe("home hero reads its copy from the content file", () => {
  it("renders the headline as the single h1", () => {
    render(<Hero />)

    const h1s = screen.getAllByRole("heading", { level: 1 })
    expect(h1s).toHaveLength(1)
    expect(h1s[0]).toHaveTextContent("Test headline from the content file")
  })

  it("renders the subline", () => {
    render(<Hero />)

    expect(
      screen.getByText("Test subline from the content file.")
    ).toBeInTheDocument()
  })

  it("renders the button as a link to the localized destination", () => {
    render(<Hero />)

    const link = screen.getByRole("link", { name: "Test button label" })
    expect(link).toHaveAttribute("href", "/pk/test-destination")
  })

  it("shows no starter or Medusa promotion", () => {
    render(<Hero />)

    expect(screen.queryByText(/Medusa/i)).not.toBeInTheDocument()
    expect(
      screen.queryByText(/Ecommerce Starter Template/i)
    ).not.toBeInTheDocument()
    expect(screen.queryByText(/View on GitHub/i)).not.toBeInTheDocument()
    expect(screen.getAllByRole("link")).toHaveLength(3)
  })

  it("renders the secondary button and the how-it-works link from the content file", () => {
    render(<Hero />)

    expect(
      screen.getByRole("link", { name: "Test secondary label" })
    ).toHaveAttribute("href", "/pk/test-secondary")
    expect(screen.getByRole("link", { name: "Test how link" })).toHaveAttribute(
      "href",
      "/pk#test-section"
    )
  })

  it("uses the subline as the home page meta description", () => {
    expect(homeMetadata.description).toBe("Test subline from the content file.")
  })
})
