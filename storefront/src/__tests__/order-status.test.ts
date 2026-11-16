import { afterEach, describe, expect, it, vi } from "vitest"

import { DeadlineError, within } from "@lib/util/deadline"
import {
  CHECK_ORDER_TIMEOUT_MS,
  confirmationPath,
  findOrderFlow,
  isCartId,
  orderStatusUrl,
  parseOrderStatus,
  requestOrderStatus,
} from "@lib/util/order-status"

import { completedPk } from "./fixtures/m1-checkout"

// "Did this cart become an order?" (QA S1-4, D1 and D5): the decision on the
// server and the browser's request with its own time limit.

afterEach(() => {
  vi.useRealTimers()
})

describe("within (a time limit for a backend call)", () => {
  it("gives the call's answer when it comes in time", async () => {
    await expect(within(1000, async () => "ok")).resolves.toBe("ok")
  })

  it("stops waiting when the time is up, even if the call never settles, and aborts it", async () => {
    vi.useFakeTimers()
    let signal: AbortSignal | undefined
    const waiting = within(5000, (s) => {
      signal = s
      return new Promise(() => {})
    })
    const seen = waiting.catch((e) => e)
    await vi.advanceTimersByTimeAsync(4999)
    expect(signal?.aborted).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    expect(await seen).toBeInstanceOf(DeadlineError)
    expect(signal?.aborted).toBe(true)
  })
})

describe("findOrderFlow (the server's decision)", () => {
  const completedCart = { ok: true as const, body: { completed_at: "2026-11-12T10:00:00Z" } }

  it("a completed cart: completes again, which returns the same order", async () => {
    const complete = vi.fn(async () => ({ ok: true as const, body: completedPk as never }))
    expect(await findOrderFlow({ readCart: async () => completedCart, complete })).toEqual({
      kind: "order",
      orderId: completedPk.order.id,
      countryCode: "pk",
    })
    expect(complete).toHaveBeenCalledTimes(1)
  })

  it("an open cart: nothing was placed, and nothing is completed", async () => {
    const complete = vi.fn()
    expect(
      await findOrderFlow({ readCart: async () => ({ ok: true, body: { completed_at: null } }), complete })
    ).toEqual({ kind: "open" })
    expect(complete).not.toHaveBeenCalled()
  })

  it("a completed cart whose order can't be read now is still placed, never 'not placed'", async () => {
    for (const failed of [{ ok: false as const }, { ok: false as const, status: 409 }, { ok: false as const, status: 500 }]) {
      expect(await findOrderFlow({ readCart: async () => completedCart, complete: async () => failed })).toEqual({
        kind: "placed",
      })
    }
  })

  it("no answer about the cart: unknown; an unknown cart: lost", async () => {
    const complete = vi.fn()
    expect(await findOrderFlow({ readCart: async () => ({ ok: false }), complete })).toEqual({ kind: "no_answer" })
    expect(await findOrderFlow({ readCart: async () => ({ ok: false, status: 404 }), complete })).toEqual({
      kind: "cart_lost",
    })
    expect(complete).not.toHaveBeenCalled()
  })
})

describe("paths and answers", () => {
  it("the confirmation is under the order's country, else the URL's", () => {
    expect(confirmationPath("order_1", "us", "pk")).toBe("/us/order/order_1/confirmed")
    expect(confirmationPath("order_1", null, "pk")).toBe("/pk/order/order_1/confirmed")
    expect(orderStatusUrl("pk")).toBe("/pk/checkout/order-status")
  })

  it("accepts only a cart id as the route's input", () => {
    expect(isCartId("cart_01M75ZX01HAMSFCPZ3CD6HF5TA")).toBe(true)
    for (const bad of ["", "cart_", "cart_1/complete", "../x", "order_1", 5, null]) {
      expect(isCartId(bad)).toBe(false)
    }
  })

  it("reads the route's answer, and never follows a path off this site", () => {
    expect(parseOrderStatus({ kind: "order", url: "/pk/order/o/confirmed" })).toEqual({
      kind: "order",
      url: "/pk/order/o/confirmed",
    })
    expect(parseOrderStatus({ kind: "order", url: "https://evil.example/x" })).toEqual({ kind: "no_answer" })
    expect(parseOrderStatus({ kind: "order", url: "//evil.example/x" })).toEqual({ kind: "no_answer" })
    expect(parseOrderStatus({ kind: "open" })).toEqual({ kind: "open" })
    expect(parseOrderStatus({ kind: "placed" })).toEqual({ kind: "placed" })
    expect(parseOrderStatus({ kind: "weird" })).toEqual({ kind: "no_answer" })
    expect(parseOrderStatus(null)).toEqual({ kind: "no_answer" })
  })
})

describe("requestOrderStatus (the browser's check, QA D5)", () => {
  it("posts the cart id to the country's route and reads the answer", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ kind: "open" }), { status: 200 }))
    expect(await requestOrderStatus({ countryCode: "pk", cartId: "cart_1", fetchImpl })).toEqual({ kind: "open" })
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe("/pk/checkout/order-status")
    expect(init.method).toBe("POST")
    expect(JSON.parse(String(init.body))).toEqual({ cartId: "cart_1" })
    expect(init.signal).toBeInstanceOf(AbortSignal)
  })

  it("never waits longer than its limit: a hung route ends as 'no answer' at 15 s", async () => {
    vi.useFakeTimers()
    const fetchImpl = vi.fn(() => new Promise<Response>(() => {}))
    let result: unknown = "waiting"
    void requestOrderStatus({ countryCode: "pk", cartId: "cart_1", fetchImpl }).then((r) => (result = r))
    await vi.advanceTimersByTimeAsync(CHECK_ORDER_TIMEOUT_MS - 1)
    expect(result).toBe("waiting")
    await vi.advanceTimersByTimeAsync(1)
    expect(result).toEqual({ kind: "no_answer" })
    expect(CHECK_ORDER_TIMEOUT_MS).toBe(15_000)
  })

  it("no connection or an error page is 'no answer', never 'not placed'", async () => {
    const down = vi.fn(async () => {
      throw new TypeError("Failed to fetch")
    })
    expect(await requestOrderStatus({ countryCode: "pk", fetchImpl: down })).toEqual({ kind: "no_answer" })
    const failing = vi.fn(async () => new Response("oops", { status: 500 }))
    expect(await requestOrderStatus({ countryCode: "pk", fetchImpl: failing })).toEqual({ kind: "no_answer" })
  })
})
