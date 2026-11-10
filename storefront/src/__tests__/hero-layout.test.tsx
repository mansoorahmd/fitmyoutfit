import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

const content = vi.hoisted(() => ({
  homeContent: {
    headline: "Headline",
    subline: "Subline.",
    button: { label: "Go", href: "/store" },
    secondaryButton: { label: "Browse", href: "/store" },
    howItWorksLink: { label: "How it works", href: "#how" },
    heroImage: null as null | { src: string; alt: string },
  },
}))

vi.mock("@content/home", () => content)
vi.mock("next/navigation", () => ({ useParams: () => ({ countryCode: "pk" }) }))
vi.mock("next/image", () => ({
  default: ({ src, alt, className }: { src: string; alt: string; className?: string }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} className={className} />
  ),
}))

import Hero from "@modules/home/components/hero"

const classesOf = (el: Element) => el.className.split(/\s+/)

describe("home hero layout", () => {
  it("sits on navy with the headline in the display style", () => {
    content.homeContent.heroImage = null
    render(<Hero />)

    expect(classesOf(screen.getByTestId("home-hero"))).toContain("bg-brand-inverse")
    expect(classesOf(screen.getByRole("heading", { level: 1 }))).toContain(
      "type-display"
    )
  })

  it("has a full-width primary button on phones, natural width from 768 px", () => {
    content.homeContent.heroImage = null
    render(<Hero />)

    const button = screen.getByRole("link", { name: "Go" })
    expect(classesOf(button)).toEqual(
      expect.arrayContaining(["w-full", "md:w-auto", "bg-brand-primary", "h-12"])
    )
  })

  it("has a secondary button readable on navy, never red, after the main one", () => {
    content.homeContent.heroImage = null
    render(<Hero />)

    const main = screen.getByRole("link", { name: "Go" })
    const secondary = screen.getByRole("link", { name: "Browse" })
    expect(secondary).toHaveAttribute("href", "/pk/store")
    expect(secondary.className).not.toContain("brand-primary")
    expect(classesOf(secondary)).toEqual(
      expect.arrayContaining(["border-brand-on-inverse", "text-brand-on-inverse", "h-12"])
    )
    expect(
      main.compareDocumentPosition(secondary) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy()
  })

  it("has a white text link that jumps to How team orders work", () => {
    content.homeContent.heroImage = null
    render(<Hero />)

    const link = screen.getByRole("link", { name: "How it works" })
    expect(link).toHaveAttribute("href", "/pk#how")
    expect(classesOf(link)).toEqual(
      expect.arrayContaining(["underline", "text-brand-on-inverse", "min-h-[44px]"])
    )
  })

  it("without an image: no image, no overlay, no empty box", () => {
    content.homeContent.heroImage = null
    const { container } = render(<Hero />)

    expect(container.querySelector("img")).toBeNull()
    expect(screen.queryByTestId("home-hero-image")).not.toBeInTheDocument()
    expect(screen.queryByTestId("home-hero-overlay")).not.toBeInTheDocument()
    expect(container.innerHTML).not.toContain("surface-alt")
  })

  it("with an image: the image fills the band behind the text, under the navy layer", () => {
    content.homeContent.heroImage = { src: "/kit.jpg", alt: "Our team kit, front and back" }
    render(<Hero />)

    const image = screen.getByRole("img", { name: "Our team kit, front and back" })
    expect(classesOf(image)).toContain("object-cover")
    const layer = screen.getByTestId("home-hero-image")
    expect(classesOf(layer)).toEqual(expect.arrayContaining(["absolute", "inset-0", "-z-10"]))
    expect(classesOf(screen.getByTestId("home-hero")).slice(0, 3)).toEqual(
      expect.arrayContaining(["relative", "isolate"])
    )
    const overlay = screen.getByTestId("home-hero-overlay")
    expect(overlay).toHaveAttribute("aria-hidden", "true")
    expect(classesOf(overlay)).toContain("bg-brand-inverse/80")
  })

  it("keeps the text first and the main button before anything else to tap", () => {
    content.homeContent.heroImage = { src: "/kit.jpg", alt: "Kit" }
    render(<Hero />)

    const links = screen.getAllByRole("link")
    expect(links.map((l) => l.textContent)).toEqual(["Go", "Browse", "How it works"])
  })
})
