import { beforeEach, describe, expect, it, vi } from "vitest"

// Three security rules QA removed one at a time without a test failing
// (QA S1-4c, S3): the account's order page refuses another customer's
// order, a signed-out visitor is sent to sign-in, and sign-out lets the
// cart go. A fake backend behind the SDK and fakes of the cookies.

const { state } = vi.hoisted(() => ({
  state: {
    fetch: null as null | ((path: string) => unknown),
    token: null as string | null,
    cartId: "cart_1" as string | null,
    removed: [] as string[],
    redirected: [] as string[],
  },
}))

vi.mock("@lib/config", () => ({
  sdk: { client: { fetch: async (path: string) => state.fetch!(path) } },
}))
vi.mock("@lib/data/cookies", () => ({
  getAuthHeaders: async () => (state.token ? { authorization: `Bearer ${state.token}` } : {}),
  getCacheOptions: async (tag: string) => ({ tags: [`${tag}-visitor`] }),
  getCacheTag: async (tag: string) => `${tag}-visitor`,
  getCartId: async () => state.cartId,
  setAuthToken: async () => {},
  removeAuthToken: async () => {
    state.removed.push("auth")
    state.token = null
  },
  removeCartId: async () => {
    state.removed.push("cart")
    state.cartId = null
  },
}))
vi.mock("next/cache", () => ({ revalidateTag: () => {} }))
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    state.redirected.push(url)
    throw Object.assign(new Error("NEXT_REDIRECT"), { url })
  },
}))

import { signout } from "@lib/data/customer"
import { retrieveAccountOrder } from "@lib/data/orders"
import { requireCustomer } from "@modules/account/require-customer"

beforeEach(() => {
  state.fetch = null
  state.token = "tok_a"
  state.cartId = "cart_1"
  state.removed = []
  state.redirected = []
})

describe("the account's order page: only the customer's own order (05, 7.3)", () => {
  const order = (customerId: string | null) => ({ id: "order_1", display_id: 7, customer_id: customerId })

  it("another customer's order, or a guest's, is 'not found', although Medusa gives it to anyone with the id", async () => {
    state.fetch = (path) => (path.endsWith("/delivery-promise") ? { delivery_promise: null } : { order: order("cus_b") })
    expect(await retrieveAccountOrder("order_1", "cus_a")).toEqual({ kind: "not_found" })
    state.fetch = (path) => (path.endsWith("/delivery-promise") ? { delivery_promise: null } : { order: order(null) })
    expect(await retrieveAccountOrder("order_1", "cus_a")).toEqual({ kind: "not_found" })
  })

  it("the customer's own order is found", async () => {
    state.fetch = (path) => (path.endsWith("/delivery-promise") ? { delivery_promise: null } : { order: order("cus_a") })
    const found = await retrieveAccountOrder("order_1", "cus_a")
    expect(found.kind).toBe("found")
  })
})

describe("a signed-out visitor on an inner account page goes to sign-in, and back afterwards", () => {
  it("no sign-in: redirected to sign-in with next", async () => {
    state.token = null
    await expect(requireCustomer("pk", "/account/orders")).rejects.toMatchObject({ url: expect.any(String) })
    expect(state.redirected).toEqual(["/pk/account?view=signin&next=%2Faccount%2Forders"])
  })

  it("an expired sign-in (401) too", async () => {
    state.fetch = () => {
      throw Object.assign(new Error("Unauthorized"), { status: 401 })
    }
    await expect(requireCustomer("pk", "/account/profile")).rejects.toMatchObject({ url: expect.any(String) })
    expect(state.redirected).toEqual(["/pk/account?view=signin&next=%2Faccount%2Fprofile"])
  })

  it("signed in: the customer, no redirect; the store not answering: null (the server-error block)", async () => {
    state.fetch = () => ({ customer: { id: "cus_a", email: "a@b.co" } })
    expect(await requireCustomer("pk", "/account/orders")).toMatchObject({ id: "cus_a" })
    state.fetch = () => {
      throw Object.assign(new Error("down"), { status: 503 })
    }
    expect(await requireCustomer("pk", "/account/orders")).toBeNull()
    expect(state.redirected).toEqual([])
  })
})

describe("sign-out lets the cart go with the sign-in (05, 9.1)", () => {
  it("removes the sign-in cookie and the cart cookie", async () => {
    expect(await signout("pk")).toEqual({ href: "/pk/account" })
    expect(state.removed).toEqual(["auth", "cart"])
    expect(state.cartId).toBeNull()
  })
})
