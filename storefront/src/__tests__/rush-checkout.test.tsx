import { act, fireEvent, render, screen, within } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { optionPk, providersPk, rulesPkOverLimit } from "./fixtures/m1-checkout"
import { checkoutCartPkRush, rulesPkRushInCart, rulesPkRushOffered, tshirtLine } from "./fixtures/rush"

// Checkout step 2 with the rush option: the control in the delivery box,
// the rows, "Place order" while a choice saves, the cash on delivery hint,
// and the "total changed" answer. Stand-ins for the server actions.

const { actions, nav, rec } = vi.hoisted(() => {
  const actions = {
    calls: [] as { name: string; args: unknown[] }[],
    answers: {} as Record<string, (...args: unknown[]) => unknown>,
  }
  const rec =
    (name: string, fallback: unknown) =>
    async (...args: unknown[]) => {
      actions.calls.push({ name, args })
      const custom = actions.answers[name]
      return custom ? custom(...args) : fallback
    }
  return { actions, nav: { refreshed: 0 }, rec }
})

vi.mock("@lib/data/checkout", () => ({
  saveAddressStep: rec("saveAddressStep", { kind: "saved", delivery: true }),
  retryDelivery: rec("retryDelivery", { ok: true }),
  choosePayment: rec("choosePayment", { ok: true }),
  placeOrder: rec("placeOrder", { kind: "refused" }),
  explainRefusedOrder: rec("explainRefusedOrder", { kind: "generic" }),
}))
vi.mock("@lib/data/rush", () => ({ chooseRush: rec("chooseRush", { ok: true }) }))
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => (nav.refreshed += 1) }),
  useSearchParams: () => new URLSearchParams("step=payment"),
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

const view = (cart: unknown, rules: unknown) =>
  checkoutView({
    cart: cart as any,
    rules: parseCheckoutRules(rules),
    shippingOptions: [optionPk],
    providerIds: providersPk,
    customer: null,
    countryCode: "pk",
  })

const plainCart = () => checkoutCartPkRush({ items: [tshirtLine()], item_subtotal: 4000, total: 4250 })

beforeEach(() => {
  actions.calls = []
  actions.answers = {}
  nav.refreshed = 0
  sessionStorage.clear()
})

describe("checkout step 2 with rush", () => {
  it("the control sits in the delivery box, between the delivery line and the date", () => {
    render(<CheckoutPage view={view(plainCart(), rulesPkRushOffered)} />)
    const box = screen.getByTestId("delivery-block")
    const choice = within(box).getByTestId("rush-choice")
    expect(within(choice).getByRole("heading", { level: 3, name: "Delivery speed" })).toBeInTheDocument()
    const line = within(box).getByTestId("delivery-line")
    const date = within(box).getByTestId("delivery-date-line")
    expect(line.compareDocumentPosition(choice) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(choice.compareDocumentPosition(date) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(date).toHaveTextContent("Delivered by Wednesday 2 December")
  })

  it("the summaries have the rush row, the lines and counts leave it out, and the date is the rush date", () => {
    render(<CheckoutPage view={view(checkoutCartPkRush(), rulesPkRushInCart)} />)
    for (const summary of [screen.getByTestId("checkout-summary-box"), screen.getByTestId("order-check")]) {
      expect(plain(within(summary).getByTestId("summary-items").textContent)).toBe("Items (2)PKR 4,000")
      expect(plain(within(summary).getByTestId("summary-rush").textContent)).toBe("Rush productionPKR 800")
      expect(within(summary).queryByText("Rush Production")).toBeNull()
    }
    expect(screen.getByTestId("order-summary-toggle")).toHaveTextContent("Show order summary (2 pieces)")
    expect(within(screen.getByTestId("delivery-block")).getByTestId("delivery-date-line")).toHaveTextContent(
      "Delivered by Friday 27 November"
    )
  })

  it("a method chosen stays chosen when rush is chosen after it, and Place order waits while it saves", async () => {
    let finish!: (value: unknown) => void
    actions.answers.chooseRush = () => new Promise((resolve) => (finish = resolve))
    render(<CheckoutPage view={view(plainCart(), rulesPkRushOffered)} />)
    await act(async () => {
      fireEvent.click(screen.getByTestId("payment-option-cod").querySelector("input")!)
    })
    expect(screen.getByTestId("payment-option-cod")).toHaveAttribute("data-checked", "true")
    expect(screen.getByTestId("place-order")).not.toHaveAttribute("aria-disabled")

    fireEvent.click(within(screen.getByTestId("speed-rush")).getByRole("radio"))
    expect(callsOf("chooseRush")[0].args).toEqual([true])
    expect(screen.getByTestId("place-order")).toHaveAttribute("aria-disabled", "true")
    fireEvent.click(screen.getByTestId("place-order"))
    expect(callsOf("placeOrder")).toHaveLength(0)
    expect(within(screen.getByTestId("checkout-summary-box")).getByTestId("summary-total").querySelector("[data-loading]")).not.toBeNull()
    expect(within(screen.getByTestId("cod-will-pay")).getByText(/PKR/)).toHaveAttribute("data-loading", "true")

    await act(async () => finish({ ok: true }))
    expect(screen.getByTestId("payment-option-cod")).toHaveAttribute("data-checked", "true")
  })

  it("the total changed at Place order: the new total and the sentence, the page read again, nothing else said", async () => {
    actions.answers.placeOrder = () => ({ kind: "total_changed", total: 5250, currencyCode: "pkr" })
    render(<CheckoutPage view={view(checkoutCartPkRush(), rulesPkRushInCart)} />)
    await act(async () => {
      fireEvent.click(screen.getByTestId("payment-option-cod").querySelector("input")!)
    })
    await act(async () => {
      fireEvent.click(screen.getByTestId("place-order"))
    })
    expect(callsOf("placeOrder")[0].args).toEqual(["pp_cod_cod", "pk", 5050])
    const alert = screen.getByTestId("place-order-alert")
    expect(plain(alert.textContent)).toContain("Your total has changed")
    expect(plain(alert.textContent)).toContain("It's now PKR 5,250. Your order isn't placed yet: check it, then press Place order again.")
    expect(screen.getByTestId("place-order")).toHaveTextContent("Place order")
    expect(screen.queryByTestId("check-my-order")).toBeNull()
    expect(nav.refreshed).toBeGreaterThan(0)
  })

  it("over the cash on delivery limit with rush: the hint offers Standard, one tap", async () => {
    render(
      <CheckoutPage
        view={view(checkoutCartPkRush({ total: 20450 }), { ...rulesPkRushInCart, cash_on_delivery: rulesPkOverLimit.cash_on_delivery })}
      />
    )
    const payment = screen.getByTestId("payment-choice")
    expect(within(payment).getByTestId("cod-lower-total")).toBeInTheDocument()
    expect(within(payment).getByTestId("cod-rush-hint")).toHaveTextContent(
      "Choosing Standard delivery removes the rush charge and lowers your total."
    )
    await act(async () => {
      fireEvent.click(within(payment).getByRole("button", { name: "Choose Standard delivery" }))
    })
    expect(callsOf("chooseRush")[0].args).toEqual([false])
  })
})
