import { describe, expect, it } from "vitest"

import { compareStoreOrder, sortProducts } from "./sort-products"

type P = Parameters<typeof sortProducts>[0][number]
const make = (id: string, created_at?: string): P => ({ id, title: id, created_at }) as unknown as P

describe("the store's own product order (the default)", () => {
  // what the seed makes: one run, one created_at, ids that sort in the seed's list order (jersey, T-shirt, jacket)
  const jersey = make("prod_01A", "2026-11-20T10:00:00.000Z")
  const tshirt = make("prod_01B", "2026-11-20T10:00:00.000Z")
  const jacket = make("prod_01C", "2026-11-20T10:00:00.000Z")

  it("is the id ascending, whatever order the database returned the rows in", () => {
    for (const rows of [
      [jacket, tshirt, jersey],
      [tshirt, jersey, jacket],
      [jersey, jacket, tshirt],
    ]) {
      expect(sortProducts([...rows], "store_order").map((p) => p.id)).toEqual(["prod_01A", "prod_01B", "prod_01C"])
    }
  })

  it("does not follow the date: a product dated later does not move", () => {
    const later = make("prod_01A", "2026-12-01T00:00:00.000Z")
    expect(sortProducts([jacket, tshirt, later], "store_order").map((p) => p.id)).toEqual(["prod_01A", "prod_01B", "prod_01C"])
  })

  it("compares two products by id", () => {
    expect(compareStoreOrder({ id: "a" }, { id: "b" })).toBeLessThan(0)
    expect(compareStoreOrder({ id: "b" }, { id: "a" })).toBeGreaterThan(0)
    expect(compareStoreOrder({ id: "a" }, { id: "a" })).toBe(0)
  })

  it("'Latest Arrivals' stays the newest first", () => {
    const old = make("prod_01A", "2026-01-01T00:00:00.000Z")
    const fresh = make("prod_01B", "2026-06-01T00:00:00.000Z")
    expect(sortProducts([old, fresh], "created_at").map((p) => p.id)).toEqual(["prod_01B", "prod_01A"])
  })
})
