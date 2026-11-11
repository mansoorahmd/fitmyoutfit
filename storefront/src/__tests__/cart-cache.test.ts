import { beforeEach, describe, expect, it, vi } from "vitest"

// --- A fake backend behind a fake of the Next.js data cache ---------------
//
// Next.js keeps a `cache: "force-cache"` response under a key made from the
// URL and the request (not the tags), and serves it until a tag is
// revalidated: one stored with the entry, or one the current fetch carries.
// The fake does the same, so a change to the cart that forgets a tag leaves
// a stale answer behind, as QA saw: after a switch from the UAE to Pakistan
// the cart kept the UAE's duty-paid line (task S1-3b, D1).

type Opts = {
  cache?: string
  next?: { tags?: string[] }
  query?: Record<string, unknown>
}

const { backend, nextCache, revalidatedAt, clock } = vi.hoisted(() => ({
  backend: {
    cart: { id: "cart_1", region_id: "reg_ae", items: [] as unknown[] },
    shippingMethodOptionId: null as string | null,
    hits: 0,
  },
  nextCache: new Map<string, { value: unknown; tags: string[]; storedAt: number }>(),
  revalidatedAt: new Map<string, number>(),
  clock: { now: 0 },
}))

const OPTIONS: Record<string, unknown[]> = {
  reg_ae: [{ id: "so_ae", name: "Shipping & duties included", amount: 0, data: { ddp: true } }],
  reg_gb: [{ id: "so_gb", name: "Shipping & duties included", amount: 0, data: { ddp: true } }],
  reg_pk: [{ id: "so_pk", name: "Delivery in Pakistan", amount: 250, data: {} }],
}

const answer = (path: string): unknown => {
  if (path === "/store/shipping-options") {
    return { shipping_options: OPTIONS[backend.cart.region_id] ?? [] }
  }
  if (path === "/store/carts/cart_1") {
    return { cart: { ...backend.cart } }
  }
  throw new Error(`unexpected ${path}`)
}

vi.mock("@lib/config", () => ({
  sdk: {
    client: {
      fetch: async (path: string, opts: Opts = {}) => {
        const key = path + JSON.stringify(opts.query ?? {})
        const tags = opts.next?.tags ?? []
        if (opts.cache === "force-cache") {
          const hit = nextCache.get(key)
          const stale =
            !!hit &&
            [...hit.tags, ...tags].some((tag) => (revalidatedAt.get(tag) ?? -1) >= hit.storedAt)
          if (hit && !stale) return structuredClone(hit.value)
        }
        backend.hits += 1
        const value = answer(path)
        if (opts.cache === "force-cache") {
          nextCache.set(key, { value: structuredClone(value), tags, storedAt: ++clock.now })
        }
        return value
      },
    },
    store: {
      cart: {
        create: async () => ({ cart: { ...backend.cart } }),
        update: async (_id: string, body: { region_id?: string }) => {
          if (body.region_id) backend.cart.region_id = body.region_id
          return { cart: { ...backend.cart } }
        },
        createLineItem: async () => ({ cart: { ...backend.cart } }),
        updateLineItem: async () => ({ cart: { ...backend.cart } }),
        deleteLineItem: async () => ({ parent: { ...backend.cart } }),
        addShippingMethod: async (_id: string, body: { option_id: string }) => {
          backend.shippingMethodOptionId = body.option_id
          return { cart: { ...backend.cart } }
        },
      },
    },
  },
}))

vi.mock("@lib/data/cookies", () => ({
  getAuthHeaders: async () => ({}),
  getCacheTag: async (tag: string) => `${tag}-visitor`,
  getCacheOptions: async (tag: string) => ({ tags: [`${tag}-visitor`] }),
  getCartId: async () => "cart_1",
  setCartId: async () => {},
  removeCartId: async () => {},
}))

vi.mock("next/cache", () => ({
  revalidateTag: (tag: string) => {
    revalidatedAt.set(tag, clock.now)
  },
}))
vi.mock("next/navigation", () => ({ redirect: () => {} }))
vi.mock("@lib/data/regions", () => ({
  getRegion: async (countryCode: string) => ({ id: `reg_${countryCode}` }),
}))
vi.mock("@lib/data/locale-actions", () => ({ getLocale: async () => null }))
vi.mock("@lib/data/checkout-rules", () => ({ getCheckoutRules: async () => null }))

import {
  addToCart,
  addToCartAndConfirm,
  deleteLineItem,
  getOrSetCart,
  listCartOptions,
  retrieveCart,
  retrieveCartForPage,
  setShippingMethod,
  updateCart,
  updateLineItem,
  updateRegion,
} from "@lib/data/cart"
import { listCartShippingMethods } from "@lib/data/fulfillment"

const optionNames = async () =>
  (await listCartOptions()).shipping_options.map((o) => o.name)

const reset = () => {
  backend.cart = { id: "cart_1", region_id: "reg_ae", items: [] }
  backend.shippingMethodOptionId = null
  backend.hits = 0
  nextCache.clear()
  revalidatedAt.clear()
}

beforeEach(reset)

describe("the cart's cached reads after a region switch", () => {
  it("shows Pakistan's delivery line straight after switching from the UAE", async () => {
    expect(await optionNames()).toEqual(["Shipping & duties included"])

    await updateRegion("pk", "/cart")

    expect(await optionNames()).toEqual(["Delivery in Pakistan"])
  })

  it("shows the UK's duty-paid line straight after switching from Pakistan", async () => {
    backend.cart.region_id = "reg_pk"
    expect(await optionNames()).toEqual(["Delivery in Pakistan"])

    await updateRegion("gb", "/cart")

    expect(await optionNames()).toEqual(["Shipping & duties included"])
  })

  it("follows the region when a product page in another region moves the cart there", async () => {
    expect(await optionNames()).toEqual(["Shipping & duties included"])

    await getOrSetCart("pk")

    expect(await optionNames()).toEqual(["Delivery in Pakistan"])
  })
})

describe("every change to the cart makes every cached read of it ask the backend again", () => {
  const reads: [string, () => Promise<unknown>][] = [
    ["the header's cart", () => retrieveCart()],
    ["the cart page's cart", () => retrieveCartForPage()],
    ["the cart page's shipping options", () => listCartOptions()],
    ["the checkout's shipping options", () => listCartShippingMethods("cart_1")],
  ]
  const changes: [string, () => Promise<unknown>][] = [
    ["updateCart", () => updateCart({ email: "a@b.c" })],
    ["updateRegion", () => updateRegion("pk", "/cart")],
    ["getOrSetCart (region change)", () => getOrSetCart("gb")],
    ["addToCart", () => addToCart({ variantId: "var_M", quantity: 1, countryCode: "ae" })],
    [
      "addToCartAndConfirm",
      () => addToCartAndConfirm({ variantId: "var_M", quantity: 1, countryCode: "ae" }),
    ],
    ["updateLineItem", () => updateLineItem({ lineId: "cali_1", quantity: 2 })],
    ["deleteLineItem", () => deleteLineItem("cali_1")],
    ["setShippingMethod", () => setShippingMethod({ cartId: "cart_1", shippingMethodId: "so_ae" })],
  ]

  it.each(changes)("%s", async (_name, change) => {
    for (const [readName, read] of reads) {
      reset()
      for (const [, warm] of reads) await warm()
      // all cached now: a read doesn't reach the backend
      backend.hits = 0
      await read()
      expect(backend.hits, `${readName} is cached`).toBe(0)

      await change()

      backend.hits = 0
      await read()
      expect(backend.hits, `${readName} after the change`).toBe(1)
    }
  })
})
