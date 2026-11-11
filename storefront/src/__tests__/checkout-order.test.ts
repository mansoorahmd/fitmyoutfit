import { describe, expect, it, vi } from "vitest"

import { placeOrderAlert } from "@lib/util/checkout-alerts"
import {
  BackendCall,
  explainRefusal,
  failureKind,
  placeOrderBlock,
  placeOrderFlow,
  readCartStatus,
  readCompletion,
} from "@lib/util/checkout-order"
import { paymentChoice } from "@lib/util/checkout-payment"
import { minimumView, parseCheckoutRules } from "@lib/util/checkout-rules"

import {
  completedPk,
  providersPk,
  rulesGb10,
  rulesGb9,
  rulesPkAvailable,
  rulesPkOverLimit,
} from "./fixtures/m1-checkout"

const plain = (s: string | undefined) => s?.replace(/\s/g, " ")
const choice = paymentChoice({ providerIds: providersPk, rules: parseCheckoutRules(rulesPkAvailable) })

describe("what keeps 'Place order' inactive (05, 5.4 and 6.6)", () => {
  const base = {
    online: true,
    minimum: null,
    deliveryReady: true,
    choice,
    chosenId: "pp_cod_cod",
  }

  it("nothing, when everything is ready", () => {
    expect(placeOrderBlock(base)).toBeNull()
  })

  it("no payment chosen, or one that can't be chosen any more", () => {
    expect(placeOrderBlock({ ...base, chosenId: null })).toEqual({ kind: "payment" })
    const over = paymentChoice({ providerIds: providersPk, rules: parseCheckoutRules(rulesPkOverLimit) })
    expect(placeOrderBlock({ ...base, choice: over })).toEqual({ kind: "payment" })
  })

  it("below the minimum, with how many more pieces are needed", () => {
    const minimum = minimumView(parseCheckoutRules(rulesGb9))
    expect(placeOrderBlock({ ...base, minimum })).toEqual({ kind: "minimum", missing: 1 })
    expect(placeOrderBlock({ ...base, minimum: minimumView(parseCheckoutRules(rulesGb10)) })).toBeNull()
  })

  it("no delivery method yet", () => {
    expect(placeOrderBlock({ ...base, deliveryReady: false })).toEqual({ kind: "delivery" })
  })

  it("offline comes first, then the minimum, then delivery, then payment", () => {
    const minimum = minimumView(parseCheckoutRules(rulesGb9))
    expect(placeOrderBlock({ ...base, online: false, minimum, chosenId: null })).toEqual({ kind: "offline" })
    expect(placeOrderBlock({ ...base, minimum, deliveryReady: false, chosenId: null })).toEqual({
      kind: "minimum",
      missing: 1,
    })
    expect(placeOrderBlock({ ...base, deliveryReady: false, chosenId: null })).toEqual({ kind: "delivery" })
  })
})

describe("how each answer from the backend maps to a result", () => {
  it("by status, never by message", () => {
    expect(failureKind(400)).toBe("refused")
    expect(failureKind(404)).toBe("cart_lost")
    expect(failureKind(409)).toBe("conflict")
    expect(failureKind(500)).toBe("server")
    expect(failureKind(undefined)).toBe("no_answer")
  })

  it("reads the backend's order answer", () => {
    expect(readCompletion({ ok: true, body: completedPk as any })).toEqual({
      kind: "order",
      orderId: "order_01M75ZX01HAMSFCPZ3CD6HF5TA",
      countryCode: "pk",
    })
  })

  it("an answer with the cart is a payment that didn't go through", () => {
    expect(readCompletion({ ok: true, body: { type: "cart", cart: {}, error: { message: "x" } } })).toEqual({
      kind: "payment_failed",
    })
  })

  it("reads the cart for 'Check my order'", () => {
    expect(readCartStatus({ ok: true, body: { completed_at: "2026-11-11T19:03:36.360Z" } })).toEqual({ kind: "completed" })
    expect(readCartStatus({ ok: true, body: { completed_at: null } })).toEqual({ kind: "open" })
    expect(readCartStatus({ ok: false, status: 404 })).toEqual({ kind: "cart_lost" })
    expect(readCartStatus({ ok: false })).toEqual({ kind: "no_answer" })
  })
})

describe("placeOrderFlow (contract 6 and 8.1)", () => {
  const order: BackendCall<any> = { ok: true, body: completedPk }
  const ok: BackendCall<unknown> = { ok: true, body: {} }

  it("makes sure of the payment session, then completes once", async () => {
    const ensureSession = vi.fn(async () => ok)
    const complete = vi.fn(async () => order)
    expect(await placeOrderFlow({ ensureSession, complete })).toMatchObject({ kind: "order" })
    expect(ensureSession).toHaveBeenCalledTimes(1)
    expect(complete).toHaveBeenCalledTimes(1)
  })

  it("on HTTP 409 completes once more", async () => {
    const complete = vi
      .fn<() => Promise<BackendCall<any>>>()
      .mockResolvedValueOnce({ ok: false, status: 409 })
      .mockResolvedValueOnce(order)
    expect(await placeOrderFlow({ ensureSession: async () => ok, complete })).toMatchObject({ kind: "order" })
    expect(complete).toHaveBeenCalledTimes(2)
  })

  it("409 twice: unknown, never a third try", async () => {
    const complete = vi.fn(async (): Promise<BackendCall<any>> => ({ ok: false, status: 409 }))
    expect(await placeOrderFlow({ ensureSession: async () => ok, complete })).toEqual({ kind: "unknown" })
    expect(complete).toHaveBeenCalledTimes(2)
  })

  it("no answer at completion: unknown (the order may exist)", async () => {
    expect(
      await placeOrderFlow({ ensureSession: async () => ok, complete: async () => ({ ok: false }) })
    ).toEqual({ kind: "unknown" })
  })

  it("400 at completion (below the minimum) is a refusal", async () => {
    expect(
      await placeOrderFlow({ ensureSession: async () => ok, complete: async () => ({ ok: false, status: 400 }) })
    ).toEqual({ kind: "refused" })
  })

  it("a refused session (cash on delivery over the limit) is a refusal, and nothing is completed", async () => {
    const complete = vi.fn(async () => order)
    expect(
      await placeOrderFlow({ ensureSession: async () => ({ ok: false, status: 400 }), complete })
    ).toEqual({ kind: "refused" })
    expect(complete).not.toHaveBeenCalled()
  })

  it("500 is the server error state; 404 the expired cart", async () => {
    expect(
      await placeOrderFlow({ ensureSession: async () => ok, complete: async () => ({ ok: false, status: 500 }) })
    ).toEqual({ kind: "server" })
    expect(
      await placeOrderFlow({ ensureSession: async () => ({ ok: false, status: 404 }), complete: async () => order })
    ).toEqual({ kind: "cart_lost" })
  })
})

describe("explaining a refusal from the rules read again (05, 6.8 a)", () => {
  const explain = (rules: unknown, chosenId: string | null, total = 22750) =>
    explainRefusal({ rules: parseCheckoutRules(rules), chosenId, total, currencyCode: "pkr" })

  it("the minimum first", () => {
    expect(explain(rulesGb9, "pp_system_default")).toEqual({ kind: "minimum", required: 10, counted: 9, missing: 1 })
  })

  it("cash on delivery over the limit, with the limit and the total", () => {
    const r = explain(rulesPkOverLimit, "pp_cod_cod")
    expect(r.kind).toBe("cod_over_limit")
    if (r.kind === "cod_over_limit") {
      expect(plain(r.limit)).toBe("PKR 20,000")
      expect(plain(r.total)).toBe("PKR 22,750")
    }
  })

  it("cash on delivery refused for the region (a region change in another tab)", () => {
    expect(explain(rulesGb10, "pp_cod_cod")).toEqual({ kind: "cod_region" })
  })

  it("otherwise, or without rules, the general one", () => {
    expect(explain(rulesPkOverLimit, "pp_system_default")).toEqual({ kind: "generic" })
    expect(explain(rulesPkAvailable, "pp_cod_cod")).toEqual({ kind: "generic" })
    expect(explainRefusal({ rules: null, chosenId: "pp_cod_cod", total: 1, currencyCode: "pkr" })).toEqual({
      kind: "generic",
    })
  })
})

describe("the alert above 'Place order' (05, 6.8)", () => {
  it("minimum: W-M7 and W-M8, with Back to cart", () => {
    expect(placeOrderAlert({ kind: "refusal", refusal: { kind: "minimum", required: 10, counted: 7, missing: 3 } })).toMatchObject({
      title: "Your order needs 10 garment pieces",
      text: "You have 7. Add 3 more in your cart to place the order.",
      action: "back_to_cart",
    })
  })

  it("cash on delivery over the limit: W-E1 and W-E2; it is deselected and focus goes to the payment", () => {
    const alert = placeOrderAlert({
      kind: "refusal",
      refusal: { kind: "cod_over_limit", limit: "PKR 20,000", total: "PKR 21,250" },
    })
    expect(alert).toMatchObject({
      title: "Cash on delivery isn't available for this order",
      text: "It's for orders up to PKR 20,000. Your total is PKR 21,250. Choose another way to pay.",
      focus: "payment",
      deselectCod: true,
    })
  })

  it("cash on delivery for the region: W-E3", () => {
    expect(placeOrderAlert({ kind: "refusal", refusal: { kind: "cod_region" } }).text).toBe(
      "Cash on delivery is for orders in Pakistan."
    )
  })

  it("the general refusal: W-E4 and W-E5; the main button reads Try again", () => {
    expect(placeOrderAlert({ kind: "refusal", refusal: { kind: "generic" } })).toMatchObject({
      title: "We couldn't place your order",
      text: "Your order was not placed. Try again, or go back to your cart and check it.",
      retryLabel: true,
      action: "back_to_cart",
    })
  })

  it("unknown: W-E11 to W-E13, and no Place order until checked", () => {
    expect(placeOrderAlert({ kind: "unknown" })).toMatchObject({
      title: "We lost the connection",
      action: "check_order",
      hidePlaceOrder: true,
    })
  })

  it("cart lost: W-E14, W-E15 and Go to cart; server: the server-error title", () => {
    expect(placeOrderAlert({ kind: "cart_lost" })).toMatchObject({
      title: "Your cart has expired",
      text: "Start again from your cart.",
      action: "go_to_cart",
      hidePlaceOrder: true,
    })
    expect(placeOrderAlert({ kind: "server" }).title).toBe("Something went wrong on our side")
  })

  it("never claims nothing was charged (W-E6 is not used yet)", () => {
    for (const state of [
      { kind: "refusal", refusal: { kind: "generic" } },
      { kind: "payment_failed" },
      { kind: "unknown" },
    ] as const) {
      const alert = placeOrderAlert(state)
      expect(`${alert.title} ${alert.text}`).not.toMatch(/charged/i)
    }
  })
})
