import { beforeEach, describe, expect, it, vi } from "vitest"

import { CART_CACHE_TAGS } from "@lib/util/cart-cache"
import { RUSH_SAVE_SERVER_MS } from "@lib/util/rush"

import { completedPk } from "./fixtures/m1-checkout"
import { checkoutCartPkRush, noSessionAfterPriceChange } from "./fixtures/rush"

// The rush option's server actions and "Place order" against a fake
// backend behind the SDK. Failures are thrown like the SDK's FetchError:
// an Error with the backend's message and the HTTP status.

type Call = { path: string; method: string; query?: unknown; signal?: boolean }

const { state } = vi.hoisted(() => ({
  state: {
    calls: [] as Call[],
    revalidated: [] as string[],
    cartId: "cart_1" as string | null,
    cart: null as any,
    rush: [] as (() => unknown)[],
    complete: [] as (() => unknown)[],
    cartReads: [] as (() => unknown)[],
  },
}))

const fail = (status: number, message = "failed") => {
  throw Object.assign(new Error(message), { status })
}

vi.mock("@lib/config", () => ({
  sdk: {
    client: {
      fetch: async (path: string, init: { method?: string; query?: unknown; signal?: unknown } = {}) => {
        const method = init.method ?? "GET"
        state.calls.push({ path, method, query: init.query, ...(init.signal ? { signal: true } : {}) })
        if (path.endsWith("/rush")) return (state.rush.shift() ?? (() => ({ cart: { id: "cart_1" } })))()
        if (path.endsWith("/complete")) return (state.complete.shift() ?? (() => completedPk))()
        if (path.startsWith("/store/carts/")) return (state.cartReads.shift() ?? (() => ({ cart: state.cart })))()
        throw new Error(`unexpected ${path}`)
      },
    },
    store: {
      payment: {
        initiatePaymentSession: async () => {
          state.calls.push({ path: "session", method: "POST" })
          return { payment_collection: {} }
        },
      },
    },
  },
}))
vi.mock("@lib/data/cookies", () => ({
  getAuthHeaders: async () => ({}),
  getCacheTag: async (tag: string) => `${tag}-visitor`,
  getCacheOptions: async (tag: string) => ({ tags: [`${tag}-visitor`] }),
  getCartId: async () => state.cartId,
  removeCartId: async () => {},
}))
vi.mock("next/cache", () => ({
  revalidateTag: (tag: string) => {
    state.revalidated.push(tag)
  },
}))
vi.mock("next/navigation", () => ({
  RedirectType: { push: "push", replace: "replace" },
  redirect: (url: string) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), { url })
  },
}))
vi.mock("@lib/data/checkout-rules", () => ({ getCheckoutRules: vi.fn(async () => null) }))
vi.mock("@lib/data/regions", () => ({ getRegion: async () => null }))
vi.mock("@lib/data/locale-actions", () => ({ getLocale: async () => null }))

import { retrieveCartForPage } from "@lib/data/cart"
import { placeOrder, retrieveCheckoutCart } from "@lib/data/checkout"
import { chooseRush, dropStaleRush, repriceRush } from "@lib/data/rush"

const rushCalls = () => state.calls.filter((c) => c.path.endsWith("/rush"))
const completions = () => state.calls.filter((c) => c.path.endsWith("/complete"))
const allCartTagsRevalidated = () => CART_CACHE_TAGS.every((t) => state.revalidated.includes(`${t}-visitor`))

const run = async <T,>(action: Promise<T>): Promise<T | { redirectedTo: string }> => {
  try {
    return await action
  } catch (error) {
    const url = (error as { url?: string }).url
    if (url) return { redirectedTo: url }
    throw error
  }
}

beforeEach(() => {
  state.calls = []
  state.revalidated = []
  state.cartId = "cart_1"
  state.cart = checkoutCartPkRush({ id: "cart_1" })
  state.rush = []
  state.complete = []
  state.cartReads = []
})

describe("chooseRush", () => {
  it("Rush: POST on the visitor's cart, nothing in the body, and the cart's reads dropped", async () => {
    expect(await chooseRush(true)).toEqual({ ok: true })
    expect(rushCalls()).toEqual([{ path: "/store/carts/cart_1/rush", method: "POST", query: { fields: "id" }, signal: true }])
    expect(allCartTagsRevalidated()).toBe(true)
  })

  it("Standard: DELETE", async () => {
    await chooseRush(false)
    expect(rushCalls().map((c) => c.method)).toEqual(["DELETE"])
  })

  it("a 409 is sent again once by itself", async () => {
    state.rush = [() => fail(409), () => ({ cart: { id: "cart_1" } })]
    expect(await chooseRush(true)).toEqual({ ok: true })
    expect(rushCalls()).toHaveLength(2)
  })

  it("409 twice: a conflict, nothing changed, the cached reads kept", async () => {
    state.rush = [() => fail(409), () => fail(409)]
    expect(await chooseRush(false)).toEqual({ ok: false, kind: "conflict" })
    expect(rushCalls()).toHaveLength(2)
    expect(state.revalidated).toEqual([])
  })

  it("a refusal (rush no longer offered) and no answer drop the cached reads, so the page reads the truth", async () => {
    state.rush = [() => fail(400, "Rush is not offered")]
    expect(await chooseRush(true)).toEqual({ ok: false, kind: "refused" })
    expect(allCartTagsRevalidated()).toBe(true)
    state.revalidated = []
    state.rush = [() => Promise.reject(new Error("socket hang up"))]
    expect(await chooseRush(true)).toEqual({ ok: false, kind: "no_answer" })
    expect(allCartTagsRevalidated()).toBe(true)
  })

  it("a 500 is said once, never sent again", async () => {
    state.rush = [() => fail(500)]
    expect(await chooseRush(true)).toEqual({ ok: false, kind: "server" })
    expect(rushCalls()).toHaveLength(1)
  })

  it("no cart cookie: the cart has expired, nothing sent", async () => {
    state.cartId = null
    expect(await chooseRush(true)).toEqual({ ok: false, kind: "cart_lost" })
    expect(rushCalls()).toHaveLength(0)
  })

  it("a backend that never answers: no answer once the time limit is up, and the page reads the truth", async () => {
    vi.useFakeTimers()
    try {
      state.rush = [() => new Promise(() => {})]
      let result: unknown = null
      void chooseRush(true).then((r) => (result = r))
      await vi.advanceTimersByTimeAsync(RUSH_SAVE_SERVER_MS - 1)
      expect(result).toBeNull()
      await vi.advanceTimersByTimeAsync(1)
      expect(result).toEqual({ ok: false, kind: "no_answer" })
      expect(rushCalls()).toHaveLength(1)
      expect(allCartTagsRevalidated()).toBe(true)
    } finally {
      vi.useRealTimers()
    }
  })

  it("409, then no answer: both tries share the one time limit", async () => {
    vi.useFakeTimers()
    try {
      state.rush = [() => fail(409), () => new Promise(() => {})]
      let result: unknown = null
      void chooseRush(false).then((r) => (result = r))
      await vi.advanceTimersByTimeAsync(RUSH_SAVE_SERVER_MS)
      expect(result).toEqual({ ok: false, kind: "no_answer" })
      expect(rushCalls()).toHaveLength(2)
    } finally {
      vi.useRealTimers()
    }
  })
})

describe("dropStaleRush", () => {
  it("removes rush from the visitor's own cart only", async () => {
    expect(await dropStaleRush()).toBe(true)
    expect(rushCalls()).toEqual([{ path: "/store/carts/cart_1/rush", method: "DELETE", query: { fields: "id" }, signal: true }])
    state.cartId = null
    expect(await dropStaleRush()).toBe(false)
    expect(rushCalls()).toHaveLength(1)
  })

  it("false when the backend refuses", async () => {
    state.rush = [() => fail(500)]
    expect(await dropStaleRush()).toBe(false)
  })
})

describe("repriceRush", () => {
  it("POSTs rush again on the visitor's own cart (the backend prices the line anew), true on 200", async () => {
    expect(await repriceRush()).toBe(true)
    expect(rushCalls()).toEqual([{ path: "/store/carts/cart_1/rush", method: "POST", query: { fields: "id" }, signal: true }])
    state.cartId = null
    expect(await repriceRush()).toBe(false)
    expect(rushCalls()).toHaveLength(1)
  })

  it("false when the backend refuses or fails, so the page shows the line's own amount", async () => {
    state.rush = [() => fail(500)]
    expect(await repriceRush()).toBe(false)
    state.rush = [() => fail(409)]
    expect(await repriceRush()).toBe(false)
  })
})

describe("placeOrder with rush (contract 9)", () => {
  const withSession = () =>
    checkoutCartPkRush({
      id: "cart_1",
      payment_collection: { id: "pay_col_1", payment_sessions: [{ provider_id: "pp_cod_cod", status: "pending" }] },
    })
  const withoutSession = (total: number) => ({
    cart: checkoutCartPkRush({ id: "cart_1", total, payment_collection: { id: "pay_col_1", payment_sessions: [] } }),
  })

  it("the backend's 400 'Payment sessions are required' reaches the decision: session again, completed again", async () => {
    state.cart = withSession()
    state.complete = [() => fail(400, noSessionAfterPriceChange.message), () => completedPk]
    state.cartReads = [() => ({ cart: withSession() }), () => withoutSession(5050), () => withoutSession(5050)]
    expect(await run(placeOrder("pp_cod_cod", "pk", 5050))).toMatchObject({ redirectedTo: expect.stringContaining("/confirmed") })
    expect(completions()).toHaveLength(2)
    expect(state.calls.some((c) => c.path === "session")).toBe(true)
  })

  it("the price changed: the new total comes back, nothing placed, the cart's reads dropped", async () => {
    state.cart = withSession()
    state.complete = [() => fail(400, noSessionAfterPriceChange.message)]
    state.cartReads = [() => ({ cart: withSession() }), () => withoutSession(5250), () => withoutSession(5250)]
    expect(await run(placeOrder("pp_cod_cod", "pk", 5050))).toEqual({ kind: "total_changed", total: 5250, currencyCode: "pkr" })
    expect(completions()).toHaveLength(1)
    expect(allCartTagsRevalidated()).toBe(true)
  })
})

describe("reading the cart again after a stale rush line was taken off", () => {
  // Next.js answers an identical GET in the same render with the first
  // response; the page saw the removed rush row until a signal opted out.
  it("the second read has a signal of its own; the first is as before", async () => {
    await retrieveCartForPage()
    await retrieveCartForPage({ again: true })
    await retrieveCheckoutCart()
    await retrieveCheckoutCart({ again: true })
    expect(state.calls.map((c) => !!c.signal)).toEqual([false, true, false, true])
  })
})
