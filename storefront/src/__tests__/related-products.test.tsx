import { render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const { listProductsMock } = vi.hoisted(() => ({ listProductsMock: vi.fn() }))

vi.mock("@lib/data/products", () => ({ listProducts: listProductsMock }))

vi.mock("@lib/data/regions", () => ({
  getRegion: async () => ({ id: "reg_pk", currency_code: "pkr" }),
}))

vi.mock("@modules/products/components/product-preview", () => ({
  default: ({ product }: { product: { title: string } }) => (
    <span data-testid="card">{product.title}</span>
  ),
}))

import RelatedProducts from "@modules/products/components/related-products"

const tee = { id: "prod_tee", title: "T-Shirt" }
const jersey = { id: "prod_jersey", title: "Jersey" }
const fitKit = { id: "prod_fit_kit", title: "Fit Kit" }
const rush = { id: "prod_rush", title: "Rush Production" }

beforeEach(() => {
  listProductsMock.mockReset()
  // Whatever the query, the backend would return every product.
  listProductsMock.mockResolvedValue({
    response: { products: [jersey, tee, fitKit, rush], count: 4 },
  })
})

describe("related products", () => {
  it("shows nothing for a product with no collection and no tags", async () => {
    const element = await RelatedProducts({
      product: { ...fitKit, collection_id: null, tags: [] } as any,
      countryCode: "pk",
    })

    expect(element).toBeNull()
    expect(listProductsMock).not.toHaveBeenCalled()
  })

  it("shows nothing when tags are missing altogether", async () => {
    const element = await RelatedProducts({
      product: { ...rush, collection_id: null } as any,
      countryCode: "pk",
    })

    expect(element).toBeNull()
  })

  it("relates a garment by its collection and leaves the garment itself out", async () => {
    render(
      (await RelatedProducts({
        product: { ...jersey, collection_id: "col_garments", tags: [] } as any,
        countryCode: "pk",
      }))!
    )

    const call = listProductsMock.mock.calls[0][0]
    expect(call.queryParams.collection_id).toEqual(["col_garments"])
    expect(
      screen.getByRole("heading", { level: 2, name: "Complete the kit" })
    ).toBeInTheDocument()
    expect(screen.queryByText("Related products")).not.toBeInTheDocument()
    expect(
      screen.queryByText(/You might also want to check out these products/)
    ).not.toBeInTheDocument()
    expect(screen.getAllByTestId("card").map((c) => c.textContent)).toEqual([
      "T-Shirt",
      "Fit Kit",
      "Rush Production",
    ])
  })

  it("lays the cards out in the product grid, one column on phones for up to 3", async () => {
    render(
      (await RelatedProducts({
        product: { ...jersey, collection_id: "col_garments", tags: [] } as any,
        countryCode: "pk",
      }))!
    )

    const grid = screen.getAllByTestId("card")[0].closest("ul")!
    expect(grid.className.split(/\s+/)).toEqual(
      expect.arrayContaining(["grid-cols-1", "md:grid-cols-3", "gap-4"])
    )
    expect(grid.className).not.toMatch(/(small|medium):/)
  })
})
