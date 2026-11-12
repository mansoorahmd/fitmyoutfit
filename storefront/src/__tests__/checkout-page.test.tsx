import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  checkoutCartGb,
  checkoutCartPk,
  optionGb,
  optionPk,
  providersGb,
  providersPk,
  rulesGb10,
  rulesGb9,
  rulesPkAvailable,
  rulesPkOverLimit,
} from "./fixtures/m1-checkout"

// Stand-ins for the server actions, the order-status route and the router,
// recording their calls.
const status = {
  answers: [] as unknown[],
  requests: [] as { url: string; body: unknown; signal?: AbortSignal }[],
}
const { actions, nav } = vi.hoisted(() => ({
  actions: {
    calls: [] as { name: string; args: unknown[] }[],
    answers: {} as Record<string, (...args: unknown[]) => unknown>,
  },
  nav: { step: "address" as string | null, pushed: [] as string[], replaced: [] as string[], refreshed: 0 },
}))

vi.mock("@lib/data/checkout", () => {
  const rec =
    (name: string, fallback: unknown) =>
    async (...args: unknown[]) => {
      actions.calls.push({ name, args })
      const custom = actions.answers[name]
      return custom ? custom(...args) : fallback
    }
  return {
    saveAddressStep: rec("saveAddressStep", { kind: "saved", delivery: true }),
    retryDelivery: rec("retryDelivery", { ok: true }),
    choosePayment: rec("choosePayment", { ok: true }),
    placeOrder: rec("placeOrder", { kind: "refused" }),
    explainRefusedOrder: rec("explainRefusedOrder", { kind: "generic" }),
  }
})
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: (href: string) => nav.pushed.push(href),
    replace: (href: string) => {
      nav.pushed.push(href)
      nav.replaced.push(href)
    },
    refresh: () => {
      nav.refreshed += 1
    },
  }),
  useSearchParams: () => new URLSearchParams(nav.step ? `step=${nav.step}` : ""),
  useParams: () => ({ countryCode: "pk" }),
}))
vi.mock("next/image", () => ({
  // eslint-disable-next-line @next/next/no-img-element
  default: ({ src, alt }: { src: string; alt: string }) => <img src={src} alt={alt} />,
}))

import { parseCheckoutRules } from "@lib/util/checkout-rules"
import { checkoutView } from "@lib/util/checkout-view"
import CheckoutPage from "@modules/checkout/templates/checkout-page"

const plain = (s: string | null | undefined) => s?.replace(/\s/g, " ")
const callsOf = (name: string) => actions.calls.filter((c) => c.name === name)

const pkView = (over: Partial<Parameters<typeof checkoutView>[0]> = {}) =>
  checkoutView({
    cart: checkoutCartPk(),
    rules: parseCheckoutRules(rulesPkAvailable),
    shippingOptions: [optionPk],
    providerIds: providersPk,
    customer: null,
    countryCode: "pk",
    ...over,
  })

const gbView = (over: Partial<Parameters<typeof checkoutView>[0]> = {}) =>
  checkoutView({
    cart: checkoutCartGb(),
    rules: parseCheckoutRules(rulesGb10),
    shippingOptions: [optionGb],
    providerIds: providersGb,
    customer: null,
    countryCode: "gb",
    ...over,
  })

/** A new cart: no email, no address, no delivery yet. */
const emptyPk = () =>
  pkView({
    cart: checkoutCartPk({
      id: `cart_${Math.random()}`,
      email: null,
      shipping_address: null,
      billing_address: null,
      shipping_methods: [],
      payment_collection: null,
      total: 2000,
    }),
  })

beforeEach(() => {
  // "Check my order" asks the order-status route with fetch: by default
  // the cart is not an order.
  status.answers = []
  status.requests = []
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      status.requests.push({ url, body: JSON.parse(String(init.body)), signal: init.signal ?? undefined })
      const next = status.answers.shift()
      if (next === "hang") return new Promise(() => {})
      return new Response(JSON.stringify(next ?? { kind: "open" }), { status: 200 })
    })
  )
  actions.calls = []
  actions.answers = {}
  nav.step = "address"
  nav.pushed = []
  nav.replaced = []
  nav.refreshed = 0
  sessionStorage.clear()
})

describe("checkout frame (05, 6.2 and 6.3)", () => {
  it("labels the step and shows step 2 as a closed heading before step 1 is done", () => {
    render(<CheckoutPage view={emptyPk()} />)
    expect(screen.getByTestId("step-label")).toHaveTextContent("Step 1 of 2 · Contact and address")
    expect(screen.getByTestId("step-address")).toHaveAttribute("data-state", "open")
    expect(screen.getByTestId("step-payment")).toHaveAttribute("data-state", "closed")
    expect(screen.queryByTestId("place-order")).toBeNull()
  })

  it("has the order summary bar for phones, closed, with the piece count and the total", () => {
    render(<CheckoutPage view={pkView()} />)
    const toggle = screen.getByTestId("order-summary-toggle")
    expect(toggle).toHaveAttribute("aria-expanded", "false")
    expect(plain(toggle.textContent)).toBe("Show order summary (1 piece)PKR 2,250")
    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute("aria-expanded", "true")
    expect(toggle).toHaveTextContent("Hide order summary")
  })

  it("opens step 1 even when the URL asks for step 2 but step 1 isn't done", () => {
    nav.step = "payment"
    render(<CheckoutPage view={emptyPk()} />)
    expect(screen.getByTestId("step-address")).toHaveAttribute("data-state", "open")
  })
})

describe("step 1, contact and address (05, 6.4 and 2.3)", () => {
  it("puts each label above its field, the hints under the labels, and the right input types", () => {
    render(<CheckoutPage view={emptyPk()} />)
    const email = screen.getByLabelText("Email")
    expect(email).toHaveAttribute("type", "email")
    expect(email).toHaveAttribute("autocomplete", "email")
    expect(email).toHaveAttribute("dir", "ltr")
    expect(email.getAttribute("aria-describedby")).toContain("checkout-email-hint")
    expect(screen.getByText("For your order confirmation.")).toHaveAttribute("id", "checkout-email-hint")
    const phone = screen.getByLabelText("Phone")
    expect(phone).toHaveAttribute("type", "tel")
    expect(screen.getByText("The courier may call you.")).toBeInTheDocument()
    expect(screen.getByLabelText("First name")).toHaveAttribute("dir", "auto")
    expect(screen.getByLabelText("House and street")).toHaveAttribute("autocomplete", "shipping address-line1")
    // one country: read-only, still focusable
    expect(screen.getByLabelText("Country")).toHaveAttribute("readonly")
    expect(screen.getByLabelText("Country")).toHaveValue("Pakistan")
    // Pakistan: a province list and an optional postal code
    expect(screen.getByLabelText("Province").tagName).toBe("SELECT")
    expect(screen.getByLabelText("Postal code (optional)")).toBeInTheDocument()
  })

  it("UK: no province, a postcode; no 'Postal code (optional)'", () => {
    render(<CheckoutPage view={gbView({ cart: checkoutCartGb({ email: null, shipping_address: null, shipping_methods: [] }) })} />)
    expect(screen.queryByLabelText("Province")).toBeNull()
    expect(screen.getByLabelText("Postcode")).toBeInTheDocument()
  })

  it("on submit with empty fields: a message under each, an error list, and focus on the first", async () => {
    const raf = vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
      cb(0)
      return 0
    })
    const view = emptyPk()
    render(<CheckoutPage view={view} />)
    fireEvent.click(screen.getByTestId("submit-address"))

    const email = screen.getByLabelText("Email")
    expect(email).toHaveAttribute("aria-invalid", "true")
    expect(email.getAttribute("aria-describedby")).toContain("checkout-email-error")
    expect(screen.getByText("Enter your email address, like name@example.com", { selector: "#checkout-email-error *" })).toBeInTheDocument()
    expect(document.getElementById("checkout-phone-error")).toHaveTextContent("Enter a phone number")
    expect(document.getElementById("checkout-shipping-first_name-error")).toHaveTextContent("Enter your first name")
    expect(document.getElementById("checkout-shipping-province-error")).toHaveTextContent("Choose a province")
    // 3 or more: the list at the top, with a link to each field
    const list = screen.getByTestId("address-error-list")
    expect(within(list).getAllByRole("link").length).toBeGreaterThanOrEqual(3)
    expect(document.activeElement).toBe(email)
    expect(callsOf("saveAddressStep")).toHaveLength(0)
    raf.mockRestore()
  })

  it("checks a field when it loses focus after an edit, not before", () => {
    render(<CheckoutPage view={emptyPk()} />)
    const email = screen.getByLabelText("Email")
    fireEvent.blur(email)
    expect(email).not.toHaveAttribute("aria-invalid")
    fireEvent.change(email, { target: { value: "ali@" } })
    fireEvent.blur(email)
    expect(email).toHaveAttribute("aria-invalid", "true")
    const phone = screen.getByLabelText("Phone")
    fireEvent.change(phone, { target: { value: "abc" } })
    fireEvent.blur(phone)
    // a delivery in Pakistan needs a Pakistan mobile number (QA S1-4, D15)
    expect(document.getElementById("checkout-phone-error")).toHaveTextContent(
      "Enter a Pakistan mobile number, like 0300 1234567 or +92 300 1234567"
    )
  })

  it("saves an Urdu name and moves to step 2", async () => {
    render(<CheckoutPage view={emptyPk()} />)
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "ali@example.com" } })
    fireEvent.change(screen.getByLabelText("Phone"), { target: { value: "0300 1234567" } })
    fireEvent.change(screen.getByLabelText("First name"), { target: { value: "محمد علی" } })
    fireEvent.change(screen.getByLabelText("House and street"), { target: { value: "House 12" } })
    fireEvent.change(screen.getByLabelText("City"), { target: { value: "Lahore" } })
    fireEvent.change(screen.getByLabelText("Province"), { target: { value: "pk-pb" } })
    await act(async () => {
      fireEvent.click(screen.getByTestId("submit-address"))
    })
    const [saved] = callsOf("saveAddressStep")
    expect(saved.args[0]).toMatchObject({
      email: "ali@example.com",
      shipping: { first_name: "محمد علی", province: "pk-pb" },
      billingSame: true,
    })
    expect(nav.pushed).toEqual(["/pk/checkout?step=payment"])
  })

  it("shows the billing fields when billing isn't the same", () => {
    render(<CheckoutPage view={emptyPk()} />)
    expect(screen.queryByTestId("billing-fields")).toBeNull()
    fireEvent.click(screen.getByLabelText("Billing address is the same"))
    expect(screen.getByTestId("billing-fields")).toBeInTheDocument()
  })

  it("keeps what was typed when the page mounts again (Back from step 2)", () => {
    const view = emptyPk()
    const first = render(<CheckoutPage view={view} />)
    fireEvent.change(screen.getByLabelText("City"), { target: { value: "Karachi" } })
    first.unmount()
    render(<CheckoutPage view={view} />)
    expect(screen.getByLabelText("City")).toHaveValue("Karachi")
  })

  it("collapses to a summary with 'Change' once done, and Change goes back to step 1", () => {
    nav.step = "payment"
    render(<CheckoutPage view={pkView()} />)
    const step1 = screen.getByTestId("step-address")
    expect(step1).toHaveAttribute("data-state", "done")
    expect(within(step1).getByText("ali@example.com")).toBeInTheDocument()
    expect(within(step1).getByText("محمد علی").tagName).toBe("BDI")
    fireEvent.click(within(step1).getByRole("button", { name: "Change contact and address" }))
    expect(nav.pushed).toEqual(["/pk/checkout?step=address"])
  })
})

describe("step 2, delivery and payment (05, 6.5 and 6.6)", () => {
  beforeEach(() => {
    nav.step = "payment"
  })

  it("Pakistan: the delivery line with PKR 250 and the date; cash on delivery can be chosen", async () => {
    render(<CheckoutPage view={pkView({ cart: checkoutCartPk({ payment_collection: null }) })} />)
    expect(screen.getByTestId("step-label")).toHaveTextContent("Step 2 of 2 · Delivery and payment")
    expect(plain(screen.getByTestId("delivery-line").textContent)).toBe("Delivery in PakistanPKR 250")
    expect(within(screen.getByTestId("delivery-block")).getByTestId("delivery-date-line")).toHaveTextContent(
      "Delivered by Friday 27 November"
    )
    const cod = screen.getByLabelText(/Cash on delivery/)
    expect(cod).not.toHaveAttribute("aria-disabled")
    // nothing chosen yet: Place order says why it is inactive
    expect(screen.getByTestId("place-order")).toHaveAttribute("aria-disabled", "true")
    expect(screen.getByTestId("place-order-reason")).toHaveTextContent("Choose how to pay.")
    await act(async () => {
      fireEvent.click(cod)
    })
    expect(callsOf("choosePayment")[0].args).toEqual(["pp_cod_cod"])
    expect(plain(screen.getByTestId("cod-will-pay").textContent)).toBe(
      "You'll pay PKR 2,250 in cash when your order arrives."
    )
    expect(screen.getByTestId("place-order")).not.toHaveAttribute("aria-disabled")
  })

  it("Pakistan over the limit: cash on delivery inactive with the limit, W-P6 with Back to cart; the placeholder still works", async () => {
    render(
      <CheckoutPage
        view={pkView({
          cart: checkoutCartPk({ total: 22750, payment_collection: null }),
          rules: parseCheckoutRules(rulesPkOverLimit),
        })}
      />
    )
    const card = screen.getByTestId("payment-option-cod")
    expect(card).toHaveAttribute("data-inactive", "true")
    expect(plain(card.textContent)).toContain("Not available for orders over PKR 20,000.")
    const cod = within(card).getByRole("radio")
    expect(cod).toHaveAttribute("aria-disabled", "true")
    await act(async () => {
      fireEvent.click(cod)
    })
    expect(callsOf("choosePayment")).toHaveLength(0)
    expect(screen.getByTestId("cod-lower-total")).toHaveTextContent(
      "Lower the total in your cart to use cash on delivery. Back to cart"
    )
    await act(async () => {
      fireEvent.click(screen.getByLabelText(/Test payment/))
    })
    expect(callsOf("choosePayment")[0].args).toEqual(["pp_system_default"])
  })

  it("export regions: 'Included', never GBP 0.00, and no cash on delivery", () => {
    render(<CheckoutPage view={gbView()} />)
    expect(plain(screen.getByTestId("delivery-line").textContent)).toBe("Shipping & duties includedIncluded")
    expect(document.body.textContent).not.toContain("GBP 0.00")
    expect(screen.queryByTestId("payment-option-cod")).toBeNull()
    expect(screen.getByTestId("payment-option-test")).toBeInTheDocument()
  })

  it("puts a failed payment selection back, with W-P8", async () => {
    actions.answers.choosePayment = () => ({ ok: false, kind: "server" })
    render(<CheckoutPage view={gbView()} />)
    await act(async () => {
      fireEvent.click(screen.getByLabelText(/Test payment/))
    })
    expect(screen.getByLabelText(/Test payment/)).not.toBeChecked()
    expect(screen.getByTestId("payment-select-error")).toHaveTextContent(
      "We couldn't select this payment method. Try again."
    )
  })

  it("shows W-K14 with Try again when the delivery option couldn't be added", async () => {
    render(<CheckoutPage view={pkView({ cart: checkoutCartPk({ shipping_methods: [] }) })} />)
    expect(screen.getByTestId("delivery-failed")).toHaveTextContent(
      "We couldn't set up delivery to this address. Check the address, or try again."
    )
    expect(screen.getByTestId("place-order")).toHaveAttribute("aria-disabled", "true")
    await act(async () => {
      fireEvent.click(screen.getByTestId("retry-delivery"))
    })
    expect(callsOf("retryDelivery")).toHaveLength(1)
    expect(nav.refreshed).toBe(1)
  })

  it("has one red main button in the view: Place order", () => {
    render(<CheckoutPage view={pkView()} />)
    const primaries = Array.from(document.querySelectorAll("button, a")).filter((el) =>
      el.className.includes("bg-brand-primary")
    )
    expect(primaries).toHaveLength(1)
    expect(primaries[0]).toHaveAttribute("data-testid", "place-order")
  })
})

describe("the minimum at checkout (05, 5.4)", () => {
  it("below the minimum: the alert at the top with Back to cart, and Place order inactive with how many more", async () => {
    nav.step = "payment"
    render(<CheckoutPage view={gbView({ rules: parseCheckoutRules(rulesGb9), cart: checkoutCartGb({ items: [{ ...checkoutCartGb().items[0], quantity: 9 }] }) })} />)
    const alert = screen.getByTestId("checkout-minimum-alert")
    expect(alert).toHaveTextContent("Your order needs 10 garment pieces")
    expect(alert).toHaveTextContent("You have 9. Add 1 more in your cart to place the order.")
    expect(within(alert).getByRole("link", { name: "Back to cart" })).toHaveAttribute("href", "/pk/cart")
    await act(async () => {
      fireEvent.click(screen.getByLabelText(/Test payment/))
    })
    const button = screen.getByTestId("place-order")
    expect(button).toHaveAttribute("aria-disabled", "true")
    expect(screen.getByTestId("place-order-reason")).toHaveTextContent("Add one more garment piece to place the order.")
    expect(button).toHaveAttribute("aria-describedby", "place-order-reason")
    await act(async () => {
      fireEvent.click(button)
    })
    expect(callsOf("placeOrder")).toHaveLength(0)
    expect(document.activeElement).toBe(alert)
  })

  it("Pakistan never sees it", () => {
    render(<CheckoutPage view={pkView()} />)
    expect(screen.queryByTestId("checkout-minimum-alert")).toBeNull()
  })
})

describe("Place order (05, 6.6 to 6.8)", () => {
  beforeEach(() => {
    nav.step = "payment"
  })

  const ready = () => render(<CheckoutPage view={pkView()} />) // a pending COD session

  it("one press, one call: a second press while placing is ignored", async () => {
    let finish: (v: unknown) => void = () => {}
    actions.answers.placeOrder = () => new Promise((resolve) => (finish = resolve))
    ready()
    const button = screen.getByTestId("place-order")
    await act(async () => {
      fireEvent.click(button)
      fireEvent.click(button)
      fireEvent.click(button)
    })
    expect(callsOf("placeOrder")).toHaveLength(1)
    expect(callsOf("placeOrder")[0].args).toEqual(["pp_cod_cod", "pk"])
    expect(button).toHaveAttribute("aria-busy", "true")
    expect(within(button).getByTestId("button-loading")).toHaveTextContent("Placing your order…")
    await act(async () => finish({ kind: "server" }))
  })

  it("going to the confirmation (the action redirects): the button keeps loading", async () => {
    actions.answers.placeOrder = () => {
      throw Object.assign(new Error("NEXT_REDIRECT"), {
        digest: "NEXT_REDIRECT;replace;/pk/order/order_1/confirmed;307;",
      })
    }
    ready()
    await act(async () => {
      fireEvent.click(screen.getByTestId("place-order"))
    })
    expect(screen.getByTestId("place-order")).toHaveAttribute("aria-busy", "true")
    expect(screen.queryByTestId("place-order-alert")).toBeNull()
  })

  it("a refusal: re-reads the rules and explains the minimum, with Back to cart", async () => {
    actions.answers.placeOrder = () => ({ kind: "refused" })
    actions.answers.explainRefusedOrder = () => ({ kind: "minimum", required: 10, counted: 9, missing: 1 })
    ready()
    await act(async () => {
      fireEvent.click(screen.getByTestId("place-order"))
    })
    expect(callsOf("explainRefusedOrder")[0].args).toEqual(["pp_cod_cod"])
    const alert = screen.getByTestId("place-order-alert")
    expect(alert).toHaveAttribute("role", "alert")
    expect(alert).toHaveTextContent("Your order needs 10 garment pieces")
    expect(alert).toHaveTextContent("You have 9. Add 1 more in your cart to place the order.")
    expect(document.activeElement).toBe(alert)
    expect(nav.refreshed).toBe(1)
  })

  it("cash on delivery refused over the limit: W-E1 and W-E2, deselected, focus on the payment", async () => {
    actions.answers.placeOrder = () => ({ kind: "refused" })
    actions.answers.explainRefusedOrder = () => ({ kind: "cod_over_limit", limit: "PKR 20,000", total: "PKR 20,150" })
    const raf = vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
      cb(0)
      return 0
    })
    ready()
    await act(async () => {
      fireEvent.click(screen.getByTestId("place-order"))
    })
    expect(screen.getByTestId("place-order-alert")).toHaveTextContent(
      "It's for orders up to PKR 20,000. Your total is PKR 20,150. Choose another way to pay."
    )
    expect(screen.getByLabelText(/Cash on delivery/)).not.toBeChecked()
    expect(document.activeElement).toHaveAttribute("id", "checkout-payment-group")
    expect(screen.getByTestId("place-order-reason")).toHaveTextContent("Choose how to pay.")
    raf.mockRestore()
  })

  it("the general refusal: W-E4 and W-E5, and the main button reads Try again", async () => {
    actions.answers.placeOrder = () => ({ kind: "refused" })
    ready()
    await act(async () => {
      fireEvent.click(screen.getByTestId("place-order"))
    })
    expect(screen.getByTestId("place-order-alert")).toHaveTextContent("We couldn't place your order")
    expect(screen.getByTestId("place-order")).toHaveTextContent("Try again")
  })

  it("unknown (409 twice, or no answer): 'Check my order' instead of Place order; it finds the cart not placed", async () => {
    actions.answers.placeOrder = () => ({ kind: "unknown" })
    ready()
    await act(async () => {
      fireEvent.click(screen.getByTestId("place-order"))
    })
    expect(screen.getByTestId("place-order-alert")).toHaveTextContent("We lost the connection")
    expect(screen.queryByTestId("place-order")).toBeNull()
    await act(async () => {
      fireEvent.click(screen.getByTestId("check-my-order"))
    })
    // the order-status route, with fetch, never a server action (QA S1-4, D5)
    const check = status.requests.at(-1)!
    expect(check.url).toBe("/pk/checkout/order-status")
    expect(check.body).toEqual({ cartId: pkView().cartId })
    expect(screen.getByTestId("place-order-alert")).toHaveTextContent("We couldn't place your order")
    expect(screen.getByTestId("place-order")).toBeInTheDocument()
  })

  it("the client gives up on 'Place order' at 30 s exactly, with the lost-connection alert (6.8 c)", async () => {
    vi.useFakeTimers()
    try {
      actions.answers.placeOrder = () => new Promise(() => {})
      ready()
      await act(async () => {
        fireEvent.click(screen.getByTestId("place-order"))
      })
      await act(async () => {
        await vi.advanceTimersByTimeAsync(29_999)
      })
      expect(screen.queryByTestId("place-order-alert")).toBeNull()
      expect(screen.getByTestId("place-order")).toHaveAttribute("aria-busy", "true")
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1)
      })
      expect(screen.getByTestId("place-order-alert")).toHaveTextContent("We lost the connection")
    } finally {
      vi.useRealTimers()
    }
  })

  it("after an unknown outcome, one quiet look: an order that exists opens at once (QA S1-4, D1)", async () => {
    actions.answers.placeOrder = () => ({ kind: "unknown" })
    status.answers = [{ kind: "order", url: "/pk/order/order_1/confirmed" }]
    ready()
    await act(async () => {
      fireEvent.click(screen.getByTestId("place-order"))
    })
    await waitFor(() => expect(nav.replaced).toEqual(["/pk/order/order_1/confirmed"]))
  })

  it("the quiet look that finds no order leaves the alert as it is (the first request may still run)", async () => {
    actions.answers.placeOrder = () => ({ kind: "unknown" })
    ready()
    await act(async () => {
      fireEvent.click(screen.getByTestId("place-order"))
    })
    await waitFor(() => expect(status.requests).toHaveLength(1))
    expect(screen.getByTestId("place-order-alert")).toHaveTextContent("We lost the connection")
    expect(nav.replaced).toEqual([])
  })

  it("'Check my order' never waits behind a hung 'Place order', and ends at 15 s in a true state (QA S1-4, D5)", async () => {
    vi.useFakeTimers()
    try {
      actions.answers.placeOrder = () => ({ kind: "unknown" })
      status.answers = [{ kind: "open" }, "hang"]
      ready()
      await act(async () => {
        fireEvent.click(screen.getByTestId("place-order"))
      })
      await act(async () => {
        fireEvent.click(screen.getByTestId("check-my-order"))
      })
      expect(screen.getByTestId("check-my-order")).toHaveAttribute("aria-busy", "true")
      await act(async () => {
        await vi.advanceTimersByTimeAsync(15_000)
      })
      const alert = screen.getByTestId("place-order-alert")
      expect(alert).toHaveTextContent("We lost the connection")
      expect(alert).toHaveTextContent("We still couldn't reach the store")
      expect(screen.getByTestId("check-my-order")).not.toHaveAttribute("aria-busy", "true")
      expect(status.requests.at(-1)!.signal?.aborted).toBe(true)
    } finally {
      vi.useRealTimers()
    }
  })

  it("'Check my order' finds the order: to its confirmation; found but not readable: 'Your order is placed', never Place order", async () => {
    actions.answers.placeOrder = () => ({ kind: "unknown" })
    status.answers = [{ kind: "open" }, { kind: "placed" }, { kind: "order", url: "/pk/order/order_2/confirmed" }]
    ready()
    await act(async () => {
      fireEvent.click(screen.getByTestId("place-order"))
    })
    await act(async () => {
      fireEvent.click(screen.getByTestId("check-my-order"))
    })
    expect(screen.getByTestId("place-order-alert")).toHaveTextContent("Your order is placed")
    expect(screen.queryByTestId("place-order")).toBeNull()
    await act(async () => {
      fireEvent.click(screen.getByTestId("check-my-order"))
    })
    expect(nav.replaced).toEqual(["/pk/order/order_2/confirmed"])
  })

  it("a lost connection (the call throws) is the same unknown state", async () => {
    actions.answers.placeOrder = () => {
      throw new TypeError("Failed to fetch")
    }
    ready()
    await act(async () => {
      fireEvent.click(screen.getByTestId("place-order"))
    })
    expect(screen.getByTestId("place-order-alert")).toHaveTextContent("We lost the connection")
  })

  it("an expired cart: W-E14 with Go to cart; a misconfigured store: the server-error title", async () => {
    actions.answers.placeOrder = () => ({ kind: "cart_lost" })
    const { unmount } = ready()
    await act(async () => {
      fireEvent.click(screen.getByTestId("place-order"))
    })
    expect(screen.getByTestId("place-order-alert")).toHaveTextContent("Your cart has expired")
    expect(screen.getByTestId("alert-go-to-cart")).toHaveAttribute("href", "/pk/cart")
    unmount()

    actions.answers.placeOrder = () => ({ kind: "server" })
    ready()
    await act(async () => {
      fireEvent.click(screen.getByTestId("place-order"))
    })
    // an HTTP 5xx (QA S1-4, D13): a text and an action, never a title alone
    const alert = screen.getByTestId("place-order-alert")
    expect(alert).toHaveTextContent("Something went wrong on our side")
    expect(alert).toHaveTextContent(
      "We don't know yet if your order went through. Check before you try again, so you don't order twice."
    )
    expect(screen.getByTestId("check-my-order")).toBeInTheDocument()
    expect(screen.queryByTestId("place-order")).toBeNull()
  })

  it("offline: the banner, and Place order inactive with the reason", async () => {
    const online = vi.spyOn(navigator, "onLine", "get").mockReturnValue(false)
    ready()
    expect(screen.getByTestId("offline-banner")).toHaveTextContent("You're offline. Your details are kept on this page.")
    expect(screen.getByTestId("place-order-reason")).toHaveTextContent("Reconnect to place your order.")
    await act(async () => {
      fireEvent.click(screen.getByTestId("place-order"))
    })
    expect(callsOf("placeOrder")).toHaveLength(0)
    online.mockRestore()
  })

  it("restores the payment chosen before a cart change dropped the session", async () => {
    sessionStorage.setItem(`fmo-checkout-payment:${pkView().cartId}`, "pp_cod_cod")
    render(<CheckoutPage view={pkView({ cart: checkoutCartPk({ payment_collection: null }) })} />)
    await waitFor(() => expect(screen.getByLabelText(/Cash on delivery/)).toBeChecked())
    await act(async () => {
      fireEvent.click(screen.getByTestId("place-order"))
    })
    expect(callsOf("placeOrder")[0].args).toEqual(["pp_cod_cod", "pk"])
  })
})
