import React from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { optionPk, providersPk } from "./fixtures/m1-checkout"
import { checkoutCartPkRush, rulesPkRushInCart, rushLine, tshirtLine } from "./fixtures/rush"

// The cart page and the checkout read the cart and the rules on the server.
// After staff changed the rush percentage, the cart's rush line keeps its
// old figure until something prices the cart again (S1-6d, point 1): the
// pages ask the backend to price it (POST rush on a cart that has it), read
// the cart and the rules again, and pass on one cart and its rules. If the
// call fails, the card shows the line's own amount.

const { backend } = vi.hoisted(() => ({
  backend: {
    cart: null as any,
    cartAfter: null as any,
    rules: null as any,
    rulesAfter: null as any,
    repriced: false,
    repriceAnswer: true,
    repriceCalls: 0,
    dropCalls: 0,
  },
}))

vi.mock("@lib/data/cart", () => ({
  retrieveCartForPage: async ({ again = false }: { again?: boolean } = {}) => ({
    cart: backend.repriced && again ? backend.cartAfter : backend.cart,
    failed: false,
  }),
  listCartOptions: async () => ({ shipping_options: [optionPk] }),
}))
vi.mock("@lib/data/checkout", () => ({
  retrieveCheckoutCart: async ({ again = false }: { again?: boolean } = {}) => ({
    cart: backend.repriced && again ? backend.cartAfter : backend.cart,
    failed: false,
  }),
  listRegionPaymentProviders: async () => providersPk,
}))
vi.mock("@lib/data/checkout-rules", () => ({
  getCheckoutRules: async (_id: string, { again = false }: { again?: boolean } = {}) =>
    backend.repriced && again ? backend.rulesAfter : backend.rules,
}))
vi.mock("@lib/data/rush", () => ({
  repriceRush: async () => {
    backend.repriceCalls += 1
    backend.repriced = backend.repriceAnswer
    return backend.repriceAnswer
  },
  dropStaleRush: async () => {
    backend.dropCalls += 1
    return true
  },
}))
vi.mock("@lib/data/collections", () => ({ getGarmentsCollection: async () => undefined }))
vi.mock("@lib/data/customer", () => ({ retrieveCustomer: async () => null }))
vi.mock("@lib/data/fulfillment", () => ({ listCartShippingMethods: async () => [optionPk] }))
vi.mock("@lib/data/regions", () => ({
  getRegion: async () => ({
    id: "reg_01M75ZSJCEAN5W09D9MF1WAPCB",
    countries: [{ iso_2: "pk", display_name: "Pakistan" }],
  }),
}))
vi.mock("next/navigation", () => ({
  redirect: () => {
    throw new Error("redirected")
  },
}))

import { parseCheckoutRules } from "@lib/util/checkout-rules"
import Checkout from "../app/[countryCode]/(checkout)/checkout/page"
import Cart from "../app/[countryCode]/(main)/cart/page"

const plain = (s: string | null | undefined) => s?.replace(/\s/g, " ")

// 3 T-shirts at PKR 2,000; the line says PKR 1,200 (20%), the rules say PKR 466 (7.77%)
const garments = tshirtLine({ quantity: 3, subtotal: 6000, total: 6000 })
const cartWith = (rush: number) =>
  checkoutCartPkRush({
    items: [garments, rushLine({ unit_price: rush, subtotal: rush, total: rush })],
    item_subtotal: 6000 + rush,
    total: 6000 + rush + 250,
  })
const rulesWith = (amount: number) =>
  parseCheckoutRules({ ...rulesPkRushInCart, rush: { ...rulesPkRushInCart.rush, percentage: 7.77, amount } })

/** The first element in a rendered tree whose props satisfy `test`. */
const find = (node: any, test: (props: any) => boolean): any => {
  if (!node || typeof node !== "object") return null
  if (Array.isArray(node)) {
    for (const child of node) {
      const hit = find(child, test)
      if (hit) return hit
    }
    return null
  }
  if (node.props && test(node.props)) return node
  return node.props ? find(node.props.children, test) : null
}

const cartPageProps = async () => {
  const tree = await Cart({ params: Promise.resolve({ countryCode: "pk" }) })
  return find(tree, (p) => p.cart && "rules" in p).props
}
const checkoutProps = async () => {
  const tree = await Checkout({ params: Promise.resolve({ countryCode: "pk" }) })
  return tree.props.view
}

beforeEach(() => {
  backend.cart = cartWith(1200)
  backend.cartAfter = cartWith(466)
  backend.rules = rulesWith(466)
  backend.rulesAfter = rulesWith(466)
  backend.repriced = false
  backend.repriceAnswer = true
  backend.repriceCalls = 0
  backend.dropCalls = 0
})

describe("the cart page after staff changed the rush percentage", () => {
  it("asks the backend to price the line again and shows the cart it then reads", async () => {
    const props = await cartPageProps()
    expect(backend.repriceCalls).toBe(1)
    expect(props.cart.total).toBe(6716)
    expect(props.cart.items[1].subtotal).toBe(466)
    expect(props.rules.rush.amount).toBe(466)
  })

  it("a cart that is in line is not touched", async () => {
    backend.cart = cartWith(466)
    await cartPageProps()
    expect(backend.repriceCalls).toBe(0)
  })

  it("when the backend can't be asked, the cart stays as read and the card shows the line's amount", async () => {
    backend.repriceAnswer = false
    const props = await cartPageProps()
    expect(backend.repriceCalls).toBe(1)
    expect(props.cart.total).toBe(7450)
    const { cartPageView } = await import("@lib/util/cart-page")
    const view = cartPageView({ ...props, shippingOptions: [optionPk] })
    expect(plain(view.rushControl?.amount)).toBe("PKR 1,200")
    expect(plain(view.rush)).toBe("PKR 1,200")
  })
})

describe("the checkout after staff changed the rush percentage", () => {
  it("asks the backend to price the line again; the card, the row and the total are the new cart's", async () => {
    const view = await checkoutProps()
    expect(backend.repriceCalls).toBe(1)
    expect(plain(view.rushControl?.amount)).toBe("PKR 466")
    expect(view.totalAmount).toBe(6716)
  })

  it("a cart that is in line is not touched", async () => {
    backend.cart = cartWith(466)
    await checkoutProps()
    expect(backend.repriceCalls).toBe(0)
  })

  it("when the backend can't be asked, the card shows the line's amount, the total is still the cart's", async () => {
    backend.repriceAnswer = false
    const view = await checkoutProps()
    expect(plain(view.rushControl?.amount)).toBe("PKR 1,200")
    expect(view.totalAmount).toBe(7450)
  })
})
