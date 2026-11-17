import { act, fireEvent, render, screen, within } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { optionPk, rulesPkAvailable, rulesPkOverLimit } from "./fixtures/m1-checkout"
import {
  checkoutCartPkRush,
  rulesPkRushInCart,
  rulesPkRushOffered,
  rushLine,
  tshirtLine,
} from "./fixtures/rush"

// The "Delivery speed" control on the cart page, the rush row, and the
// confirmation's and account's rows. The server action is a stand-in whose
// answer each test sets; the router counts refreshes.

const { rush, nav } = vi.hoisted(() => ({
  rush: {
    calls: [] as boolean[],
    answer: null as null | ((wanted: boolean) => Promise<unknown>),
  },
  nav: { refreshed: 0 },
}))

vi.mock("@lib/data/rush", () => ({
  chooseRush: (wanted: boolean) => {
    rush.calls.push(wanted)
    return rush.answer ? rush.answer(wanted) : Promise.resolve({ ok: true })
  },
}))
vi.mock("@lib/data/cart", () => ({
  updateLineItem: async () => {},
  deleteLineItem: async () => {},
  addToCart: async () => {},
}))
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: () => (nav.refreshed += 1), push: () => {}, replace: () => {} }),
  useParams: () => ({ countryCode: "pk" }),
}))
vi.mock("next/image", () => ({
  // eslint-disable-next-line @next/next/no-img-element
  default: ({ src, alt }: { src: string; alt: string }) => <img src={src} alt={alt} />,
}))

import { accountOrderView } from "@lib/util/account-orders"
import { parseCheckoutRules } from "@lib/util/checkout-rules"
import { orderConfirmationView } from "@lib/util/order-confirmation"
import AccountOrderTemplate from "@modules/account/templates/account-order-template"
import { UndoToastProvider } from "@modules/cart/components/undo-toast/provider"
import CartTemplate from "@modules/cart/templates"
import OrderCompletedTemplate from "@modules/order/templates/order-completed-template"

const plain = (s: string | null | undefined) => s?.replace(/\s/g, " ")

const plainCart = () => checkoutCartPkRush({ items: [tshirtLine()], item_subtotal: 4000, total: 4250 })
const rushCart = (over: Record<string, unknown> = {}) => checkoutCartPkRush(over)

const page = (cart: unknown, rules: unknown, over: Record<string, unknown> = {}) => (
  <UndoToastProvider>
    <CartTemplate
      cart={cart as any}
      rules={parseCheckoutRules(rules)}
      shippingOptions={[optionPk]}
      countryCode="pk"
      isGuest={false}
      {...over}
    />
  </UndoToastProvider>
)

const radios = () => {
  const group = screen.getByRole("radiogroup", { name: "Delivery speed" })
  return {
    group,
    standard: within(group).getByRole("radio", { name: /Standard/ }) as HTMLInputElement,
    rush: within(group).getByRole("radio", { name: /Rush/ }) as HTMLInputElement,
  }
}

/** A promise the test settles by hand. */
const deferred = () => {
  let resolve!: (value: unknown) => void
  const promise = new Promise((r) => (resolve = r))
  return { promise, resolve }
}

beforeEach(() => {
  rush.calls = []
  rush.answer = null
  nav.refreshed = 0
})

describe("the Delivery speed control on the cart page", () => {
  it("is not there when the rules have no rush, and the cart looks as before", () => {
    render(page(plainCart(), rulesPkAvailable))
    expect(screen.queryByTestId("rush-choice")).toBeNull()
    expect(screen.queryByText("Delivery speed")).toBeNull()
    expect(screen.queryByTestId("summary-rush")).toBeNull()
  })

  it("is a labelled radio group of two cards, Standard chosen, with the dates, the amount and the percentage from the rules", () => {
    render(page(plainCart(), rulesPkRushOffered))
    const { standard, rush: rushRadio } = radios()
    expect(standard.checked).toBe(true)
    expect(rushRadio.checked).toBe(false)
    expect(plain(screen.getByTestId("speed-standard").textContent)).toBe(
      "StandardIncludedDelivered by Wednesday 2 December"
    )
    expect(plain(screen.getByTestId("speed-rush").textContent)).toBe(
      "Rush+ PKR 800Delivered by Friday 27 NovemberWe make your order first. Adds 20% to your garments."
    )
    // the amount never breaks or flips
    expect(screen.getByTestId("speed-rush-amount")).toHaveAttribute("dir", "ltr")
    expect(screen.getByTestId("speed-rush-amount")).toHaveClass("whitespace-nowrap")
  })

  it("heads the summary column: after the lines on a phone, before the totals", () => {
    render(page(plainCart(), rulesPkRushOffered))
    const choice = screen.getByTestId("rush-choice")
    const lines = screen.getByTestId("cart-lines")
    const summary = screen.getByTestId("cart-summary")
    expect(lines.compareDocumentPosition(choice) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(choice.compareDocumentPosition(summary) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it("Rush: asks the backend, shows it is working, keeps the totals grey until the new cart is on the page", async () => {
    const answer = deferred()
    rush.answer = () => answer.promise
    const { rerender } = render(page(plainCart(), rulesPkRushOffered))
    fireEvent.click(radios().rush)
    expect(rush.calls).toEqual([true])
    expect(radios().rush.checked).toBe(true)
    expect(radios().rush).toHaveAttribute("aria-busy", "true")
    expect(radios().standard).toHaveAttribute("aria-disabled", "true")
    expect(radios().group).toHaveAttribute("aria-busy", "true")
    expect(within(screen.getByTestId("summary-total")).getByText(/PKR/)).toHaveAttribute("data-loading", "true")
    expect(screen.getByTestId("checkout-button")).toHaveTextContent("Updating…")

    // a second press while saving is ignored
    fireEvent.click(radios().standard)
    expect(rush.calls).toEqual([true])

    await act(async () => answer.resolve({ ok: true }))
    // saved, but the page still shows the old cart: the totals stay grey, no old figure flashes
    expect(within(screen.getByTestId("summary-total")).getByText(/PKR/)).toHaveAttribute("data-loading", "true")
    expect(nav.refreshed).toBe(1)

    rerender(page(rushCart(), rulesPkRushInCart))
    expect(radios().rush.checked).toBe(true)
    expect(radios().rush).not.toHaveAttribute("aria-busy")
    expect(within(screen.getByTestId("summary-total")).getByText(/PKR/)).not.toHaveAttribute("data-loading")
    expect(plain(screen.getByTestId("summary-total").textContent)).toBe("TotalPKR 5,050")
    expect(screen.getByTestId("speed-announcement")).toHaveTextContent("Rush chosen. Delivered by Friday 27 November.")
  })

  it("a failure puts the choice back, says so, reads the cart again, and Try again asks again", async () => {
    rush.answer = async () => ({ ok: false, kind: "server" })
    render(page(plainCart(), rulesPkRushOffered))
    await act(async () => {
      fireEvent.click(radios().rush)
    })
    expect(radios().standard.checked).toBe(true)
    expect(radios().rush.checked).toBe(false)
    expect(screen.getByRole("alert")).toHaveTextContent("We couldn't change the delivery speed. Try again.")
    expect(radios().group).toHaveAttribute("aria-describedby", screen.getByTestId("speed-error").id)
    expect(nav.refreshed).toBe(1)
    expect(within(screen.getByTestId("summary-total")).getByText(/PKR/)).not.toHaveAttribute("data-loading")

    rush.answer = async () => ({ ok: true })
    await act(async () => {
      fireEvent.click(screen.getByTestId("speed-try-again"))
    })
    expect(rush.calls).toEqual([true, true])
    expect(screen.queryByTestId("speed-error")).toBeNull()
  })

  it("no answer, but the backend made the change: the cart read again shows it, and no error stays", async () => {
    rush.answer = async () => ({ ok: false, kind: "no_answer" })
    const { rerender } = render(page(plainCart(), rulesPkRushOffered))
    await act(async () => {
      fireEvent.click(radios().rush)
    })
    expect(screen.getByTestId("speed-error")).toBeInTheDocument()
    expect(nav.refreshed).toBe(1)
    rerender(page(rushCart(), rulesPkRushInCart))
    expect(radios().rush.checked).toBe(true)
    expect(screen.queryByTestId("speed-error")).toBeNull()
    expect(screen.getByTestId("speed-announcement")).toHaveTextContent("Rush chosen.")
  })

  it("Standard from rush: DELETE, never a call for the card already chosen", async () => {
    render(page(rushCart(), rulesPkRushInCart))
    fireEvent.click(radios().rush)
    expect(rush.calls).toEqual([])
    await act(async () => {
      fireEvent.click(radios().standard)
    })
    expect(rush.calls).toEqual([false])
  })
})

describe("the rush line and row on the cart page", () => {
  it("is no line of its own, not counted, and a row between the items and the delivery", () => {
    render(page(rushCart(), rulesPkRushInCart))
    expect(screen.getAllByTestId("cart-line")).toHaveLength(1)
    expect(screen.queryByText("Rush Production")).toBeNull()
    expect(screen.getByTestId("cart-piece-count")).toHaveTextContent("2 pieces")
    const rows = Array.from(screen.getByTestId("cart-summary").querySelectorAll("[data-testid^=summary-]")).map(
      (el) => el.getAttribute("data-testid")
    )
    expect(rows.slice(0, 4)).toEqual(["summary-items", "summary-rush", "summary-delivery", "summary-total"])
    expect(plain(screen.getByTestId("summary-items").textContent)).toBe("Items (2)PKR 4,000")
    expect(plain(screen.getByTestId("summary-rush").textContent)).toBe("Rush productionPKR 800")
    // the date is the rush date
    expect(within(screen.getByTestId("cart-summary")).getByTestId("delivery-date-line")).toHaveTextContent(
      "Delivered by Friday 27 November"
    )
  })

  it("a rush line from an older cart, with rush no longer offered: still its row, no control", () => {
    render(page(rushCart(), rulesPkAvailable))
    expect(screen.queryByTestId("rush-choice")).toBeNull()
    expect(plain(screen.getByTestId("summary-rush").textContent)).toBe("Rush productionPKR 800")
  })

  it("rush taken off because the store stopped offering it: a quiet line", () => {
    render(page(plainCart(), rulesPkAvailable, { rushDropped: true }))
    expect(screen.getByTestId("summary-rush-dropped")).toHaveTextContent(
      "Rush isn't available at the moment, so your order is on standard delivery."
    )
  })

  it("over the cash on delivery limit with rush: the hint, and one tap to Standard", async () => {
    render(page(rushCart({ total: 20450 }), { ...rulesPkRushInCart, cash_on_delivery: rulesPkOverLimit.cash_on_delivery }))
    expect(screen.getByTestId("summary-cod-note")).toHaveTextContent("Cash on delivery is for orders up to PKR 20,000.")
    expect(screen.getByTestId("cod-rush-hint")).toHaveTextContent(
      "Choosing Standard delivery removes the rush charge and lowers your total."
    )
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Choose Standard delivery" }))
    })
    expect(rush.calls).toEqual([false])
  })

  it("over the limit without rush: the note as before, no hint", () => {
    render(page(plainCart(), { ...rulesPkRushOffered, cash_on_delivery: rulesPkOverLimit.cash_on_delivery }))
    expect(screen.getByTestId("summary-cod-note")).toBeInTheDocument()
    expect(screen.queryByTestId("cod-rush-hint")).toBeNull()
  })
})

describe("the rush row on the order pages", () => {
  const order = {
    id: "order_1",
    display_id: 7,
    email: "ali@example.com",
    customer_id: "cus_1",
    status: "pending",
    fulfillment_status: "not_fulfilled",
    currency_code: "pkr",
    created_at: "2026-11-17T09:00:00.000Z",
    total: 5050,
    item_subtotal: 4800,
    shipping_subtotal: 250,
    items: [rushLine(), tshirtLine()],
    shipping_methods: [{ name: "Delivery in Pakistan", amount: 250 }],
    shipping_address: { first_name: "Ali", country_code: "pk", address_1: "1 Mall Road", city: "Lahore" },
    payment_collections: [{ payments: [{ provider_id: "pp_cod_cod" }] }],
  } as any
  const promise = { date: "2026-11-27", days: 10, based_on: "2026-11-17", applies: "rush" as const }

  const check = () => {
    const summary = screen.getByTestId("order-summary")
    expect(within(summary).getAllByTestId("summary-line")).toHaveLength(1)
    expect(within(summary).queryByText("Rush Production")).toBeNull()
    const rows = Array.from(summary.querySelectorAll("[data-testid^=order-]")).map((el) => el.getAttribute("data-testid"))
    expect(rows).toEqual(["order-items", "order-rush", "order-delivery", "order-total"])
    expect(plain(screen.getByTestId("order-items").textContent)).toBe("Items (2)PKR 4,000")
    expect(plain(screen.getByTestId("order-rush").textContent)).toBe("Rush productionPKR 800")
    expect(plain(screen.getByTestId("order-total").textContent)).toBe("TotalPKR 5,050")
    expect(screen.getByTestId("order-delivery-date")).toHaveTextContent("Delivered by Friday 27 November")
  }

  it("the confirmation: the row, the total and the kept rush date, also in what happens next", () => {
    render(<OrderCompletedTemplate view={orderConfirmationView({ order, promise })} ownOrder={false} />)
    check()
    expect(screen.getByTestId("order-next-steps")).toHaveTextContent("It's delivered by Friday 27 November.")
  })

  it("the account's order page", () => {
    render(<AccountOrderTemplate view={accountOrderView({ order, promise })} />)
    check()
  })
})
