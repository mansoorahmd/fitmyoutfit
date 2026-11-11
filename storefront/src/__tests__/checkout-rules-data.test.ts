import { beforeEach, describe, expect, it, vi } from "vitest"

import { rulesFixture } from "./fixtures/m1"

// A plain stand-in for the SDK's fetch, recording its calls.
const { backend } = vi.hoisted(() => ({
  backend: {
    calls: [] as unknown[][],
    answer: (() => Promise.resolve(null)) as () => Promise<unknown>,
  },
}))

vi.mock("@lib/config", () => ({
  sdk: {
    client: {
      fetch: (...args: unknown[]) => {
        backend.calls.push(args)
        return backend.answer()
      },
    },
  },
}))
vi.mock("@lib/data/cookies", () => ({
  getAuthHeaders: async () => ({}),
  getCacheOptions: async () => ({}),
  getCartId: async () => "cart_1",
}))

import { getCheckoutRules } from "@lib/data/checkout-rules"

const answerWith = (value: unknown) => {
  backend.answer = () => Promise.resolve(value)
}
const failWith = (status: number | null) => {
  backend.answer = () =>
    Promise.reject(
      status === null
        ? new TypeError("fetch failed")
        : Object.assign(new Error(`status ${status}`), { status })
    )
}

beforeEach(() => {
  backend.calls = []
  answerWith(null)
})

describe("getCheckoutRules", () => {
  it("reads GET /store/carts/:id/checkout-rules, never cached", async () => {
    answerWith(rulesFixture())

    const rules = await getCheckoutRules("cart_1")

    expect(backend.calls[0][0]).toBe("/store/carts/cart_1/checkout-rules")
    expect(backend.calls[0][1]).toMatchObject({ method: "GET", cache: "no-store" })
    expect(rules?.minimum_quantity).toEqual({ required: 10, counted: 4, ok: false })
    expect(rules?.delivery_promise?.standard.date).toBe("2026-11-26")
  })

  it("is null when the route is missing (404), so the cart leaves the pieces out", async () => {
    failWith(404)
    expect(await getCheckoutRules("cart_1")).toBeNull()
  })

  it("is null when the backend fails or can't be reached", async () => {
    failWith(500)
    expect(await getCheckoutRules("cart_1")).toBeNull()
    failWith(null)
    expect(await getCheckoutRules("cart_1")).toBeNull()
  })

  it("is null for an answer it can't read, and asks nothing without a cart", async () => {
    answerWith("<html>")
    expect(await getCheckoutRules("cart_1")).toBeNull()
    expect(await getCheckoutRules(null)).toBeNull()
    expect(backend.calls).toHaveLength(1)
  })
})
