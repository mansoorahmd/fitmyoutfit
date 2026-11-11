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
    answers: {} as Record<string, (args: unknown[]) => unknown>,
  },
}))

const fail = (status: number, body: unknown = {}) => {
  throw Object.assign(new Error((body as { message?: string }).message ?? "failed"), { status })
}

const answer = (name: string, args: unknown[]) => {
  state.calls.push({ name, args })
  const custom = state.answers[name]
  if (custom) return custom(args)
  switch (name) {
    case "fetch": {
      const [path] = args as [string]
      if (path.startsWith("/store/carts/")) return { cart: state.cart }
      if (path === "/store/shipping-options") return { shipping_options: [optionPk] }
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

import { moveCartToRegion } from "@lib/data/cart"
import {
  checkOrder,
  choosePayment,
  explainRefusedOrder,
  placeOrder,
  retryDelivery,
  saveAddressStep,
} from "@lib/data/checkout"
import { getCheckoutRules } from "@lib/data/checkout-rules"
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
  vi.mocked(getCheckoutRules).mockResolvedValue(null)
})

describe("saveAddressStep (05, 6.4, 'What happens on save')", () => {
  it("saves the email and both addresses, then adds the region's one delivery option", async () => {
    expect(await saveAddressStep(values())).toEqual({ kind: "saved", delivery: true })
    const update = state.calls.find((c) => c.name === "update")!
    expect(update.args[0]).toBe("cart_1")
    expect(update.args[1]).toMatchObject({
      email: "ali@example.com",
      shipping_address: { first_name: "محمد علی", province: "pk-pb", phone: "0300 1234567" },
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

describe("checkOrder ('Check my order', 05, 6.8 c)", () => {
  it("a completed cart: completing again returns the same order, and the visitor goes to it", async () => {
    state.cart = { ...state.cart, completed_at: "2026-11-11T19:03:36.360Z" }
    state.cartId = null // the cookie went with the order
    expect(await run(checkOrder("cart_1", "pk"))).toEqual({
      redirectedTo: "/pk/order/order_01M75ZX01HAMSFCPZ3CD6HF5TA/confirmed",
    })
  })

  it("an open cart: not placed; nothing is completed", async () => {
    expect(await run(checkOrder("cart_1", "pk"))).toEqual({ kind: "open" })
    expect(names()).not.toContain("complete")
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
