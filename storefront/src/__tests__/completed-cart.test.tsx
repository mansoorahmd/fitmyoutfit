import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { isValidElement } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { checkoutCartPk } from "./fixtures/m1-checkout"

// A cart that is already an order (QA S1-4, D1): the answer to "Place
// order" was lost after the order was made. Wherever the storefront meets
// it, the order opens; the ordered cart is never shown as a live one.

const { data, nav, status } = vi.hoisted(() => ({
  data: {
    pageCart: null as any,
    checkoutCart: null as any,
    headerCart: null as any,
  },
  nav: { replaced: [] as string[], refreshed: 0, redirected: [] as string[] },
  status: { answers: [] as unknown[], requests: [] as { url: string; body: unknown }[] },
}))

vi.mock("@lib/data/cart", () => ({
  retrieveCartForPage: async () => ({ cart: data.pageCart, failed: false }),
  retrieveCart: async () => data.headerCart,
  listCartOptions: async () => ({ shipping_options: [] }),
}))
vi.mock("@lib/data/checkout", () => ({
  retrieveCheckoutCart: async () => ({ cart: data.checkoutCart, failed: false }),
  listRegionPaymentProviders: async () => [],
}))
vi.mock("@lib/data/customer", () => ({ retrieveCustomer: async () => null }))
vi.mock("@lib/data/checkout-rules", () => ({ getCheckoutRules: async () => null }))
vi.mock("@lib/data/collections", () => ({ getGarmentsCollection: async () => undefined }))
vi.mock("@lib/data/fulfillment", () => ({ listCartShippingMethods: async () => [] }))
vi.mock("@lib/data/regions", () => ({
  getRegion: async () => ({ id: "reg_pk", countries: [{ iso_2: "pk", display_name: "Pakistan" }] }),
}))
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    replace: (href: string) => nav.replaced.push(href),
    push: (href: string) => nav.replaced.push(href),
    refresh: () => {
      nav.refreshed += 1
    },
  }),
  redirect: (url: string) => {
    nav.redirected.push(url)
    throw Object.assign(new Error("NEXT_REDIRECT"), { url })
  },
}))

import CartPage from "../app/[countryCode]/(main)/cart/page"
import CheckoutPage from "../app/[countryCode]/(checkout)/checkout/page"
import CompletedCartRecovery from "@modules/checkout/components/completed-cart"
import CartButton from "@modules/layout/components/cart-button"
import CartPanel from "@modules/layout/components/cart-panel"

const ordered = () => checkoutCartPk({ completed_at: "2026-11-12T10:00:00.000Z" })
const params = { params: Promise.resolve({ countryCode: "pk" }) }

beforeEach(() => {
  data.pageCart = null
  data.checkoutCart = null
  data.headerCart = null
  nav.replaced = []
  nav.refreshed = 0
  nav.redirected = []
  status.answers = []
  status.requests = []
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      status.requests.push({ url, body: JSON.parse(String(init.body)) })
      const next = status.answers.shift() ?? { kind: "no_answer" }
      return new Response(JSON.stringify(next), { status: 200 })
    })
  )
})

/** The element a server component returned, or each child of a fragment. */
const parts = (element: unknown): unknown[] => {
  if (!isValidElement(element)) return []
  const children = (element.props as { children?: unknown }).children
  return [element, ...(Array.isArray(children) ? children.flatMap(parts) : parts(children))]
}

describe("pages that meet an ordered cart", () => {
  it("the cart page shows the order opening, never the ordered cart (it used to show it as live)", async () => {
    data.pageCart = ordered()
    const page = await CartPage(params)
    expect(isValidElement(page) && page.type).toBe(CompletedCartRecovery)
    expect((page as { props: { countryCode: string } }).props.countryCode).toBe("pk")
    // the cart it met goes with the request (QA S1-4c, m1)
    expect((page as { props: { cartId: string } }).props.cartId).toBe(ordered().id)
  })

  it("the checkout opens the order instead of sending the customer to the cart (the loop)", async () => {
    data.checkoutCart = ordered()
    const page = await CheckoutPage(params)
    expect(isValidElement(page) && page.type).toBe(CompletedCartRecovery)
    expect((page as { props: { cartId: string } }).props.cartId).toBe(ordered().id)
    expect(nav.redirected).toEqual([])
  })

  it("the header's cart counts an ordered cart as empty and opens its order quietly", async () => {
    data.headerCart = ordered()
    const found = parts(await CartButton({ countryCode: "pk" }))
    const panel = found.find((e) => isValidElement(e) && e.type === CartPanel) as { props: { count: number } }
    expect(panel.props.count).toBe(0)
    const recovery = found.find((e) => isValidElement(e) && e.type === CompletedCartRecovery) as {
      props: { quiet?: boolean; cartId?: string }
    }
    expect(recovery.props.quiet).toBe(true)
    expect(recovery.props.cartId).toBe(ordered().id)
  })

  it("a live cart is shown as it is", async () => {
    data.headerCart = checkoutCartPk()
    const found = parts(await CartButton({ countryCode: "pk" }))
    expect(found.some((e) => isValidElement(e) && e.type === CompletedCartRecovery)).toBe(false)
  })
})

describe("CompletedCartRecovery", () => {
  it("asks the order-status route with the cart cookie and opens the confirmation", async () => {
    status.answers = [{ kind: "order", url: "/pk/order/order_1/confirmed" }]
    render(<CompletedCartRecovery countryCode="pk" />)
    expect(screen.getByTestId("completed-cart-opening")).toHaveTextContent("Your order is placed")
    expect(screen.getByTestId("completed-cart-opening")).toHaveTextContent("Opening your order…")
    await waitFor(() => expect(nav.replaced).toEqual(["/pk/order/order_1/confirmed"]))
    expect(status.requests).toEqual([{ url: "/pk/checkout/order-status", body: { cartId: null } }])
  })

  it("a second tab, whose cookie the first tab's answer already cleared, still reaches the order: the cart id goes with the request (QA S1-4c, m1)", async () => {
    status.answers = [{ kind: "order", url: "/pk/order/order_1/confirmed" }]
    render(<CompletedCartRecovery countryCode="pk" cartId="cart_01TWOTAB" />)
    await waitFor(() => expect(nav.replaced).toEqual(["/pk/order/order_1/confirmed"]))
    expect(status.requests).toEqual([{ url: "/pk/checkout/order-status", body: { cartId: "cart_01TWOTAB" } }])
    expect(screen.queryByText("Your cart is empty")).toBeNull()
  })

  it("when the order can't be opened now: says it is placed, with Try again", async () => {
    status.answers = [{ kind: "placed" }, { kind: "order", url: "/pk/order/order_1/confirmed" }]
    render(<CompletedCartRecovery countryCode="pk" />)
    const failed = await screen.findByTestId("completed-cart-failed")
    expect(failed).toHaveTextContent("Your order is placed")
    expect(failed).toHaveTextContent("We couldn't open it just now. Check your connection and try again.")
    await act(async () => {
      fireEvent.click(screen.getByTestId("completed-cart-retry"))
    })
    await waitFor(() => expect(nav.replaced).toEqual(["/pk/order/order_1/confirmed"]))
  })

  it("quiet (the header): shows nothing, and still opens the order", async () => {
    status.answers = [{ kind: "order", url: "/pk/order/order_1/confirmed" }]
    const { container } = render(<CompletedCartRecovery countryCode="pk" quiet />)
    expect(container).toBeEmptyDOMElement()
    await waitFor(() => expect(nav.replaced).toEqual(["/pk/order/order_1/confirmed"]))
  })

  it("one request per page, however many parts meet the cart", async () => {
    status.answers = [{ kind: "order", url: "/pk/order/order_1/confirmed" }]
    render(
      <>
        <CompletedCartRecovery countryCode="pk" />
        <CompletedCartRecovery countryCode="pk" quiet />
      </>
    )
    await waitFor(() => expect(nav.replaced.length).toBeGreaterThan(0))
    expect(status.requests).toHaveLength(1)
  })
})
