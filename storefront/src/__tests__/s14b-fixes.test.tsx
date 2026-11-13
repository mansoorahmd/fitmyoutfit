import { act, fireEvent, render, screen, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { customer } from "./fixtures/account"
import {
  checkoutCartPk,
  optionPk,
  orderPk,
  orderPromisePk,
  providersPk,
  rulesPkAvailable,
} from "./fixtures/m1-checkout"

// The rest of QA's S1-4 list, one block per defect: D2, D3, D4, D10, D12,
// D14 (the form and the confirmation's link), D15 (the order's country)
// and the footer seen signed in.

const { nav, backend, moves, who } = vi.hoisted(() => ({
  nav: { step: "address" as string | null, replaced: [] as string[], refreshed: 0, redirected: [] as string[], pathname: "/pk/checkout" },
  backend: { fetch: null as null | ((path: string, init: Record<string, unknown>) => unknown) },
  moves: { result: true },
  who: { customer: null as null | { id: string } },
}))

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: (href: string) => nav.replaced.push(href),
    replace: (href: string) => nav.replaced.push(href),
    refresh: () => {
      nav.refreshed += 1
    },
  }),
  useSearchParams: () => new URLSearchParams(nav.step ? `step=${nav.step}` : ""),
  useParams: () => ({ countryCode: "pk" }),
  usePathname: () => nav.pathname,
  redirect: (url: string) => {
    nav.redirected.push(url)
    throw Object.assign(new Error("NEXT_REDIRECT"), { url })
  },
  notFound: () => {
    throw Object.assign(new Error("NEXT_NOT_FOUND"), { notFound: true })
  },
}))
vi.mock("next/image", () => ({
  // eslint-disable-next-line @next/next/no-img-element
  default: ({ src, alt }: { src: string; alt: string }) => <img src={src} alt={alt} />,
}))
vi.mock("@lib/config", () => ({
  sdk: { client: { fetch: (path: string, init: Record<string, unknown>) => backend.fetch!(path, init) } },
}))
vi.mock("@lib/data/cookies", () => ({ getAuthHeaders: async () => ({}) }))
vi.mock("@lib/data/customer", () => ({ retrieveCustomer: async () => who.customer }))
vi.mock("@lib/data/regions", () => ({
  getRegion: async (cc: string) => ({ id: `reg_${cc}`, countries: [{ iso_2: cc, display_name: cc.toUpperCase() }] }),
  listRegions: async () => [
    { id: "reg_pk", countries: [{ iso_2: "pk" }] },
    { id: "reg_us", countries: [{ iso_2: "us" }] },
  ],
}))
vi.mock("@lib/data/cart", () => ({
  moveCartToRegion: async () => moves.result,
  updateRegion: async () => {},
}))
vi.mock("@lib/data/checkout", () => ({
  saveAddressStep: async () => ({ kind: "saved", delivery: true }),
  retryDelivery: async () => ({ ok: true }),
  choosePayment: async () => ({ ok: true }),
  placeOrder: async () => ({ kind: "refused" }),
  explainRefusedOrder: async () => ({ kind: "generic" }),
}))
vi.mock("@lib/data/garment-links", () => ({ listGarmentLinks: async () => [] }))

import OrderConfirmedPage from "../app/[countryCode]/(main)/order/[id]/confirmed/page"
import { getOrderDeliveryPromise, retrieveOrderForConfirmation } from "@lib/data/order-confirmation"
import { parseCheckoutRules } from "@lib/util/checkout-rules"
import { checkoutView } from "@lib/util/checkout-view"
import {
  confirmationElsewhere,
  orderBelongsTo,
  orderConfirmationView,
  orderReadFailure,
  parseOrderPromise,
} from "@lib/util/order-confirmation"
import { REGION_MOVED_KEY, regionMovedNote, showsRegionMoved } from "@lib/util/region-moved"
import CartSummary from "@modules/cart/components/cart-summary"
import MoveCartToRegion from "@modules/cart/components/move-cart-to-region"
import RegionMovedNotice from "@modules/cart/components/region-moved-notice"
import PageError from "@modules/checkout/components/page-error"
import CheckoutPage from "@modules/checkout/templates/checkout-page"
import ServerError from "@modules/common/components/server-error"
import Footer from "@modules/layout/templates/footer"
import OrderCompletedTemplate from "@modules/order/templates/order-completed-template"

const fail = (status?: number) => {
  throw Object.assign(new Error("failed"), status ? { status } : {})
}

beforeEach(() => {
  nav.step = "address"
  nav.replaced = []
  nav.refreshed = 0
  nav.redirected = []
  nav.pathname = "/pk/checkout"
  backend.fetch = null
  moves.result = true
  who.customer = null
  sessionStorage.clear()
})

afterEach(() => {
  vi.useRealTimers()
})

describe("D2: a placed order's date shows without 'Counted from today'", () => {
  const NOTE = "Counted from today"

  it("the confirmation shows the kept date without the note", () => {
    render(
      <OrderCompletedTemplate
        view={orderConfirmationView({ order: orderPk, promise: parseOrderPromise(orderPromisePk) })}
        ownOrder={false}
      />
    )
    expect(screen.getByTestId("order-delivery-date")).toHaveTextContent("Delivered by")
    expect(document.body.textContent).not.toContain(NOTE)
  })

  it("the cart and checkout keep it", () => {
    render(
      <CartSummary
        pieces={1}
        itemSubtotal="PKR 2,000"
        total="PKR 2,000"
        delivery={null}
        showTaxNote={false}
        deliveryDate="2026-11-27"
        rulesFailed={false}
        codLimit={null}
        minimum={null}
        updating={false}
      />
    )
    expect(screen.getByTestId("delivery-date-line")).toHaveTextContent(NOTE)
  })
})

describe("D3 and D4: reading the order and its date", () => {
  it("not found only for a 4xx; no answer or a 5xx is a failure", () => {
    expect(orderReadFailure(404)).toEqual({ kind: "not_found" })
    expect(orderReadFailure(400)).toEqual({ kind: "not_found" })
    expect(orderReadFailure(500)).toEqual({ kind: "failed" })
    expect(orderReadFailure(undefined)).toEqual({ kind: "failed" })
  })

  it("retrieveOrderForConfirmation tells the three apart", async () => {
    backend.fetch = () => ({ order: orderPk })
    expect((await retrieveOrderForConfirmation("order_1")).kind).toBe("found")
    backend.fetch = () => fail(404)
    expect(await retrieveOrderForConfirmation("order_1")).toEqual({ kind: "not_found" })
    backend.fetch = () => fail()
    expect(await retrieveOrderForConfirmation("order_1")).toEqual({ kind: "failed" })
  })

  it("the page: the server-error block when the backend doesn't answer, never 'can't find'", async () => {
    backend.fetch = () => fail()
    const page = await OrderConfirmedPage({ params: Promise.resolve({ id: "order_1", countryCode: "pk" }) })
    expect((page as { type: unknown }).type).toBe(ServerError)
    backend.fetch = () => fail(404)
    await expect(
      OrderConfirmedPage({ params: Promise.resolve({ id: "order_1", countryCode: "pk" }) })
    ).rejects.toMatchObject({ notFound: true })
  })

  it("the date waits 4 s at most, then the page goes on without it (W-O11b)", async () => {
    vi.useFakeTimers()
    let signal: AbortSignal | undefined
    backend.fetch = (_path, init) => {
      signal = init.signal as AbortSignal
      return new Promise(() => {})
    }
    let result: unknown = "waiting"
    void getOrderDeliveryPromise("order_1").then((r) => (result = r))
    await vi.advanceTimersByTimeAsync(3_999)
    expect(result).toBe("waiting")
    await vi.advanceTimersByTimeAsync(1)
    expect(result).toBeNull()
    expect(signal?.aborted).toBe(true)
  })
})

describe("D15: an order opened under another country's address", () => {
  it("goes to the same order under its own country", () => {
    expect(
      confirmationElsewhere({ orderId: "order_1", orderCountry: "us", urlCountry: "pk", storeCountries: ["pk", "us"] })
    ).toBe("/us/order/order_1/confirmed")
    expect(
      confirmationElsewhere({ orderId: "order_1", orderCountry: "pk", urlCountry: "pk", storeCountries: ["pk", "us"] })
    ).toBeNull()
    expect(
      confirmationElsewhere({ orderId: "order_1", orderCountry: "fr", urlCountry: "pk", storeCountries: ["pk", "us"] })
    ).toBeNull()
  })

  it("the page redirects there", async () => {
    backend.fetch = (path) =>
      path.endsWith("/delivery-promise")
        ? orderPromisePk
        : { order: { ...orderPk, shipping_address: { ...orderPk.shipping_address, country_code: "us" } } }
    await expect(
      OrderConfirmedPage({ params: Promise.resolve({ id: orderPk.id, countryCode: "pk" }) })
    ).rejects.toMatchObject({ url: `/us/order/${orderPk.id}/confirmed` })
  })
})

describe("D14: 'See all your orders' only on the customer's own order", () => {
  it("compares the order's customer with the signed-in one", () => {
    expect(orderBelongsTo({ customer_id: "cus_1" }, { id: "cus_1" })).toBe(true)
    expect(orderBelongsTo({ customer_id: "cus_guest" }, { id: "cus_1" })).toBe(false)
    expect(orderBelongsTo({ customer_id: "cus_1" }, null)).toBe(false)
    expect(orderBelongsTo({ customer_id: null }, { id: "cus_1" })).toBe(false)
  })

  it("a guest's order viewed signed out gets the guest's box", () => {
    render(<OrderCompletedTemplate view={orderConfirmationView({ order: orderPk, promise: null })} ownOrder={false} />)
    expect(screen.queryByRole("link", { name: "See all your orders" })).toBeNull()
    expect(screen.getByRole("link", { name: "Create an account" })).toBeInTheDocument()
  })

  it("signed in, someone else's or a guest's order: neither 'See all your orders' nor 'Create an account' (QA S1-4c, m6)", () => {
    render(
      <OrderCompletedTemplate view={orderConfirmationView({ order: orderPk, promise: null })} ownOrder={false} signedIn />
    )
    expect(screen.queryByRole("link", { name: "See all your orders" })).toBeNull()
    expect(screen.queryByRole("link", { name: "Create an account" })).toBeNull()
    expect(screen.queryByTestId("order-create-account")).toBeNull()
    expect(screen.getByTestId("back-to-store")).toBeInTheDocument()
  })

  it("the page tells the template whether a customer is signed in", async () => {
    backend.fetch = (path) => (path.endsWith("/delivery-promise") ? orderPromisePk : { order: orderPk })
    const page = await OrderConfirmedPage({ params: Promise.resolve({ id: orderPk.id, countryCode: "pk" }) })
    expect((page as { props: { signedIn: boolean } }).props.signedIn).toBe(false)
    who.customer = { id: "cus_someone_else" }
    const signed = await OrderConfirmedPage({ params: Promise.resolve({ id: orderPk.id, countryCode: "pk" }) })
    expect((signed as { props: { signedIn: boolean; ownOrder: boolean } }).props).toMatchObject({
      signedIn: true,
      ownOrder: false,
    })
  })
})

describe("D14: saved addresses in the checkout form", () => {
  const second = {
    ...customer.addresses[0],
    id: "cuaddr_2",
    is_default_shipping: false,
    is_default_billing: false,
    first_name: "Team",
    last_name: "Treasurer",
    address_1: "7 Canal Bank",
    phone: "0321 7654321",
  }
  const signedIn = () =>
    checkoutView({
      cart: checkoutCartPk({ id: "cart_d14", email: null, shipping_address: null, billing_address: null, shipping_methods: [] }),
      rules: parseCheckoutRules(rulesPkAvailable),
      shippingOptions: [optionPk],
      providerIds: providersPk,
      customer: { ...customer, first_name: "Ali", last_name: "Raza", addresses: [customer.addresses[0], second] },
      countryCode: "pk",
    })

  it("choosing the second address brings its own phone", () => {
    render(<CheckoutPage view={signedIn()} />)
    expect(screen.getByLabelText("Phone")).toHaveValue("0300 1234567")
    fireEvent.click(screen.getByLabelText(/7 Canal Bank/))
    expect(screen.getByLabelText("Phone")).toHaveValue("0321 7654321")
  })

  it("'Use a new address' opens empty apart from the account's name", () => {
    render(<CheckoutPage view={signedIn()} />)
    fireEvent.click(screen.getByLabelText("Use a new address"))
    expect(screen.getByLabelText("First name")).toHaveValue("Ali")
    expect(screen.getByLabelText("Last name (optional)")).toHaveValue("Raza")
    expect(screen.getByLabelText("House and street")).toHaveValue("")
    expect(screen.getByLabelText("City")).toHaveValue("")
  })

  it("an account with nothing saved starts from the account's name too", () => {
    const view = checkoutView({
      cart: checkoutCartPk({ id: "cart_d14b", email: null, shipping_address: null, billing_address: null, shipping_methods: [] }),
      rules: parseCheckoutRules(rulesPkAvailable),
      shippingOptions: [optionPk],
      providerIds: providersPk,
      customer: { ...customer, first_name: "Bilal", last_name: "Ahmed", addresses: [] },
      countryCode: "pk",
    })
    expect(view.address.initial.shipping).toMatchObject({ first_name: "Bilal", last_name: "Ahmed", address_1: "" })
  })

  it("fields have their maximum lengths", () => {
    render(<CheckoutPage view={signedIn()} />)
    fireEvent.click(screen.getByLabelText("Use a new address"))
    expect(screen.getByLabelText("House and street")).toHaveAttribute("maxlength", "200")
    expect(screen.getByLabelText("First name")).toHaveAttribute("maxlength", "100")
    expect(screen.getByLabelText("Email")).toHaveAttribute("maxlength", "254")
  })
})

describe("D10: the cart moved to another region", () => {
  it("the note is read once, only by the country the cart moved to, and not when stale", () => {
    const note = regionMovedNote("PK", 1_000)
    expect(showsRegionMoved(note, "pk", 2_000)).toBe(true)
    expect(showsRegionMoved(note, "gb", 2_000)).toBe(false)
    expect(showsRegionMoved(note, "pk", 1_000 + 6 * 60_000)).toBe(false)
    expect(showsRegionMoved("not json", "pk", 2_000)).toBe(false)
    expect(showsRegionMoved(null, "pk", 2_000)).toBe(false)
  })

  it("the checkout's move keeps the note and opens step 1 (step=address in the URL)", async () => {
    await act(async () => {
      render(<MoveCartToRegion countryCode="pk" fallback={<p>skeleton</p>} then="/pk/checkout?step=address" />)
    })
    expect(nav.replaced).toEqual(["/pk/checkout?step=address"])
    expect(showsRegionMoved(sessionStorage.getItem(REGION_MOVED_KEY), "pk", Date.now())).toBe(true)
  })

  it("the page it lands on says so once: the country, the currency, choose address and delivery again", async () => {
    sessionStorage.setItem(REGION_MOVED_KEY, regionMovedNote("pk", Date.now()))
    const { unmount } = render(<RegionMovedNotice countryCode="pk" countryName="Pakistan" currencyCode="pkr" />)
    const notice = await screen.findByTestId("region-moved-notice")
    expect(notice).toHaveTextContent("Your cart is now for Pakistan")
    expect(notice).toHaveTextContent("Prices are in PKR. Choose the delivery address and delivery again at checkout.")
    unmount()
    render(<RegionMovedNotice countryCode="pk" countryName="Pakistan" currencyCode="pkr" />)
    expect(screen.queryByTestId("region-moved-notice")).toBeNull()
  })

  it("a URL asking for step 2 while step 1 is open is corrected to step=address", () => {
    nav.step = "payment"
    render(
      <CheckoutPage
        view={checkoutView({
          cart: checkoutCartPk({ email: null, shipping_address: null, shipping_methods: [] }),
          rules: parseCheckoutRules(rulesPkAvailable),
          shippingOptions: [optionPk],
          providerIds: providersPk,
          customer: null,
          countryCode: "pk",
        })}
      />
    )
    expect(nav.replaced).toEqual(["/pk/checkout?step=address"])
  })
})

describe("D12: the error boundary of the checkout and order pages", () => {
  it("offline: says the order may have gone through, and loads the page again when back online", () => {
    const online = vi.spyOn(navigator, "onLine", "get").mockReturnValue(false)
    const reload = vi.fn()
    const location = window.location
    Object.defineProperty(window, "location", { configurable: true, value: { ...location, reload } })
    try {
      render(<PageError orderPage />)
      const alert = screen.getByTestId("page-error-alert")
      expect(alert).toHaveTextContent("You're offline")
      expect(alert).toHaveTextContent("If you pressed Place order, your order may have gone through.")
      expect(alert).toHaveTextContent("When you're back online, this page loads again")
      expect(reload).not.toHaveBeenCalled()
      online.mockReturnValue(true)
      act(() => {
        window.dispatchEvent(new Event("online"))
      })
      expect(reload).toHaveBeenCalled()
    } finally {
      Object.defineProperty(window, "location", { configurable: true, value: location })
      online.mockRestore()
    }
  })

  it("elsewhere in the store: only the plain message", () => {
    render(<PageError orderPage={false} />)
    expect(screen.getByTestId("page-error-alert")).not.toHaveTextContent("Place order")
    expect(within(screen.getByTestId("page-error-alert")).getByRole("button")).toHaveTextContent("Load the page again")
  })
})

describe("the footer seen signed in", () => {
  it("says 'Your account', never 'Sign in'", async () => {
    render(await Footer({ countryCode: "pk", signedIn: true }))
    const account = within(screen.getByTestId("footer-account"))
    expect(account.getByRole("link", { name: "Your account" })).toHaveAttribute("href", "/pk/account")
    expect(account.queryByRole("link", { name: "Sign in" })).toBeNull()
  })

  it("signed out: 'Sign in'", async () => {
    render(await Footer({ countryCode: "pk" }))
    expect(within(screen.getByTestId("footer-account")).getByRole("link", { name: "Sign in" })).toBeInTheDocument()
  })
})
