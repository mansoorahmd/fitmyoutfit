import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

vi.mock("@lib/store-config", () => ({
  STORE_NAME: "Test Club Kits",
  DEFAULT_STORE_NAME: "FitMyOutfit",
}))
vi.mock("@lib/config", () => ({ sdk: { client: { fetch: vi.fn() } } }))
vi.mock("@lib/data/regions", () => ({ listRegions: async () => [] }))
vi.mock("@lib/data/garment-links", () => ({
  listGarmentLinks: async () => [
    { id: "p1", title: "Jersey", href: "/products/jersey", thumbnail: null },
  ],
}))
vi.mock("@modules/common/components/localized-client-link", () => ({
  default: ({ children, href, ...rest }: any) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))

import CheckoutLayout from "../app/[countryCode]/(checkout)/layout"
import Footer from "@modules/layout/templates/footer"

function externalLinks(container: HTMLElement) {
  return Array.from(container.querySelectorAll("a[href]")).filter((a) =>
    /^https?:\/\//.test(a.getAttribute("href") ?? "")
  )
}

describe("footer has no Medusa promotion", () => {
  it("shows no Powered by line, Medusa column, GitHub or docs links", async () => {
    const { container } = render(await Footer({ countryCode: "pk" }))

    expect(screen.queryByText(/Powered by/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/Medusa/i)).not.toBeInTheDocument()
    expect(screen.queryByText("GitHub")).not.toBeInTheDocument()
    expect(screen.queryByText("Documentation")).not.toBeInTheDocument()
    expect(screen.queryByText("Source code")).not.toBeInTheDocument()
    expect(externalLinks(container)).toHaveLength(0)
  })

  it("has no starter Categories or Collections columns, and keeps the copyright line", async () => {
    render(await Footer({ countryCode: "pk" }))

    expect(screen.queryByText("Categories")).not.toBeInTheDocument()
    expect(screen.queryByText("Collections")).not.toBeInTheDocument()
    expect(screen.queryByText("Garments")).not.toBeInTheDocument()
    expect(screen.getByText("Jersey")).toBeInTheDocument()
    expect(
      screen.getByText(/Test Club Kits\. All rights reserved\./)
    ).toBeInTheDocument()
  })
})

describe("checkout layout has no Medusa promotion", () => {
  it("shows no Powered by line and no external links", () => {
    const { container } = render(<CheckoutLayout>content</CheckoutLayout>)

    expect(screen.queryByText(/Powered by/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/Medusa/i)).not.toBeInTheDocument()
    expect(externalLinks(container)).toHaveLength(0)
    expect(screen.getByText("content")).toBeInTheDocument()
  })
})
