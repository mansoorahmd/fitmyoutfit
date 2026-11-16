import { act, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from "vitest"

import { customer } from "./fixtures/account"
import { checkoutCartPk, optionPk, providersPk, rulesPkAvailable } from "./fixtures/m1-checkout"

// QA's eleventh review (S1-4c): the items that need a page or a component.
// The rules themselves are tested next to their modules.

const { nav, saves } = vi.hoisted(() => ({
  nav: { step: "address" as string | null, replaced: [] as string[], pathname: "/pk/checkout" },
  saves: { calls: [] as { saveToAccount: boolean; address_1: string }[] },
}))

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: (href: string) => nav.replaced.push(href),
    replace: (href: string) => nav.replaced.push(href),
    refresh: () => {},
  }),
  useSearchParams: () => new URLSearchParams(nav.step ? `step=${nav.step}` : ""),
  useParams: () => ({ countryCode: "pk" }),
  usePathname: () => nav.pathname,
}))
vi.mock("next/image", () => ({
  // eslint-disable-next-line @next/next/no-img-element
  default: ({ src, alt }: { src: string; alt: string }) => <img src={src} alt={alt} />,
}))
vi.mock("@lib/data/checkout", () => ({
  saveAddressStep: async (values: { saveToAccount: boolean; shipping: { address_1: string } }) => {
    saves.calls.push({ saveToAccount: values.saveToAccount, address_1: values.shipping.address_1 })
    return { kind: "saved", delivery: true }
  },
  retryDelivery: async () => ({ ok: true }),
  choosePayment: async () => ({ ok: true }),
  placeOrder: async () => ({ kind: "refused" }),
  explainRefusedOrder: async () => ({ kind: "generic" }),
}))

import { parseCheckoutRules } from "@lib/util/checkout-rules"
import { checkoutView } from "@lib/util/checkout-view"
import { keepAddressDraft } from "@modules/checkout/step-memory"
import PageError from "@modules/checkout/components/page-error"
import CheckoutPage from "@modules/checkout/templates/checkout-page"

import StoreError from "../app/[countryCode]/error"

beforeEach(() => {
  nav.step = "address"
  nav.replaced = []
  nav.pathname = "/pk/checkout"
  saves.calls = []
  sessionStorage.clear()
})

afterEach(() => {
  vi.useRealTimers()
})

describe("S3: the store's error page keeps its 'your order may exist' sentence on the checkout and order pages", () => {
  const MAY_EXIST = "If you pressed Place order, your order may have gone through."

  it("on the checkout and an order's page it says so; elsewhere it doesn't", () => {
    // offline, so the page waits and doesn't load itself again (m9)
    const online = vi.spyOn(navigator, "onLine", "get").mockReturnValue(false)
    onTestFinished(() => online.mockRestore())
    for (const path of ["/pk/checkout", "/gb/order/order_1/confirmed", "/pk/order"]) {
      nav.pathname = path
      const { unmount } = render(<StoreError />)
      expect(screen.getByTestId("page-error-alert"), path).toHaveTextContent(MAY_EXIST)
      unmount()
    }
    for (const path of ["/pk/store", "/pk/products/t-shirt", "/pk/account/orders"]) {
      nav.pathname = path
      const { unmount } = render(<StoreError />)
      expect(screen.getByTestId("page-error-alert"), path).not.toHaveTextContent(MAY_EXIST)
      unmount()
    }
  })
})

describe("m9: the error page loads itself again when the browser is already back online as it appears", () => {
  const withLocation = (pathname: string, run: (reload: ReturnType<typeof vi.fn>) => void) => {
    const reload = vi.fn()
    const location = window.location
    Object.defineProperty(window, "location", { configurable: true, value: { ...location, pathname, reload } })
    try {
      run(reload)
    } finally {
      Object.defineProperty(window, "location", { configurable: true, value: location })
    }
  }

  it("online on appearing: loads again once; again within a minute: waits for a press (no loop)", () => {
    const online = vi.spyOn(navigator, "onLine", "get").mockReturnValue(true)
    try {
      withLocation("/pk/order/order_1/confirmed", (reload) => {
        const first = render(<PageError orderPage />)
        expect(reload).toHaveBeenCalledTimes(1)
        first.unmount()
        render(<PageError orderPage />)
        expect(reload).toHaveBeenCalledTimes(1)
        expect(screen.getByTestId("page-error-reload")).toBeInTheDocument()
      })
    } finally {
      online.mockRestore()
    }
  })

  it("offline on appearing: no load until the browser is back online", () => {
    const online = vi.spyOn(navigator, "onLine", "get").mockReturnValue(false)
    try {
      withLocation("/pk/checkout", (reload) => {
        render(<PageError orderPage />)
        expect(reload).not.toHaveBeenCalled()
        online.mockReturnValue(true)
        act(() => {
          window.dispatchEvent(new Event("online"))
        })
        expect(reload).toHaveBeenCalledTimes(1)
      })
    } finally {
      online.mockRestore()
    }
  })
})

describe("m8: the order summary bar's ids are the same on the server and in the browser", () => {
  it("aria-controls names a fixed id, the panel's own", () => {
    const view = checkoutView({
      cart: checkoutCartPk({ email: null, shipping_address: null, shipping_methods: [] }),
      rules: parseCheckoutRules(rulesPkAvailable),
      shippingOptions: [optionPk],
      providerIds: providersPk,
      customer: null,
      countryCode: "pk",
    })
    render(<CheckoutPage view={view} />)
    const toggle = screen.getByTestId("order-summary-toggle")
    expect(toggle).toHaveAttribute("aria-controls", "checkout-summary-panel")
    expect(document.getElementById("checkout-summary-panel")).not.toBeNull()
    expect(document.querySelectorAll("#checkout-summary-panel")).toHaveLength(1)
  })
})

describe("S1: an address saved to the account from the checkout is saved once", () => {
  const twice = {
    first_name: "Ali",
    last_name: "Raza",
    company: "",
    country_code: "pk",
    address_1: "99 Twice Road",
    address_2: "",
    city: "Lahore",
    province: "pk-pb",
    postal_code: "",
    phone: "+923001234567",
  }

  it("after Continue then Change, the saved copy is selected, the box is gone, and Continue saves nothing more", async () => {
    const view = checkoutView({
      cart: checkoutCartPk({ id: "cart_s1", shipping_address: twice, billing_address: twice }),
      rules: parseCheckoutRules(rulesPkAvailable),
      shippingOptions: [optionPk],
      providerIds: providersPk,
      customer: {
        ...customer,
        addresses: [customer.addresses[0], { ...customer.addresses[0], ...twice, id: "cuaddr_twice", is_default_shipping: false }],
      },
      countryCode: "pk",
    })
    // what step 1 kept from the first Continue: a new address, box ticked
    keepAddressDraft("cart_s1", { ...view.address.initial, saveToAccount: true })
    render(<CheckoutPage view={view} />)
    expect(screen.getByLabelText(/99 Twice Road/)).toBeChecked()
    expect(screen.getByLabelText("Use a new address")).not.toBeChecked()
    expect(screen.queryByTestId("save-to-account")).toBeNull()
    await act(async () => {
      fireEvent.click(screen.getByTestId("submit-address"))
    })
    expect(saves.calls).toEqual([{ saveToAccount: false, address_1: "99 Twice Road" }])
  })

  it("the same with the step kept mounted across the steps (as in the browser): Change selects the saved copy", async () => {
    const base = {
      rules: parseCheckoutRules(rulesPkAvailable),
      shippingOptions: [optionPk],
      providerIds: providersPk,
      countryCode: "pk",
    }
    const signedIn = { ...customer, first_name: "Ali", last_name: "Raza", addresses: [] as typeof customer.addresses }
    // a new address, nothing saved yet
    const before = checkoutView({
      ...base,
      cart: checkoutCartPk({ id: "cart_s1b", shipping_address: null, billing_address: null, shipping_methods: [] }),
      customer: signedIn,
    })
    const { rerender } = render(<CheckoutPage view={before} />)
    fireEvent.change(screen.getByLabelText("Phone"), { target: { value: "0300 1234567" } })
    fireEvent.change(screen.getByLabelText("House and street"), { target: { value: "99 Twice Road" } })
    fireEvent.change(screen.getByLabelText("City"), { target: { value: "Lahore" } })
    fireEvent.change(screen.getByLabelText("Province"), { target: { value: "pk-pb" } })
    fireEvent.click(screen.getByLabelText("Save this address to my account"))
    await act(async () => {
      fireEvent.click(screen.getByTestId("submit-address"))
    })
    expect(saves.calls).toEqual([{ saveToAccount: true, address_1: "99 Twice Road" }])
    // the server's next view: the cart holds the address, the account holds its copy; Change opens step 1
    const after = checkoutView({
      ...base,
      cart: checkoutCartPk({ id: "cart_s1b", shipping_address: twice, billing_address: twice }),
      customer: { ...signedIn, addresses: [{ ...customer.addresses[0], ...twice, id: "cuaddr_twice", is_default_shipping: true }] },
    })
    nav.step = "payment"
    rerender(<CheckoutPage view={after} />)
    nav.step = "address"
    rerender(<CheckoutPage view={after} />)
    expect(screen.getByLabelText(/99 Twice Road/)).toBeChecked()
    expect(screen.queryByTestId("save-to-account")).toBeNull()
    await act(async () => {
      fireEvent.click(screen.getByTestId("submit-address"))
    })
    expect(saves.calls.at(-1)).toEqual({ saveToAccount: false, address_1: "99 Twice Road" })
  })
})
