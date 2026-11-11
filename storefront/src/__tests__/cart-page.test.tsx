import { act, fireEvent, render, screen, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { cartFixture, lineFixture, rulesFixture } from "./fixtures/m1"

// Plain stand-ins for the server actions, recording their calls.
const { actions } = vi.hoisted(() => ({
  actions: {
    calls: [] as { name: string; args: unknown }[],
    result: (() => Promise.resolve()) as (name: string) => Promise<void>,
  },
}))

vi.mock("@lib/data/cart", () => {
  const record =
    (name: string) =>
    (args: unknown) => {
      actions.calls.push({ name, args })
      return actions.result(name)
    }
  return {
    updateLineItem: record("update"),
    deleteLineItem: record("delete"),
    addToCart: record("add"),
  }
})
vi.mock("next/navigation", () => ({
  useParams: () => ({ countryCode: "gb" }),
}))
vi.mock("next/image", () => ({
  // eslint-disable-next-line @next/next/no-img-element
  default: ({ src, alt }: { src: string; alt: string }) => <img src={src} alt={alt} />,
}))

import { UndoToastProvider } from "@modules/cart/components/undo-toast/provider"
import CartTemplate from "@modules/cart/templates"
import { parseCheckoutRules } from "@lib/util/checkout-rules"

const plain = (s: string | null | undefined) => s?.replace(/\s/g, " ")

type Setup = Partial<Parameters<typeof CartTemplate>[0]>
const renderCart = (setup: Setup = {}) =>
  render(
    <UndoToastProvider>
      <CartTemplate
        cart={cartFixture()}
        rules={parseCheckoutRules(rulesFixture())}
        shippingOptions={[{ name: "Shipping & duties included", data: { ddp: true } }]}
        countryCode="gb"
        isGuest={true}
        {...setup}
      />
    </UndoToastProvider>
  )

const callsOf = (name: string) => actions.calls.filter((c) => c.name === name)

beforeEach(() => {
  actions.calls = []
  actions.result = () => Promise.resolve()
})

afterEach(() => {
  vi.useRealTimers()
})

describe("cart page", () => {
  it("has the title with the piece count, and each line's size, unit price and total", () => {
    renderCart()

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Your cart4 pieces")
    const line = screen.getByTestId("cart-line")
    expect(plain(within(line).getByTestId("cart-line-meta").textContent)).toBe(
      "Size: M · GBP 22.00 each"
    )
    expect(plain(within(line).getByTestId("cart-line-total").textContent)).toBe("GBP 88.00")
    expect(within(line).getByRole("button", { name: "Remove Jersey, size M" })).toBeInTheDocument()
    expect(within(line).getByRole("textbox", { name: "Quantity, Jersey, size M" })).toHaveValue("4")
  })

  it("keeps amounts left to right and unbroken", () => {
    renderCart()
    const total = screen.getByTestId("cart-line-total")
    expect(total).toHaveAttribute("dir", "ltr")
    expect(total).toHaveClass("whitespace-nowrap")
  })

  it("shows an Arabic or Urdu product name isolated, so it renders right to left", () => {
    renderCart({
      cart: cartFixture({ items: [lineFixture({ product_title: "محمد علی" })] }),
    })
    const title = screen.getByText("محمد علی")
    expect(title.tagName).toBe("BDI")
  })

  it("shows the summary: items, the duty-paid line as Included, the total, the tax note and the date", () => {
    renderCart({
      rules: parseCheckoutRules(rulesFixture({ minimum_quantity: { required: 10, counted: 12, ok: true } })),
    })
    const summary = screen.getByTestId("cart-summary")
    expect(plain(within(summary).getByTestId("summary-items").textContent)).toBe("Items (4)GBP 88.00")
    expect(within(summary).getByTestId("summary-delivery")).toHaveTextContent(
      "Shipping & duties includedIncluded"
    )
    expect(within(summary).getByTestId("summary-total")).toHaveTextContent(/^Total/)
    expect(within(summary).getByTestId("summary-tax-note")).toHaveTextContent("Tax not final")
    expect(within(summary).getByTestId("delivery-date-line")).toHaveTextContent(
      "Delivered by Thursday 26 November"
    )
    // no "Taxes" row while the tax isn't final, and no promotion code field
    expect(summary).not.toHaveTextContent(/taxes/i)
    expect(screen.queryByText(/promotion/i)).toBeNull()
  })

  it("in Pakistan, says delivery is added at checkout and labels the total 'before delivery'", () => {
    renderCart({
      countryCode: "pk",
      cart: cartFixture({ currency_code: "pkr", items: [lineFixture({ unit_price: 3500, total: 14000 })], total: 14000, item_subtotal: 14000 }),
      rules: parseCheckoutRules(rulesFixture({ minimum_quantity: { required: 1, counted: 4, ok: true } })),
      shippingOptions: [{ name: "Delivery in Pakistan" }],
    })
    expect(screen.getByTestId("summary-delivery")).toHaveTextContent("Delivery in PakistanAdded at checkout")
    expect(screen.getByTestId("summary-total")).toHaveTextContent(/^Total before delivery/)
    expect(screen.queryByTestId("summary-delivery")).not.toHaveTextContent("PKR 0")
    // Pakistan never sees the minimum
    expect(screen.queryByTestId("minimum-progress")).toBeNull()
    expect(screen.queryByTestId("cart-minimum-alert")).toBeNull()
  })

  it("in Pakistan over the cash on delivery limit, gives the limit from the rules", () => {
    renderCart({
      countryCode: "pk",
      rules: parseCheckoutRules(
        rulesFixture({
          minimum_quantity: { required: 1, counted: 4, ok: true },
          cash_on_delivery: { available: false, reason: "over_limit", limit: 20000, limit_currency_code: "pkr" },
        })
      ),
    })
    expect(plain(screen.getByTestId("summary-cod-note").textContent)).toBe(
      "Cash on delivery is for orders up to PKR 20,000."
    )
  })

  describe("below the minimum", () => {
    it("shows the alert at the top and the progress in the summary", () => {
      renderCart()
      const alert = screen.getByTestId("cart-minimum-alert")
      expect(alert).toHaveTextContent("4 of 10 garment pieces")
      expect(alert).toHaveTextContent("Add 6 more to check out. Mix any sizes and garments.")
      expect(within(screen.getByTestId("cart-summary")).getByTestId("minimum-progress")).toBeInTheDocument()
    })

    it("makes checkout inactive with its reason, and a press goes to the alert instead", () => {
      renderCart()
      const button = screen.getByTestId("checkout-button")
      expect(button.tagName).toBe("BUTTON")
      expect(button).toHaveAttribute("aria-disabled", "true")
      expect(button).toHaveAccessibleDescription("Add 6 more to check out. Mix any sizes and garments.")

      fireEvent.click(button)
      expect(screen.getByTestId("cart-minimum-alert")).toHaveFocus()
    })
  })

  it("at the minimum, says it is reached and checkout is a link", () => {
    renderCart({
      rules: parseCheckoutRules(rulesFixture({ minimum_quantity: { required: 10, counted: 12, ok: true } })),
    })
    expect(screen.queryByTestId("cart-minimum-alert")).toBeNull()
    expect(screen.getByTestId("cart-summary")).toHaveTextContent("Minimum reached: 12 garment pieces")
    expect(screen.getByTestId("checkout-button")).toHaveAttribute("href", "/gb/checkout?step=address")
  })

  it("when the rules fail to load, leaves out the date and the minimum, says so, and keeps checkout usable", () => {
    renderCart({ rules: null })
    expect(screen.getByTestId("summary-rules-failed")).toHaveTextContent(
      "Some details couldn't load. Refresh the page to try again."
    )
    expect(screen.queryByTestId("delivery-date-line")).toBeNull()
    expect(screen.queryByTestId("minimum-progress")).toBeNull()
    expect(screen.queryByTestId("cart-minimum-alert")).toBeNull()
    const checkout = screen.getByTestId("checkout-button")
    expect(checkout.tagName).toBe("A")
    expect(checkout).toHaveAttribute("href", "/gb/checkout?step=address")
  })

  it("asks guests to sign in under the button, and not signed-in customers", () => {
    const { unmount } = renderCart()
    expect(screen.getByTestId("cart-sign-in")).toHaveTextContent("Have an account? Sign in")
    expect(within(screen.getByTestId("cart-sign-in")).getByRole("link")).toHaveAttribute(
      "href",
      "/gb/account?next=/cart"
    )
    unmount()
    renderCart({ isGuest: false })
    expect(screen.queryByTestId("cart-sign-in")).toBeNull()
  })

  it("marks the fit kit as a refundable deposit not counted towards the minimum (export)", () => {
    renderCart({
      cart: cartFixture({
        items: [lineFixture({ product_title: "Fit kit", variant_title: "Default variant", product: { metadata: { kind: "fit_kit" } } })],
      }),
    })
    const line = screen.getByTestId("cart-line")
    expect(line).toHaveTextContent("Refundable deposit")
    expect(line).toHaveTextContent("Not counted towards the minimum")
    expect(within(line).getByTestId("cart-line-meta")).not.toHaveTextContent("Size")
  })

  describe("changing the quantity", () => {
    it("saves 600 ms after the last press, showing 'Updating…' while it saves", async () => {
      vi.useFakeTimers()
      let finish: () => void = () => {}
      actions.result = () => new Promise<void>((resolve) => (finish = resolve))
      renderCart({
        rules: parseCheckoutRules(rulesFixture({ minimum_quantity: { required: 10, counted: 12, ok: true } })),
      })

      fireEvent.click(screen.getByTestId("quantity-increase"))
      fireEvent.click(screen.getByTestId("quantity-increase"))
      expect(screen.getByTestId("quantity-input")).toHaveValue("6")
      act(() => {
        vi.advanceTimersByTime(599)
      })
      expect(callsOf("update")).toHaveLength(0)

      act(() => {
        vi.advanceTimersByTime(1)
      })
      expect(callsOf("update")).toEqual([{ name: "update", args: { lineId: "cali_1", quantity: 6 } }])
      expect(screen.getByTestId("checkout-button")).toHaveTextContent("Updating…")
      expect(screen.getByTestId("cart-line-total")).toHaveAttribute("data-loading", "true")

      await act(async () => {
        finish()
      })
      expect(screen.getByTestId("checkout-button")).not.toHaveTextContent("Updating…")
    })

    it("goes back to the saved number and offers Try again when the save fails", async () => {
      vi.useFakeTimers()
      actions.result = () => Promise.reject(new Error("no"))
      renderCart()

      fireEvent.click(screen.getByTestId("quantity-increase"))
      await act(async () => {
        vi.advanceTimersByTime(600)
      })

      expect(screen.getByTestId("quantity-input")).toHaveValue("4")
      const error = screen.getByTestId("cart-line-error")
      expect(error).toHaveTextContent("We couldn't change the quantity. Try again.")
      expect(within(error).getByRole("button", { name: "Try again" })).toBeInTheDocument()
    })

    it("snaps a typed number out of range back, and says why", () => {
      renderCart()
      const field = screen.getByTestId("quantity-input")
      fireEvent.change(field, { target: { value: "1200" } })
      fireEvent.blur(field)
      expect(field).toHaveValue("4")
      expect(screen.getByTestId("quantity-range-error")).toHaveTextContent("Enter a number from 1 to 999")
      expect(callsOf("update")).toHaveLength(0)
    })
  })

  describe("removing a line", () => {
    it("removes it, then offers Undo, which adds the same size and quantity back", async () => {
      renderCart()

      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: "Remove Jersey, size M" }))
      })
      expect(callsOf("delete")).toEqual([{ name: "delete", args: "cali_1" }])
      const toast = screen.getByTestId("undo-toast")
      expect(toast).toHaveAttribute("role", "status")
      expect(toast).toHaveTextContent("Removed: Jersey, M × 4")

      await act(async () => {
        fireEvent.click(within(toast).getByRole("button", { name: "Undo" }))
      })
      expect(callsOf("add")).toEqual([
        { name: "add", args: { variantId: "var_M", quantity: 4, countryCode: "gb" } },
      ])
      expect(screen.queryByTestId("undo-toast")).toBeNull()
    })

    it("closes the toast after 8 seconds", async () => {
      vi.useFakeTimers()
      renderCart()
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: "Remove Jersey, size M" }))
      })
      expect(screen.getByTestId("undo-toast")).toBeInTheDocument()
      act(() => {
        vi.advanceTimersByTime(8000)
      })
      expect(screen.queryByTestId("undo-toast")).toBeNull()
    })

    it("says so under the line when the removal fails", async () => {
      actions.result = (name) => (name === "delete" ? Promise.reject(new Error("no")) : Promise.resolve())
      renderCart()
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: "Remove Jersey, size M" }))
      })
      expect(screen.getByTestId("cart-line-error")).toHaveTextContent("We couldn't remove this. Try again.")
      expect(screen.queryByTestId("undo-toast")).toBeNull()
    })
  })

  it("has a sticky checkout bar for phones, hidden while the summary's button is on screen", () => {
    renderCart()
    const bar = screen.getByTestId("sticky-checkout-bar")
    expect(bar).toHaveClass("lg:hidden")
    expect(bar).toHaveTextContent("4 of 10 garment pieces")
    expect(within(bar).getByTestId("sticky-checkout-button")).toHaveTextContent("Checkout")
  })
})
