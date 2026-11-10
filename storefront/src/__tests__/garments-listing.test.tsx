import { render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

// --- Mocks: no test here needs a backend --------------------------------

const { fetchMock } = vi.hoisted(() => ({ fetchMock: vi.fn() }))

vi.mock("@lib/config", () => ({ sdk: { client: { fetch: fetchMock } } }))

vi.mock("@lib/data/cookies", () => ({
  getAuthHeaders: async () => ({}),
  getCacheOptions: async () => ({}),
}))

const region = {
  id: "reg_pk",
  currency_code: "pkr",
  countries: [{ iso_2: "pk" }],
}

vi.mock("@lib/data/regions", () => ({
  getRegion: async () => region,
  retrieveRegion: async () => region,
}))

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/pk/store",
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({ countryCode: "pk" }),
}))

// Product cards are covered in product-preview.test.tsx.
vi.mock("@modules/products/components/product-preview", () => ({
  default: ({ product }: { product: { title: string } }) => (
    <span data-testid="card">{product.title}</span>
  ),
}))

import StorePage from "../app/[countryCode]/(main)/store/page"
import Home from "../app/[countryCode]/(main)/page"
import { getGarmentsCollection } from "@lib/data/collections"
import { GARMENTS_COLLECTION_HANDLE } from "@lib/garments"
import ProductRail from "@modules/home/components/featured-products/product-rail"
import StoreTemplate from "@modules/store/templates"
import PaginatedProducts from "@modules/store/templates/paginated-products"

const garments = { id: "col_garments", handle: "garments", title: "Garments" }

const jersey = {
  id: "prod_jersey",
  title: "Jersey",
  handle: "jersey",
  created_at: "2026-11-10T00:00:00Z",
}

/** Pretend to be the store API: `collections` for the lookup, `products` for the list. */
function mockStoreApi({ collections }: { collections: unknown[] }) {
  fetchMock.mockImplementation(async (path: string) => {
    if (path === "/store/collections") return { collections }
    if (path === "/store/products") return { products: [jersey], count: 1 }
    throw new Error(`Unexpected call to ${path}`)
  })
}

const productCalls = () =>
  fetchMock.mock.calls.filter(([path]) => path === "/store/products")

beforeEach(() => {
  fetchMock.mockReset()
})

describe("garments collection lookup", () => {
  it("asks the backend for the collection with handle `garments`", async () => {
    mockStoreApi({ collections: [garments] })

    const found = await getGarmentsCollection()

    expect(GARMENTS_COLLECTION_HANDLE).toBe("garments")
    expect(found).toEqual(garments)
    expect(fetchMock).toHaveBeenCalledWith(
      "/store/collections",
      expect.objectContaining({
        query: expect.objectContaining({ handle: "garments" }),
      })
    )
  })

  it("returns undefined, not an error, when the collection is missing", async () => {
    mockStoreApi({ collections: [] })

    await expect(getGarmentsCollection()).resolves.toBeUndefined()
  })
})

describe("listing queries are restricted to the garments collection", () => {
  it("store listing filters by collection on the server", async () => {
    mockStoreApi({ collections: [garments] })

    await PaginatedProducts({
      page: 1,
      countryCode: "pk",
      collectionId: garments.id,
    })

    const calls = productCalls()
    expect(calls).toHaveLength(1)
    expect(calls[0][1].query.collection_id).toEqual([garments.id])
    expect(calls[0][1].query.region_id).toBe(region.id)
  })

  it("home page rail filters by collection on the server", async () => {
    mockStoreApi({ collections: [garments] })

    await ProductRail({ collection: garments as any, region: region as any })

    const calls = productCalls()
    expect(calls).toHaveLength(1)
    expect(calls[0][1].query.collection_id).toBe(garments.id)
  })

  it("store page passes the garments collection id to the listing", async () => {
    mockStoreApi({ collections: [garments] })

    const element = await StorePage({
      params: Promise.resolve({ countryCode: "pk" }),
      searchParams: Promise.resolve({}),
    })

    expect((element as any).props.collectionId).toBe(garments.id)
  })

  it("lists the products the backend returns", async () => {
    mockStoreApi({ collections: [garments] })

    render(
      await PaginatedProducts({
        page: 1,
        countryCode: "pk",
        collectionId: garments.id,
      })
    )

    expect(screen.getByTestId("card")).toHaveTextContent("Jersey")
  })
})

describe("empty state when the garments collection is missing", () => {
  it("home page renders an empty state and fetches no products", async () => {
    mockStoreApi({ collections: [] })

    render(await Home({ params: Promise.resolve({ countryCode: "pk" }) }))

    expect(screen.getByTestId("empty-products")).toBeInTheDocument()
    expect(productCalls()).toHaveLength(0)
  })

  it("store page renders an empty state and fetches no products", async () => {
    mockStoreApi({ collections: [] })

    const element = await StorePage({
      params: Promise.resolve({ countryCode: "pk" }),
      searchParams: Promise.resolve({}),
    })
    render(element)

    expect(screen.getByTestId("empty-products")).toBeInTheDocument()
    expect(screen.queryByTestId("products-list")).not.toBeInTheDocument()
    expect(productCalls()).toHaveLength(0)
  })

  it("store template without a collection id lists nothing", () => {
    render(<StoreTemplate countryCode="pk" />)

    expect(screen.getByTestId("empty-products")).toBeInTheDocument()
  })

  it("store listing shows the empty state when the collection has no products", async () => {
    fetchMock.mockImplementation(async () => ({ products: [], count: 0 }))

    render(
      await PaginatedProducts({
        page: 1,
        countryCode: "pk",
        collectionId: garments.id,
      })
    )

    expect(screen.getByTestId("empty-products")).toBeInTheDocument()
  })
})
