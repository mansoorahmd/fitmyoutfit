import { beforeEach, describe, expect, it, vi } from "vitest"

import { CART_CACHE_TAGS } from "@lib/util/cart-cache"

import {
  checkoutCartPk,
  completedPk,
  optionPk,
  refusals,
  rulesGb9,
  rulesPkOverLimit,
} from "./fixtures/m1-checkout"

// A fake backend behind the SDK, recording every call, and fakes of the
// cookies and of Next.js's revalidateTag and redirect. Failures are thrown
// like the SDK's FetchError: an object with the HTTP status.

type Call = { name: string; args: unknown[] }

const { state } = vi.hoisted(() => ({
  state: {
    calls: [] as Call[],
    revalidated: [] as string[],
    cartId: "cart_1" as string | null,
    removedCookie: false,
    cart: null as any,
    addresses: [] as unknown[],
    answers: {} as Record<string, (args: unknown[]) => unknown>,
  },
}))

const fail = (status: number, body: unknown = {}) => {
  throw Object.assign(new Error((body as { message?: string }).message ?? "failed"), { status })
}

const answer = (called: string, args: unknown[]) => {
  // The checkout completes through sdk.client.fetch (to give the call a
  // time limit); it is recorded as "complete" like the SDK's own method.
  const path = called === "fetch" ? String(args[0]) : ""
  const name = path.endsWith("/complete") ? "complete" : called
  state.calls.push({ name, args })
  const custom = state.answers[name]
  if (custom) return custom(args)
  switch (name) {
    case "fetch": {
      const [path] = args as [string]
      if (path.startsWith("/store/carts/")) return { cart: state.cart }
      if (path === "/store/shipping-options") return { shipping_options: [optionPk] }
      if (path === "/store/customers/me") return { customer: { id: "cus_1", addresses: state.addresses } }
      throw new Error(`unexpected ${path}`)
    }
    case "complete":
      return completedPk
    default:
      return { cart: state.cart }
  }
}

vi.mock("@lib/config", () => {
  const rec =
    (name: string) =>
    async (...args: unknown[]) =>
      answer(name, args)
  return {
    sdk: {
      client: { fetch: rec("fetch") },
      store: {
        cart: {
          update: rec("update"),
          addShippingMethod: rec("addShippingMethod"),
          complete: rec("complete"),
          createLineItem: rec("createLineItem"),
        },
        payment: { initiatePaymentSession: rec("initiatePaymentSession") },
        customer: { createAddress: rec("createAddress") },
      },
    },
  }
})

vi.mock("@lib/data/cookies", () => ({
  getAuthHeaders: async () => ({}),
  getCacheTag: async (tag: string) => `${tag}-visitor`,
  getCacheOptions: async (tag: string) => ({ tags: [`${tag}-visitor`] }),
  getCartId: async () => state.cartId,
  setCartId: async () => {},
  removeCartId: async () => {
    state.removedCookie = true
  },
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

vi.mock("@lib/data/checkout-rules", () => ({
  getCheckoutRules: vi.fn(async () => null),
}))
vi.mock("@lib/data/regions", () => ({
  getRegion: async (countryCode: string) => ({ id: `reg_${countryCode}` }),
}))
vi.mock("@lib/data/locale-actions", () => ({ getLocale: async () => null }))

import { addToCartAndConfirm, moveCartToRegion } from "@lib/data/cart"
import {
  choosePayment,
  explainRefusedOrder,
  placeOrder,
  retryDelivery,
  saveAddressStep,
} from "@lib/data/checkout"
import { getCheckoutRules } from "@lib/data/checkout-rules"
import { findOrderForCart } from "@lib/data/order-status"

import { POST } from "../app/[countryCode]/(checkout)/checkout/order-status/route"
import { AddressFormValues } from "@lib/util/checkout-address"
import { parseCheckoutRules } from "@lib/util/checkout-rules"

const names = () => state.calls.map((c) => c.name)
const allCartTagsRevalidated = () =>
  CART_CACHE_TAGS.every((tag) => state.revalidated.includes(`${tag}-visitor`))

const values = (over: Partial<AddressFormValues> = {}): AddressFormValues => ({
  email: "ali@example.com",
  phone: "0300 1234567",
  shipping: {
    first_name: "محمد علی",
    last_name: "",
    company: "",
    country_code: "pk",
    address_1: "House 12, Street 4",
    address_2: "",
    city: "Lahore",
    province: "pk-pb",
    postal_code: "",
  },
  billingSame: true,
  billing: {
    first_name: "",
    last_name: "",
    company: "",
    country_code: "pk",
    address_1: "",
    address_2: "",
    city: "",
    province: "",
    postal_code: "",
  },
  saveToAccount: false,
  ...over,
})

/** Runs an action that may redirect; returns its result or the redirect's URL. */
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
  state.removedCookie = false
  state.cart = checkoutCartPk({ id: "cart_1", payment_collection: { id: "pay_col_1", payment_sessions: [] } })
  state.answers = {}
  state.addresses = []
  vi.mocked(getCheckoutRules).mockResolvedValue(null)
})

describe("saveAddressStep (05, 6.4, 'What happens on save')", () => {
  it("saves the email and both addresses, then adds the region's one delivery option", async () => {
    expect(await saveAddressStep(values())).toEqual({ kind: "saved", delivery: true })
    const update = state.calls.find((c) => c.name === "update")!
    expect(update.args[0]).toBe("cart_1")
    expect(update.args[1]).toMatchObject({
      email: "ali@example.com",
      // the phone in its one stored form (QA S1-4, D15)
      shipping_address: { first_name: "محمد علی", province: "pk-pb", phone: "+923001234567" },
      billing_address: { first_name: "محمد علی" },
    })
    const added = state.calls.find((c) => c.name === "addShippingMethod")!
    expect(added.args[1]).toEqual({ option_id: optionPk.id })
    expect(names().indexOf("update")).toBeLessThan(names().indexOf("addShippingMethod"))
    expect(allCartTagsRevalidated()).toBe(true)
  })

  it("checks the fields again and saves nothing when they are wrong", async () => {
    const result = await saveAddressStep(values({ email: "ali@", phone: "" }))
    expect(result).toEqual({
      kind: "invalid",
      errors: {
        email: "Enter your email address, like name@example.com",
        phone: "Enter a phone number",
      },
    })
    expect(names()).not.toContain("update")
  })

  it("says so when the delivery option couldn't be added, with the address saved", async () => {
    state.answers.addShippingMethod = () => fail(500)
    expect(await saveAddressStep(values())).toEqual({ kind: "saved", delivery: false })
    expect(names()).toContain("update")
  })

  it("an unknown cart is an expired cart", async () => {
    state.answers.fetch = () => fail(404, refusals.unknownCart)
    expect(await saveAddressStep(values())).toEqual({ kind: "cart_lost" })
    state.cartId = null
    expect(await saveAddressStep(values())).toEqual({ kind: "cart_lost" })
  })

  it("saves the address to the account only when asked", async () => {
    await saveAddressStep(values())
    expect(names()).not.toContain("createAddress")
    await saveAddressStep(values({ saveToAccount: true }))
    expect(names()).toContain("createAddress")
  })

  it("the account's first address becomes its default; a later one doesn't", async () => {
    await saveAddressStep(values({ saveToAccount: true }))
    expect(state.calls.find((c) => c.name === "createAddress")!.args[0]).toMatchObject({
      is_default_shipping: true,
      is_default_billing: true,
    })
    state.calls = []
    state.addresses = [{ id: "caddr_1" }]
    await saveAddressStep(values({ saveToAccount: true }))
    const second = state.calls.find((c) => c.name === "createAddress")!.args[0] as Record<string, unknown>
    expect(second.is_default_shipping).toBeUndefined()
  })

  it("Continue, Change, Continue: the address is saved to the account once (QA S1-4c, S1)", async () => {
    await saveAddressStep(values({ saveToAccount: true }))
    const created = state.calls.filter((c) => c.name === "createAddress")
    expect(created).toHaveLength(1)
    // the account now holds it, as the store keeps it
    state.addresses = [{ id: "caddr_1", ...(created[0].args[0] as object) }]
    state.calls = []
    // the same address again, typed with other spacing and case
    await saveAddressStep(
      values({
        saveToAccount: true,
        phone: "+92 300 1234567",
        shipping: { ...values().shipping, address_1: "  house 12,  street 4 ", city: "LAHORE" },
      })
    )
    expect(names()).not.toContain("createAddress")
    expect(names()).toContain("update")
    // another address is still saved
    await saveAddressStep(values({ saveToAccount: true, shipping: { ...values().shipping, address_1: "99 Twice Road" } }))
    expect(names()).toContain("createAddress")
  })

  it("retryDelivery adds the option again", async () => {
    expect(await retryDelivery()).toEqual({ ok: true })
    expect(names()).toContain("addShippingMethod")
    expect(allCartTagsRevalidated()).toBe(true)
  })
})

describe("choosePayment", () => {
  it("starts a payment session for the chosen method on the cart", async () => {
    expect(await choosePayment("pp_cod_cod")).toEqual({ ok: true })
    const started = state.calls.find((c) => c.name === "initiatePaymentSession")!
    expect(started.args[1]).toEqual({ provider_id: "pp_cod_cod" })
    expect(allCartTagsRevalidated()).toBe(true)
  })

  it("a refusal (cash on delivery over the limit, HTTP 400) is reported as refused", async () => {
    state.answers.initiatePaymentSession = () => fail(400, refusals.codOverLimit)
    expect(await choosePayment("pp_cod_cod")).toEqual({ ok: false, kind: "refused" })
  })
})

describe("placeOrder (contract 6 and 8.1)", () => {
  it("creates the payment session again when the cart lost it, completes, and goes to the confirmation", async () => {
    const result = await run(placeOrder("pp_cod_cod", "pk"))
    expect(result).toEqual({ redirectedTo: "/pk/order/order_01M75ZX01HAMSFCPZ3CD6HF5TA/confirmed" })
    expect(names().filter((n) => n !== "fetch")).toEqual(["initiatePaymentSession", "complete"])
    expect(state.removedCookie).toBe(true)
    expect(allCartTagsRevalidated()).toBe(true)
    expect(state.revalidated).toContain("orders-visitor")
  })

  it("keeps a live session for the same method", async () => {
    state.cart = checkoutCartPk({ id: "cart_1" }) // a pending pp_cod_cod session
    await run(placeOrder("pp_cod_cod", "pk"))
    expect(names()).not.toContain("initiatePaymentSession")
    expect(names()).toContain("complete")
  })

  it("replaces a session for another method", async () => {
    state.cart = checkoutCartPk({ id: "cart_1" })
    await run(placeOrder("pp_system_default", "pk"))
    const started = state.calls.find((c) => c.name === "initiatePaymentSession")!
    expect(started.args[1]).toEqual({ provider_id: "pp_system_default" })
  })

  it("on HTTP 409 completes once more", async () => {
    let n = 0
    state.answers.complete = () => (++n === 1 ? fail(409) : completedPk)
    expect(await run(placeOrder("pp_cod_cod", "pk"))).toMatchObject({ redirectedTo: expect.stringContaining("/confirmed") })
    expect(names().filter((x) => x === "complete")).toHaveLength(2)
  })

  it("a refusal (below the minimum, HTTP 400) is answered, with the cart kept", async () => {
    state.answers.complete = () => fail(400, refusals.minimum)
    expect(await run(placeOrder("pp_system_default", "gb"))).toEqual({ kind: "refused" })
    expect(state.removedCookie).toBe(false)
    expect(allCartTagsRevalidated()).toBe(true)
  })

  it("no cart cookie: the cart has expired", async () => {
    state.cartId = null
    expect(await run(placeOrder("pp_cod_cod", "pk"))).toEqual({ kind: "cart_lost" })
  })
})

describe("explainRefusedOrder", () => {
  it("explains from the rules read again and the cart's total", async () => {
    vi.mocked(getCheckoutRules).mockResolvedValue(parseCheckoutRules(rulesGb9))
    expect(await explainRefusedOrder("pp_system_default")).toEqual({
      kind: "minimum",
      required: 10,
      counted: 9,
      missing: 1,
    })
    vi.mocked(getCheckoutRules).mockResolvedValue(parseCheckoutRules(rulesPkOverLimit))
    state.cart = { ...state.cart, total: 22750, currency_code: "pkr" }
    const r = await explainRefusedOrder("pp_cod_cod")
    expect(r.kind).toBe("cod_over_limit")
  })
})

describe("placeOrder with an unknown outcome (QA S1-4, D1 and D6)", () => {
  it("the answer is lost after the order was made: 'unknown', and nothing re-renders the page", async () => {
    state.answers.complete = () => {
      throw new TypeError("fetch failed") // no status: the connection was cut
    }
    expect(await run(placeOrder("pp_cod_cod", "pk"))).toEqual({ kind: "unknown" })
    // A revalidation would re-render the checkout in the action's answer,
    // which sent the customer to the cart page (D1) or the server-error
    // block (D6) instead of "We lost the connection".
    expect(state.revalidated).toEqual([])
    expect(state.removedCookie).toBe(false)
  })

  it("the backend down: 'unknown', nothing revalidated", async () => {
    state.answers.fetch = () => {
      throw new TypeError("fetch failed")
    }
    expect(await run(placeOrder("pp_cod_cod", "pk"))).toEqual({ kind: "unknown" })
    expect(state.revalidated).toEqual([])
  })

  it("an HTTP 5xx at completion: 'server', nothing revalidated", async () => {
    state.answers.complete = () => fail(500)
    expect(await run(placeOrder("pp_cod_cod", "pk"))).toEqual({ kind: "server" })
    expect(state.revalidated).toEqual([])
  })

  it("a hung completion ends as 'unknown' after 25 s on the server, under the browser's 30 s (D5)", async () => {
    vi.useFakeTimers()
    try {
      state.answers.complete = () => new Promise(() => {})
      let result: unknown = "waiting"
      void run(placeOrder("pp_cod_cod", "pk")).then((r) => (result = r))
      await vi.advanceTimersByTimeAsync(24_000)
      expect(result).toBe("waiting")
      await vi.advanceTimersByTimeAsync(1_100)
      expect(result).toEqual({ kind: "unknown" })
      const complete = state.calls.find((c) => c.name === "complete")!
      expect((complete.args[1] as { signal?: AbortSignal }).signal?.aborted).toBe(true)
    } finally {
      vi.useRealTimers()
    }
  })
})

describe("findOrderForCart (the order-status route, QA S1-4, D1 and D5)", () => {
  it("a completed cart: completes again, clears the cookie that points to it, and answers its confirmation", async () => {
    state.cart = { ...state.cart, completed_at: "2026-11-11T19:03:36.360Z" }
    expect(await findOrderForCart("cart_1", "pk")).toEqual({
      kind: "order",
      url: "/pk/order/order_01M75ZX01HAMSFCPZ3CD6HF5TA/confirmed",
    })
    expect(state.removedCookie).toBe(true)
    expect(allCartTagsRevalidated()).toBe(true)
    expect(state.revalidated).toContain("orders-visitor")
  })

  it("leaves a cookie that points to another cart", async () => {
    state.cart = { ...state.cart, completed_at: "2026-11-11T19:03:36.360Z" }
    state.cartId = "cart_2"
    await findOrderForCart("cart_1", "pk")
    expect(state.removedCookie).toBe(false)
  })

  it("an open cart: not placed; nothing is completed", async () => {
    expect(await findOrderForCart("cart_1", "pk")).toEqual({ kind: "open" })
    expect(names()).not.toContain("complete")
    expect(state.removedCookie).toBe(false)
  })

  it("a completed cart whose order can't be read now: placed; the cookie stays for the next try", async () => {
    state.cart = { ...state.cart, completed_at: "2026-11-11T19:03:36.360Z" }
    state.answers.complete = () => fail(503)
    expect(await findOrderForCart("cart_1", "pk")).toEqual({ kind: "placed" })
    expect(state.removedCookie).toBe(false)
  })

  it("no answer within its limit: 'no_answer'", async () => {
    vi.useFakeTimers()
    try {
      state.answers.fetch = () => new Promise(() => {})
      let result: unknown = "waiting"
      void findOrderForCart("cart_1", "pk").then((r) => (result = r))
      await vi.advanceTimersByTimeAsync(12_000)
      expect(result).toEqual({ kind: "no_answer" })
    } finally {
      vi.useRealTimers()
    }
  })
})

describe("the order-status route", () => {
  const post = async (body: unknown) => {
    const response = await POST(
      new Request("http://localhost/pk/checkout/order-status", {
        method: "POST",
        body: JSON.stringify(body),
      }),
      { params: Promise.resolve({ countryCode: "pk" }) }
    )
    return response.json()
  }

  it("checks the cart named in the body, else the cart cookie's", async () => {
    state.cart = { ...state.cart, completed_at: "2026-11-11T19:03:36.360Z" }
    state.cartId = null
    expect(await post({ cartId: "cart_1" })).toMatchObject({ kind: "order" })
    expect(state.calls.find((c) => c.name === "fetch")!.args[0]).toBe("/store/carts/cart_1")
    state.calls = []
    state.cartId = "cart_9"
    await post({})
    expect(state.calls.find((c) => c.name === "fetch")!.args[0]).toBe("/store/carts/cart_9")
  })

  it("refuses a body larger than a few kilobytes, unread, and asks the backend nothing (QA S1-4c, m10)", async () => {
    state.cart = { ...state.cart, completed_at: "2026-11-11T19:03:36.360Z" }
    const big = async (body: string, headers: Record<string, string> = {}) =>
      POST(new Request("http://localhost/pk/checkout/order-status", { method: "POST", body, headers }), {
        params: Promise.resolve({ countryCode: "pk" }),
      })
    // a cart id padded to 2 MB, with and without its declared length
    const padded = JSON.stringify({ cartId: "cart_1", pad: "x".repeat(2_000_000) })
    const declared = await big(padded, { "content-length": String(padded.length) })
    expect(declared.status).toBe(413)
    expect(await declared.json()).toEqual({ kind: "cart_lost" })
    const streamed = await big(padded)
    expect(streamed.status).toBe(413)
    expect(state.calls).toEqual([])
    // just under the limit is read as usual
    const fits = JSON.stringify({ cartId: "cart_1", pad: "x".repeat(4000) })
    const ok = await big(fits)
    expect(ok.status).toBe(200)
    expect(await ok.json()).toMatchObject({ kind: "order" })
  })

  it("never passes anything but a cart id to the backend", async () => {
    state.cartId = null
    expect(await post({ cartId: "../orders" })).toEqual({ kind: "cart_lost" })
    expect(state.calls).toEqual([])
    // nor a cookie that doesn't hold a cart id
    state.cartId = "cart_1/../../admin"
    expect(await post({})).toEqual({ kind: "cart_lost" })
    expect(state.calls).toEqual([])
  })
})

describe("adding to a cart that is already an order (QA S1-4, D1)", () => {
  it("never adds a line; answers the order's confirmation and clears the cookie", async () => {
    state.cart = { ...state.cart, completed_at: "2026-11-11T19:03:36.360Z" }
    const result = await addToCartAndConfirm({ variantId: "var_M", quantity: 1, countryCode: "pk" })
    expect(result).toEqual({ ok: false, orderUrl: "/pk/order/order_01M75ZX01HAMSFCPZ3CD6HF5TA/confirmed" })
    expect(names()).not.toContain("createLineItem")
    expect(state.removedCookie).toBe(true)
  })
})

describe("moveCartToRegion (a cart from another region, AC 7)", () => {
  it("moves the cart with the region update and revalidates every cached read of it", async () => {
    expect(await moveCartToRegion("pk")).toBe(true)
    const update = state.calls.find((c) => c.name === "update")!
    expect(update.args[1]).toEqual({ region_id: "reg_pk" })
    expect(allCartTagsRevalidated()).toBe(true)
  })

  it("does nothing without a cart", async () => {
    state.cartId = null
    expect(await moveCartToRegion("pk")).toBe(false)
    expect(names()).not.toContain("update")
  })
})
