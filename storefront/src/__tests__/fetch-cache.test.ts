import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// --- A fake backend behind a fake of the Next.js fetch cache ---------------
//
// Next.js persists a response when the fetch is `cache: "force-cache"` or has
// `next.revalidate`, and serves it on the next request. With `force-cache` and
// no `revalidate` it keeps it forever (it survives a dev-server restart). With
// `cache: "no-store"` it always asks the backend. The fake below does the
// same, so these tests fail on the old "force-cache, no revalidate" calls.

type Opts = {
  cache?: string
  next?: { revalidate?: number | false; tags?: string[] }
  query?: Record<string, unknown>
}

const { backend, nextCache, fetchMock } = vi.hoisted(() => {
  const backend = {
    collections: [] as unknown[],
    products: [] as unknown[],
  }
  const nextCache = new Map<string, { value: unknown; expires: number }>()

  const fetchMock = vi.fn(async (path: string, opts: Opts = {}) => {
    const key = path + JSON.stringify(opts.query ?? {})
    const revalidate = opts.next?.revalidate
    const cacheable =
      opts.cache !== "no-store" &&
      (opts.cache === "force-cache" || typeof revalidate === "number")

    if (cacheable) {
      const hit = nextCache.get(key)
      if (hit && hit.expires > Date.now()) return hit.value
    }

    const value =
      path === "/store/collections"
        ? { collections: backend.collections }
        : { products: backend.products, count: backend.products.length }

    if (cacheable) {
      const expires =
        typeof revalidate === "number"
          ? Date.now() + revalidate * 1000
          : Infinity
      nextCache.set(key, { value, expires })
    }
    return value
  })

  return { backend, nextCache, fetchMock }
})

vi.mock("@lib/config", () => ({ sdk: { client: { fetch: fetchMock } } }))

vi.mock("@lib/data/cookies", () => ({
  getAuthHeaders: async () => ({}),
  getCacheOptions: async () => ({ tags: ["collections-test"] }),
}))

vi.mock("@lib/data/regions", () => ({
  getRegion: async () => ({ id: "reg_pk", currency_code: "pkr" }),
  retrieveRegion: async () => ({ id: "reg_pk", currency_code: "pkr" }),
}))

import {
  getCollectionByHandle,
  getGarmentsCollection,
} from "@lib/data/collections"
import { listProducts } from "@lib/data/products"

const oldGarments = { id: "col_old", handle: "garments", title: "Garments" }
const newGarments = { id: "col_new", handle: "garments", title: "Garments" }
const jersey = { id: "prod_jersey", title: "Jersey", handle: "jersey" }

beforeEach(() => {
  vi.useFakeTimers()
  backend.collections = []
  backend.products = []
  nextCache.clear()
  fetchMock.mockClear()
})

afterEach(() => {
  vi.useRealTimers()
})

describe("garments collection lookup is not stuck by the cache", () => {
  it("finds the collection on the second lookup after an empty first lookup", async () => {
    // Backend not seeded yet.
    expect(await getGarmentsCollection()).toBeUndefined()

    // The seed runs. The very next lookup must see it.
    backend.collections = [oldGarments]
    expect(await getGarmentsCollection()).toEqual(oldGarments)
  })

  it("picks up a new collection id after a reseed within about a minute", async () => {
    backend.collections = [oldGarments]
    expect(await getGarmentsCollection()).toEqual(oldGarments)

    // Database wiped and reseeded: same handle, new id.
    backend.collections = [newGarments]
    vi.advanceTimersByTime(61_000)

    expect(await getGarmentsCollection()).toEqual(newGarments)
  })

  it("does not keep a found collection for longer than a minute", async () => {
    backend.collections = [oldGarments]
    await getGarmentsCollection()

    for (const [, opts] of fetchMock.mock.calls as [string, Opts][]) {
      expect(opts.cache).not.toBe("force-cache")
      if (opts.cache !== "no-store") {
        expect(opts.next?.revalidate).toBeGreaterThan(0)
        expect(opts.next?.revalidate as number).toBeLessThanOrEqual(60)
      }
    }
  })

  it("collection page lookup by handle is not stuck on an empty answer either", async () => {
    expect(await getCollectionByHandle("garments")).toBeUndefined()

    backend.collections = [oldGarments]
    expect(await getCollectionByHandle("garments")).toEqual(oldGarments)
  })
})

describe("product listing by collection id is not stuck by the cache", () => {
  const list = (collectionId: string) =>
    listProducts({
      countryCode: "pk",
      queryParams: { collection_id: collectionId },
    }).then(({ response }) => response.products)

  it("returns products on the second call after an empty first call", async () => {
    expect(await list("col_new")).toEqual([])

    backend.products = [jersey]
    expect(await list("col_new")).toEqual([jersey])
  })

  it("does not keep a product list for longer than a minute", async () => {
    backend.products = [jersey]
    expect(await list("col_new")).toEqual([jersey])

    backend.products = [jersey, { ...jersey, id: "prod_tee" }]
    vi.advanceTimersByTime(61_000)

    expect(await list("col_new")).toHaveLength(2)
  })
})
