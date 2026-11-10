import { render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const { listProductsWithSort } = vi.hoisted(() => ({
  listProductsWithSort: vi.fn(),
}))

vi.mock("@lib/data/products", () => ({ listProductsWithSort }))
vi.mock("@lib/data/regions", () => ({
  getRegion: async () => ({ id: "reg_pk", currency_code: "pkr" }),
}))
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/pk/store",
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({ countryCode: "pk" }),
}))
vi.mock("@modules/products/components/product-preview", () => ({
  default: ({
    product,
    headingLevel,
  }: {
    product: { title: string }
    headingLevel?: number
  }) => (
    <span data-testid="card" data-heading-level={headingLevel}>
      {product.title}
    </span>
  ),
}))

import StoreTemplate from "@modules/store/templates"
import PaginatedProducts from "@modules/store/templates/paginated-products"

const products = (count: number) =>
  Array.from({ length: count }, (_, i) => ({
    id: `prod_${i}`,
    title: `Garment ${i}`,
    // older products first, so the default order (newest first) reverses them
    created_at: new Date(Date.UTC(2026, 0, i + 1)).toISOString(),
  }))

const listing = (count: number) => {
  listProductsWithSort.mockResolvedValue({
    response: { products: products(count), count },
    nextPage: null,
  })
}

const renderGrid = async (sortBy?: "price_asc" | "created_at") =>
  render(
    (await PaginatedProducts({
      page: 1,
      countryCode: "pk",
      collectionId: "col_garments",
      sortBy,
    }))!
  )

beforeEach(() => {
  listProductsWithSort.mockReset()
})

describe("listing page", () => {
  it("is titled Team kit, as the page's only h1", () => {
    render(<StoreTemplate countryCode="pk" />)

    const h1s = screen.getAllByRole("heading", { level: 1 })
    expect(h1s.map((h) => h.textContent)).toEqual(["Team kit"])
    expect(screen.queryByText("All products")).not.toBeInTheDocument()
  })

  it("says shipping and duties are included in export regions only", () => {
    const { unmount } = render(<StoreTemplate countryCode="pk" />)
    expect(screen.queryByTestId("store-export-note")).not.toBeInTheDocument()
    unmount()

    render(<StoreTemplate countryCode="gb" />)
    expect(screen.getByTestId("store-export-note")).toHaveTextContent(
      "Shipping and duties included"
    )
  })

  it("shows the empty state's wording when there is nothing to list", () => {
    render(<StoreTemplate countryCode="pk" />)

    expect(screen.getByTestId("empty-products")).toHaveTextContent(
      "No garments in this region yet"
    )
    expect(
      screen.getByRole("link", { name: "Go to the home page" }).getAttribute("href")
    ).toMatch(/^\/pk\/?$/)
  })
})

describe("listing grid and Sort by", () => {
  it("has no Sort by with the three garments, and one column on phones", async () => {
    listing(3)
    await renderGrid()

    expect(screen.queryByTestId("store-sort")).not.toBeInTheDocument()
    expect(screen.queryByText("Sort by")).not.toBeInTheDocument()
    const grid = screen.getByTestId("products-list")
    expect(grid.className.split(/\s+/)).toEqual(
      expect.arrayContaining(["grid-cols-1", "md:grid-cols-3", "xl:grid-cols-3"])
    )
  })

  it("still has no Sort by at 8 products, with two columns on phones", async () => {
    listing(8)
    await renderGrid()

    expect(screen.queryByText("Sort by")).not.toBeInTheDocument()
    expect(screen.getByTestId("products-list").className).toContain("grid-cols-2")
  })

  it("brings Sort by back above 8 products", async () => {
    listing(9)
    await renderGrid()

    expect(screen.getByTestId("store-sort")).toBeInTheDocument()
    expect(screen.getByText("Sort by")).toBeInTheDocument()
    expect(screen.getByTestId("products-list").className).toContain("xl:grid-cols-4")
  })

  it("ignores a sortBy left in the URL while Sort by is hidden", async () => {
    listing(3)
    await renderGrid("price_asc")

    expect(screen.getAllByTestId("card").map((c) => c.textContent)).toEqual([
      "Garment 2",
      "Garment 1",
      "Garment 0",
    ])
  })

  it("names the cards with h2, the level under the page's h1", async () => {
    listing(3)
    await renderGrid()

    for (const card of screen.getAllByTestId("card")) {
      expect(card).toHaveAttribute("data-heading-level", "2")
    }
  })
})
