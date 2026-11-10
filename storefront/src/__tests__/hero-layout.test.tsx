import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

const content = vi.hoisted(() => ({
  homeContent: {
    headline: "Headline",
    subline: "Subline.",
    button: { label: "Go", href: "/store" },
    heroImage: null as null | { src: string; alt: string },
  },
}))

vi.mock("@content/home", () => content)
vi.mock("next/navigation", () => ({ useParams: () => ({ countryCode: "pk" }) }))
vi.mock("next/image", () => ({
  default: ({ src, alt }: { src: string; alt: string }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} />
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

  it("without an image: no image, no empty box, no two-column grid", () => {
    content.homeContent.heroImage = null
    const { container } = render(<Hero />)

    expect(container.querySelector("img")).toBeNull()
    expect(screen.queryByTestId("home-hero-image")).not.toBeInTheDocument()
    expect(container.innerHTML).not.toContain("xl:grid-cols-12")
    expect(container.innerHTML).not.toContain("surface-alt")
  })

  it("with an image: text 5/12 and image 7/12 from 1280 px, image after the text", () => {
    content.homeContent.heroImage = { src: "/kit.jpg", alt: "Our team kit, front and back" }
    const { container } = render(<Hero />)

    const image = screen.getByRole("img", { name: "Our team kit, front and back" })
    const heading = screen.getByRole("heading", { level: 1 })
    expect(
      heading.compareDocumentPosition(image) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy()
    expect(container.innerHTML).toContain("xl:grid-cols-12")
    expect(container.innerHTML).toContain("xl:col-span-5")
    expect(classesOf(screen.getByTestId("home-hero-image"))).toEqual(
      expect.arrayContaining(["aspect-[4/3]", "xl:col-span-7"])
    )
  })
})
