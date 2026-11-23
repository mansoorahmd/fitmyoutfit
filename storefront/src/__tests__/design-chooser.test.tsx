import { fireEvent, render, screen, within } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const state = vi.hoisted(() => ({
  region: { id: "reg_pk", currency_code: "pkr" } as unknown,
  products: [] as unknown[],
  collection: { id: "col_garments" } as unknown,
  throws: false,
}))

vi.mock("@lib/data/regions", () => ({ getRegion: async () => state.region }))
vi.mock("@lib/data/collections", () => ({
  getGarmentsCollection: async () => {
    if (state.throws) throw new Error("down")
    return state.collection
  },
}))
vi.mock("@lib/data/products", () => ({ listProducts: async () => ({ response: { products: state.products } }) }))
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND")
  },
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/pk/design",
  useParams: () => ({ countryCode: "pk" }),
}))
vi.mock("next/image", () => ({
  // eslint-disable-next-line @next/next/no-img-element
  default: ({ src, alt }: { src: string; alt: string }) => <img src={src} alt={alt} />,
}))
vi.mock("@lib/store-config", () => ({ STORE_NAME: "FitMyOutfit" }))

import DesignChooserPage from "../app/[countryCode]/(main)/design/page"

const product = (handle: string, title: string, price = "PKR 3,500") => ({
  id: `prod_${handle}`,
  handle,
  title,
  thumbnail: `${handle}.png`,
  images: [],
  metadata: { kind: "garment" },
  variants: [{ id: "v1", calculated_price: { calculated_amount: 3500, currency_code: "pkr", calculated_price: price } }],
})

const open = async () => render(await DesignChooserPage({ params: Promise.resolve({ countryCode: "pk" }) }))

describe("the garment chooser (/design)", () => {
  beforeEach(() => {
    state.region = { id: "reg_pk", currency_code: "pkr" }
    state.collection = { id: "col_garments" }
    state.throws = false
    state.products = [product("jacket", "Jacket"), product("t-shirt", "T-shirt"), product("jersey", "Jersey")]
    window.localStorage.clear()
  })

  it("shows one card per garment, in the garments' order: the jersey's two necks, then the T-shirt", async () => {
    await open()
    expect(screen.getByRole("heading", { level: 1, name: "Design your kit" })).toBeInTheDocument()
    const list = screen.getByTestId("design-chooser-list")
    const cards = within(list).getAllByTestId("product-wrapper")
    expect(cards).toHaveLength(3)
    expect(cards.map((c) => c.getAttribute("href"))).toEqual([
      "/pk/design/jersey?garment=match-jersey-vneck",
      "/pk/design/jersey?garment=match-jersey-round",
      "/pk/design/t-shirt",
    ])
    expect(cards.map((c) => within(c).getByTestId("product-title").textContent)).toEqual(["Jersey, V-neck", "Jersey, round neck", "T-shirt"])
    // the product's from-price on each, and the action line
    for (const card of cards) {
      expect(within(card).getByTestId("product-card-price")).toHaveTextContent("from PKR 3,500 per piece")
      expect(within(card).getByTestId("design-card-action")).toHaveTextContent("Design this kit")
    }
    // no jacket: it has no model
    expect(within(list).queryByText("Jacket")).not.toBeInTheDocument()
  })

  it("each card shows our own front picture of its garment", async () => {
    await open()
    const cards = within(screen.getByTestId("design-chooser-list")).getAllByTestId("product-wrapper")
    expect(cards.map((c) => within(c).getByTestId("product-card-image").querySelector("img")?.getAttribute("src"))).toEqual([
      "/api/editor-assets/pictures/products/jersey-vneck-front.webp",
      "/api/editor-assets/pictures/products/jersey-round-front.webp",
      "/api/editor-assets/pictures/products/tshirt-front.webp",
    ])
    // our pictures have no hover swap to the product's other photos
    expect(screen.queryByTestId("product-card-hover-image")).not.toBeInTheDocument()
  })

  it("still shows both jersey cards when only the jersey is in the store, and says more are coming", async () => {
    state.products = [product("jersey", "Jersey")]
    await open()
    expect(within(screen.getByTestId("design-chooser-list")).getAllByTestId("product-wrapper")).toHaveLength(2)
    expect(screen.getByTestId("design-chooser-more")).toHaveTextContent("More garments are coming.")
  })

  it("empty state when no garment has a model, with a way on", async () => {
    state.products = [product("jacket", "Jacket")]
    await open()
    const empty = screen.getByTestId("design-chooser-empty")
    expect(empty).toHaveTextContent("No garments to design here yet")
    expect(within(empty).getByRole("link", { name: "See the products" })).toHaveAttribute("href", "/pk/store")
    expect(screen.queryByTestId("design-chooser-list")).not.toBeInTheDocument()
  })

  it("empty state when the store has no garments collection yet", async () => {
    state.collection = null
    await open()
    expect(screen.getByTestId("design-chooser-empty")).toBeInTheDocument()
  })

  it("says so, with a way to try again, when the store does not answer", async () => {
    state.throws = true
    await open()
    const failed = screen.getByTestId("design-chooser-failed")
    expect(failed).toHaveAttribute("role", "alert")
    expect(within(failed).getByRole("link", { name: "Try again" })).toHaveAttribute("href", "/pk/design")
  })

  it("is not found for a region the store does not have", async () => {
    state.region = null
    await expect(open()).rejects.toThrow("NEXT_NOT_FOUND")
  })

  it("a card offers to continue only when this device holds a saved design for that garment", async () => {
    // the round neck's design, not the V-neck's, and not the T-shirt's
    window.localStorage.setItem("fmo:saved-design:garment:match-jersey-round", "1")
    window.localStorage.setItem("fmo:saved-design:jersey", "1")
    await open()
    const actions = await screen.findAllByTestId("design-card-action")
    expect(actions.map((a) => a.textContent)).toEqual(["Design this kit", "Continue your design", "Design this kit"])
  })
})
