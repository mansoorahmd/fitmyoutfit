import { describe, expect, it, vi } from "vitest"

import { orderCardView } from "@lib/util/account-orders"
import { cartPageView } from "@lib/util/cart-page"
import { pieceCount } from "@lib/util/cart-view"
import { placeOrderAlert } from "@lib/util/checkout-alerts"
import {
  BackendCall,
  COMPLETION_RETRIES,
  completionRetry,
  placeOrderFlow,
  totalChanged,
} from "@lib/util/checkout-order"
import { parseCheckoutRules, promisedDate } from "@lib/util/checkout-rules"
import { checkoutView } from "@lib/util/checkout-view"
import { orderConfirmationView } from "@lib/util/order-confirmation"
import {
  RUSH_CONFLICT_RETRIES,
  codHintMentionsRush,
  isRushLine,
  rushControlView,
  rushIsStale,
  rushLineAmount,
  rushRequest,
  rushSaveResult,
  saveRushChoice,
  summaryAmounts,
  withoutRush,
} from "@lib/util/rush"

import { completedPk, optionPk, providersPk, refusals, rulesPkAvailable, rulesPkOverLimit } from "./fixtures/m1-checkout"
import {
  checkoutCartPkRush,
  noSessionAfterPriceChange,
  rulesFitKitOnly,
  rulesPkRushInCart,
  rulesPkRushOffered,
  rulesPkRushStale,
  rushLine,
  tshirtLine,
} from "./fixtures/rush"

const plain = (s: string | null | undefined) => s?.replace(/\s/g, " ")
const fitKit = { quantity: 1, product: { metadata: { kind: "fit_kit" } }, subtotal: 5000, unit_price: 5000 }

describe("the rules route's rush part (contract 9)", () => {
  it("reads it as the backend gives it", () => {
    expect(parseCheckoutRules(rulesPkRushOffered)?.rush).toEqual({
      available: true,
      in_cart: false,
      percentage: 20,
      amount: 800,
      currency_code: "pkr",
    })
  })

  it("leaves it out when it is missing or can't be read, so nothing about rush shows", () => {
    expect(parseCheckoutRules(rulesPkAvailable)).not.toHaveProperty("rush")
    for (const rush of [null, "yes", { available: "true", in_cart: false, percentage: 20, amount: 8, currency_code: "pkr" },
      { available: true, in_cart: false, percentage: -1, amount: 8, currency_code: "pkr" },
      { available: true, in_cart: false, percentage: 20, amount: Number.NaN, currency_code: "pkr" },
      { available: true, in_cart: false, percentage: 20, amount: 8 }]) {
      expect(parseCheckoutRules({ ...rulesPkRushOffered, rush })?.rush).toBeUndefined()
    }
  })

  it("keeps an amount with decimals (GBP 0.53)", () => {
    const rules = parseCheckoutRules({ ...rulesPkRushOffered, rush: { ...rulesPkRushOffered.rush, amount: 0.53, currency_code: "gbp" } })
    expect(rules?.rush?.amount).toBe(0.53)
  })

  it("the date line shows the rush date while the cart holds rush", () => {
    expect(promisedDate(parseCheckoutRules(rulesPkRushOffered))).toBe("2026-12-02")
    expect(promisedDate(parseCheckoutRules(rulesPkRushInCart))).toBe("2026-11-27")
  })
})

describe("the rush line, the rows and the counts", () => {
  it("is told by the product's kind, not its handle or picture", () => {
    expect(isRushLine(rushLine())).toBe(true)
    expect(isRushLine(tshirtLine())).toBe(false)
    expect(isRushLine(rushLine({ product: { metadata: { kind: "garment" } } }))).toBe(false)
    expect(isRushLine({ product: null })).toBe(false)
    expect(withoutRush([tshirtLine(), rushLine(), fitKit])).toEqual([tshirtLine(), fitKit])
  })

  it("pieces count garments and the fit kit, never rush; a line read without its product counts", () => {
    expect(pieceCount([tshirtLine(), rushLine(), fitKit])).toBe(3)
    expect(pieceCount([{ quantity: 4 }, rushLine()])).toBe(4)
  })

  it("the rush row is the line's subtotal; the items row is the rest of the subtotal", () => {
    expect(rushLineAmount([tshirtLine(), rushLine()])).toBe(800)
    expect(rushLineAmount([tshirtLine()])).toBeNull()
    expect(rushLineAmount([rushLine({ subtotal: undefined, unit_price: 44 })])).toBe(44)
    expect(summaryAmounts(4800, [tshirtLine(), rushLine()])).toEqual({ items: 4000, rush: 800 })
    expect(summaryAmounts(4000, [tshirtLine()])).toEqual({ items: 4000, rush: null })
    // no 0.1 + 0.2 drift
    expect(summaryAmounts(220.53, [rushLine({ subtotal: 0.53 })])).toEqual({ items: 220, rush: 0.53 })
  })
})

describe("the Delivery speed control (rushControlView)", () => {
  it("shows when rush is offered, Standard chosen until the cart holds rush", () => {
    const view = rushControlView(parseCheckoutRules(rulesPkRushOffered), "pkr")
    expect({ ...view, amount: plain(view?.amount) }).toEqual({
      chosen: "standard",
      standardDate: "2026-12-02",
      rushDate: "2026-11-27",
      amount: "PKR 800",
      percentage: 20,
    })
    expect(rushControlView(parseCheckoutRules(rulesPkRushInCart), "pkr")?.chosen).toBe("rush")
  })

  it("is not shown without rules, without the rush part, or when rush isn't offered", () => {
    expect(rushControlView(null, "pkr")).toBeNull()
    expect(rushControlView(parseCheckoutRules(rulesPkAvailable), "pkr")).toBeNull()
    expect(rushControlView(parseCheckoutRules(rulesFitKitOnly), "pkr")).toBeNull()
    expect(rushControlView(parseCheckoutRules(rulesPkRushStale), "pkr")).toBeNull()
  })

  it("formats the rules' amount in the cart's currency", () => {
    const rules = parseCheckoutRules({ ...rulesPkRushOffered, rush: { ...rulesPkRushOffered.rush, amount: 0.53, currency_code: "gbp" } })
    expect(plain(rushControlView(rules, "gbp")?.amount)).toBe("GBP 0.53")
  })

  it("a press asks for a change only when it is one", () => {
    expect(rushRequest("standard", "rush")).toBe("add")
    expect(rushRequest("rush", "standard")).toBe("remove")
    expect(rushRequest("rush", "rush")).toBeNull()
    expect(rushRequest("standard", "standard")).toBeNull()
  })

  it("a rush line that is no longer offered is stale; one that is offered is not", () => {
    expect(rushIsStale(parseCheckoutRules(rulesPkRushStale))).toBe(true)
    expect(rushIsStale(parseCheckoutRules(rulesPkRushInCart))).toBe(false)
    expect(rushIsStale(parseCheckoutRules(rulesFitKitOnly))).toBe(false)
    expect(rushIsStale(null)).toBe(false)
  })
})

describe("saving the choice (POST and DELETE /store/carts/:id/rush)", () => {
  it("reads each answer by its status", () => {
    expect(rushSaveResult({ ok: true })).toEqual({ ok: true })
    expect(rushSaveResult({ ok: false, status: 409 })).toEqual({ ok: false, kind: "conflict" })
    expect(rushSaveResult({ ok: false, status: 400 })).toEqual({ ok: false, kind: "refused" })
    expect(rushSaveResult({ ok: false, status: 404 })).toEqual({ ok: false, kind: "cart_lost" })
    expect(rushSaveResult({ ok: false, status: 500 })).toEqual({ ok: false, kind: "server" })
    expect(rushSaveResult({ ok: false })).toEqual({ ok: false, kind: "no_answer" })
  })

  it("sends a 409 again once by itself, and says nothing when the second goes through", async () => {
    const send = vi.fn().mockResolvedValueOnce({ ok: false, status: 409 }).mockResolvedValueOnce({ ok: true })
    expect(await saveRushChoice(send)).toEqual({ ok: true })
    expect(send).toHaveBeenCalledTimes(2)
  })

  it("409 every time: a conflict after the one retry, never more", async () => {
    const send = vi.fn(async () => ({ ok: false as const, status: 409 }))
    expect(await saveRushChoice(send)).toEqual({ ok: false, kind: "conflict" })
    expect(send).toHaveBeenCalledTimes(1 + RUSH_CONFLICT_RETRIES)
    expect(RUSH_CONFLICT_RETRIES).toBe(1)
  })

  it("never repeats anything else (a 500 or no answer may have changed nothing, or something)", async () => {
    for (const answer of [{ ok: false as const, status: 500 }, { ok: false as const }, { ok: false as const, status: 400 }]) {
      const send = vi.fn(async () => answer)
      await saveRushChoice(send)
      expect(send).toHaveBeenCalledTimes(1)
    }
  })
})

describe("cash on delivery over the limit with rush (codHintMentionsRush)", () => {
  it("only over the limit, with rush offered and in the cart", () => {
    const over = { cash_on_delivery: rulesPkOverLimit.cash_on_delivery }
    expect(codHintMentionsRush(parseCheckoutRules({ ...rulesPkRushInCart, ...over }))).toBe(true)
    expect(codHintMentionsRush(parseCheckoutRules({ ...rulesPkRushOffered, ...over }))).toBe(false)
    expect(codHintMentionsRush(parseCheckoutRules(rulesPkRushInCart))).toBe(false)
    expect(codHintMentionsRush(parseCheckoutRules({ ...rulesPkRushStale, ...over }))).toBe(false)
    const region = { cash_on_delivery: { ...rulesPkOverLimit.cash_on_delivery, reason: "region" } }
    expect(codHintMentionsRush(parseCheckoutRules({ ...rulesPkRushInCart, ...region }))).toBe(false)
  })
})

describe("the pages' views with a rush line", () => {
  const cart = checkoutCartPkRush()

  it("cart page: no rush among the lines, the rows, the counts and the control", () => {
    const view = cartPageView({
      cart,
      rules: parseCheckoutRules(rulesPkRushInCart),
      shippingOptions: [optionPk],
      countryCode: "pk",
      isGuest: true,
    })
    expect(view.lines.map((l) => l.title)).toEqual(["T-Shirt"])
    expect(view.pieces).toBe(2)
    expect(plain(view.itemSubtotal)).toBe("PKR 4,000")
    expect(plain(view.rush)).toBe("PKR 800")
    expect(plain(view.total)).toBe("PKR 5,050")
    expect(view.deliveryDate).toBe("2026-11-27")
    expect(view.rushControl?.chosen).toBe("rush")
    expect(view.codRushHint).toBe(false)
    expect(view.rushDropped).toBe(false)
  })

  it("cart page without rush: no row, and the control only when offered", () => {
    const plainCart = checkoutCartPkRush({ items: [tshirtLine()], item_subtotal: 4000, total: 4250 })
    const view = cartPageView({ cart: plainCart, rules: parseCheckoutRules(rulesPkAvailable), shippingOptions: [optionPk], countryCode: "pk", isGuest: true })
    expect(view.rush).toBeNull()
    expect(view.rushControl).toBeNull()
    expect(plain(view.itemSubtotal)).toBe("PKR 4,000")
  })

  it("checkout: the summary has the rush row, the lines and pieces leave it out", () => {
    const view = checkoutView({
      cart,
      rules: parseCheckoutRules(rulesPkRushInCart),
      shippingOptions: [optionPk],
      providerIds: providersPk,
      customer: null,
      countryCode: "pk",
      rushDropped: true,
    })
    expect(view.lines.map((l) => l.title)).toEqual(["T-Shirt"])
    expect(view.pieces).toBe(2)
    expect(plain(view.summary.itemSubtotal)).toBe("PKR 4,000")
    expect(plain(view.summary.rush)).toBe("PKR 800")
    expect(view.summary.deliveryDate).toBe("2026-11-27")
    expect(view.rushControl?.chosen).toBe("rush")
    expect(view.rushDropped).toBe(true)
    expect(view.totalAmount).toBe(5050)
  })

  it("the order: the confirmation's rows and the order card", () => {
    const order = {
      id: "order_1",
      display_id: 7,
      currency_code: "pkr",
      created_at: "2026-11-17T09:00:00.000Z",
      total: 5050,
      item_subtotal: 4800,
      shipping_subtotal: 250,
      items: [rushLine(), tshirtLine()],
      shipping_methods: [{ name: "Delivery in Pakistan", amount: 250 }],
      shipping_address: { first_name: "Ali", country_code: "pk" },
      payment_collections: [],
    } as any
    const view = orderConfirmationView({
      order,
      promise: { date: "2026-11-27", days: 10, based_on: "2026-11-17", applies: "rush" },
    })
    expect(view.lines.map((l) => l.title)).toEqual(["T-Shirt"])
    expect(view.pieces).toBe(2)
    expect(plain(view.itemSubtotal)).toBe("PKR 4,000")
    expect(plain(view.rush)).toBe("PKR 800")
    expect(view.deliveryDate).toBe("2026-11-27")
    const card = orderCardView({ ...order, status: "pending" }, null)
    expect(card.thumbnails.map((t) => t.alt)).toEqual(["T-Shirt"])
    expect(plain(card.meta.join(" · "))).toContain("2 pieces")
  })
})

describe("completing with rush (contract 9): the retry decision table", () => {
  it("names the three answers that mean 'try again', and nothing else", () => {
    expect(completionRetry({ ok: false, status: 409, message: "An unknown error occurred." })).toBe("conflict")
    expect(completionRetry({ ok: false, status: 400, ...noSessionAfterPriceChange })).toBe("session_required")
    expect(completionRetry({ ok: false, status: 404, message: "PaymentSession with id: payses_1 was not found" })).toBe("session_missing")
    expect(completionRetry({ ok: false, status: 404, message: "Payment session payses_1 not found" })).toBe("session_missing")
    // the minimum, cash on delivery, an unknown cart: refusals as before
    expect(completionRetry({ ok: false, status: 400, ...refusals.minimum })).toBeNull()
    expect(completionRetry({ ok: false, status: 400, ...refusals.codOverLimit })).toBeNull()
    expect(completionRetry({ ok: false, status: 404, ...refusals.unknownCart })).toBeNull()
    expect(completionRetry({ ok: false, status: 400 })).toBeNull()
    expect(completionRetry({ ok: false, status: 500, message: "Payment sessions are required to complete cart" })).toBeNull()
    expect(completionRetry({ ok: false })).toBeNull()
    expect(completionRetry({ ok: true, body: completedPk })).toBeNull()
    expect(COMPLETION_RETRIES).toBe(2)
  })

  it("compares the total the customer saw with the cart's, to the smallest unit", () => {
    expect(totalChanged(5050, 5050)).toBe(false)
    expect(totalChanged(5050, 5250)).toBe(true)
    expect(totalChanged(220.53, 220.53)).toBe(false)
    expect(totalChanged(220.53, 220.54)).toBe(true)
    expect(totalChanged(null, 5050)).toBe(false)
    expect(totalChanged(5050, undefined)).toBe(false)
  })
})

describe("placeOrderFlow with rush (contract 9)", () => {
  const order: BackendCall<any> = { ok: true, body: completedPk }
  const cartAt = (total: number, completed = false): BackendCall<unknown> => ({
    ok: true,
    body: { total, currency_code: "pkr", completed_at: completed ? "2026-11-17T09:00:00Z" : null },
  })
  const noSession: BackendCall<any> = { ok: false, status: 400, ...noSessionAfterPriceChange }
  const missingSession: BackendCall<any> = { ok: false, status: 404, message: "PaymentSession with id: payses_1 was not found" }

  it("400 'Payment sessions are required': the session again, then complete again, unseen", async () => {
    const ensureSession = vi.fn(async () => cartAt(5050))
    const complete = vi.fn<() => Promise<BackendCall<any>>>().mockResolvedValueOnce(noSession).mockResolvedValueOnce(order)
    expect(await placeOrderFlow({ ensureSession, complete, expectedTotal: 5050 })).toMatchObject({ kind: "order" })
    expect(ensureSession).toHaveBeenCalledTimes(2)
    expect(complete).toHaveBeenCalledTimes(2)
  })

  it("the rare 404 naming a payment session: the same", async () => {
    const ensureSession = vi.fn(async () => cartAt(5050))
    const complete = vi.fn<() => Promise<BackendCall<any>>>().mockResolvedValueOnce(missingSession).mockResolvedValueOnce(order)
    expect(await placeOrderFlow({ ensureSession, complete, expectedTotal: 5050 })).toMatchObject({ kind: "order" })
    expect(ensureSession).toHaveBeenCalledTimes(2)
  })

  it("409, then the 400 first, then the order: three completions, all unseen", async () => {
    const complete = vi
      .fn<() => Promise<BackendCall<any>>>()
      .mockResolvedValueOnce({ ok: false, status: 409 })
      .mockResolvedValueOnce(noSession)
      .mockResolvedValueOnce(order)
    expect(await placeOrderFlow({ ensureSession: async () => cartAt(5050), complete, expectedTotal: 5050 })).toMatchObject({ kind: "order" })
    expect(complete).toHaveBeenCalledTimes(3)
  })

  it("the price changed at that moment: the new total, nothing completed after it", async () => {
    const ensureSession = vi.fn<() => Promise<BackendCall<unknown>>>().mockResolvedValueOnce(cartAt(5050)).mockResolvedValueOnce(cartAt(5250))
    const complete = vi.fn(async () => noSession)
    expect(await placeOrderFlow({ ensureSession, complete, expectedTotal: 5050 })).toEqual({
      kind: "total_changed",
      total: 5250,
      currencyCode: "pkr",
    })
    expect(complete).toHaveBeenCalledTimes(1)
  })

  it("the second press, with the new total the page now shows, places it", async () => {
    const complete = vi.fn(async () => order)
    expect(await placeOrderFlow({ ensureSession: async () => cartAt(5250), complete, expectedTotal: 5250 })).toMatchObject({ kind: "order" })
  })

  it("a total that differs before the first completion: nothing completed at all", async () => {
    const complete = vi.fn(async () => order)
    expect(await placeOrderFlow({ ensureSession: async () => cartAt(5250), complete, expectedTotal: 5050 })).toMatchObject({ kind: "total_changed" })
    expect(complete).not.toHaveBeenCalled()
  })

  it("a cart that is an order already is never stopped for its total: the order opens", async () => {
    const complete = vi.fn(async () => order)
    expect(await placeOrderFlow({ ensureSession: async () => cartAt(5250, true), complete, expectedTotal: 5050 })).toMatchObject({ kind: "order" })
  })

  it("without a total to compare, no check (as before)", async () => {
    expect(await placeOrderFlow({ ensureSession: async () => cartAt(5250), complete: async () => order })).toMatchObject({ kind: "order" })
  })

  it("the 400 every time: a refusal after the first try and two more (nothing was placed)", async () => {
    const complete = vi.fn(async () => noSession)
    expect(await placeOrderFlow({ ensureSession: async () => cartAt(5050), complete, expectedTotal: 5050 })).toEqual({ kind: "refused" })
    expect(complete).toHaveBeenCalledTimes(1 + COMPLETION_RETRIES)
  })

  it("the missing session every time: a refusal too, never 'cart lost'", async () => {
    const complete = vi.fn(async () => missingSession)
    expect(await placeOrderFlow({ ensureSession: async () => cartAt(5050), complete, expectedTotal: 5050 })).toEqual({ kind: "refused" })
  })

  it("a lost connection while making sure of the session again: unknown (the order may exist)", async () => {
    const ensureSession = vi.fn<() => Promise<BackendCall<unknown>>>().mockResolvedValueOnce(cartAt(5050)).mockResolvedValueOnce({ ok: false })
    expect(await placeOrderFlow({ ensureSession, complete: async () => noSession, expectedTotal: 5050 })).toEqual({ kind: "unknown" })
  })

  it("a 400 refusal of another kind and a 404 for the cart are what they were", async () => {
    expect(await placeOrderFlow({ ensureSession: async () => cartAt(5050), complete: async () => ({ ok: false, status: 400, ...refusals.minimum }), expectedTotal: 5050 })).toEqual({ kind: "refused" })
    expect(await placeOrderFlow({ ensureSession: async () => cartAt(5050), complete: async () => ({ ok: false, status: 404, ...refusals.unknownCart }), expectedTotal: 5050 })).toEqual({ kind: "cart_lost" })
  })
})

describe("the 'total changed' alert", () => {
  it("is information, with the new total, and the button still reads Place order", () => {
    const shown = placeOrderAlert({ kind: "total_changed", total: 5250, currencyCode: "pkr" })
    expect(shown.variant).toBe("info")
    expect(shown.title).toBe("Your total has changed")
    expect(plain(shown.text)).toBe("It's now PKR 5,250. Your order isn't placed yet: check it, then press Place order again.")
    expect(shown.retryLabel).toBe(false)
    expect(shown.hidePlaceOrder).toBe(false)
    expect(shown.focus).toBe("alert")
  })
})
