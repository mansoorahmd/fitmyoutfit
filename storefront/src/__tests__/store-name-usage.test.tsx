import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

// The name comes from the config module: give it a value that is not the
// default, and check that the starter's "Medusa Store" places show it. The
// config module itself is tested in store-config.test.ts.
vi.mock("@lib/store-config", () => ({
  STORE_NAME: "Test Club Kits",
  DEFAULT_STORE_NAME: "FitMyOutfit",
}))

vi.mock("styles/globals.css", () => ({}))
// next/font only works inside the Next.js compiler
vi.mock("@lib/fonts", () => ({ fontVariables: "", fontFaceStyle: {} }))
vi.mock("@lib/config", ()=> ({ sdk: { client: { fetch: vi.fn() } } }))
vi.mock("@lib/data/categories", () => ({ listCategories: async () => [] }))
vi.mock("@lib/data/collections", () => ({
  listCollections: async () => ({ collections: [], count: 0 }),
  getGarmentsCollection: async () => undefined,
}))
vi.mock("@lib/data/regions", () => ({ getRegion: async () => null }))
vi.mock("@modules/common/components/localized-client-link", () => ({
  default: ({ children, href, ...rest }: any) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))

import CheckoutLayout from "../app/[countryCode]/(checkout)/layout"
import { metadata as homeMetadata } from "../app/[countryCode]/(main)/page"
import { metadata as rootMetadata } from "../app/layout"
import Footer from "@modules/layout/templates/footer"

describe("store name appears where the starter said Medusa Store", () => {
  it("checkout header", () => {
    render(<CheckoutLayout>content</CheckoutLayout>)

    expect(screen.getByTestId("store-link")).toHaveTextContent("Test Club Kits")
    expect(screen.queryByText("Medusa Store")).not.toBeInTheDocument()
  })

  it("footer name and copyright line", async () => {
    render(await Footer())

    expect(screen.getAllByText("Test Club Kits").length).toBeGreaterThan(0)
    expect(
      screen.getByText(/Test Club Kits\. All rights reserved\./)
    ).toBeInTheDocument()
    expect(screen.queryByText(/Medusa Store/)).not.toBeInTheDocument()
  })

  it("home page title and Open Graph site name", () => {
    expect(homeMetadata.title).toBe("Test Club Kits")
    expect(rootMetadata.openGraph?.siteName).toBe("Test Club Kits")
    expect(rootMetadata.applicationName).toBe("Test Club Kits")
  })
})
