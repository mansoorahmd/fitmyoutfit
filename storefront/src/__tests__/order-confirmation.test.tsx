import { act, render, screen, within } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { orderGb, orderPk, orderPromisePk } from "./fixtures/m1-checkout"

const { moves } = vi.hoisted(() => ({
  moves: { calls: [] as string[], result: true as boolean, refreshed: 0 },
}))

vi.mock("next/navigation", () => ({
  useParams: () => ({ countryCode: "pk" }),
  useRouter: () => ({
    refresh: () => {
      moves.refreshed += 1
    },
  }),
}))
vi.mock("next/image", () => ({
  // eslint-disable-next-line @next/next/no-img-element
  default: ({ src, alt }: { src: string; alt: string }) => <img src={src} alt={alt} />,
}))
vi.mock("@lib/data/cart", () => ({
  moveCartToRegion: async (countryCode: string) => {
    moves.calls.push(countryCode)
    return moves.result
  },
}))

import { orderConfirmationView, parseOrderPromise } from "@lib/util/order-confirmation"
import MoveCartToRegion from "@modules/cart/components/move-cart-to-region"
import OrderCompletedTemplate from "@modules/order/templates/order-completed-template"

const plain = (s: string | null | undefined) => s?.replace(/\s/g, " ")

const renderPk = (ownOrder = false) =>
  render(
    <OrderCompletedTemplate
      view={orderConfirmationView({ order: orderPk, promise: parseOrderPromise(orderPromisePk), countryName: "Pakistan" })}
      ownOrder={ownOrder}
    />
  )

describe("order confirmation (05, 7)", () => {
  it("thanks the customer by the Urdu first name, isolated, and gives the order number and date", () => {
    renderPk()
    const h1 = screen.getByRole("heading", { level: 1 })
    expect(h1).toHaveTextContent("Thank you, محمد علی")
    expect(within(h1).getByText("محمد علی").tagName).toBe("BDI")
    expect(screen.getByText("Your order is placed.")).toBeInTheDocument()
    expect(screen.getByTestId("order-number")).toHaveTextContent("#1")
    expect(screen.getByTestId("order-placed-on")).toHaveTextContent("Placed on 12 November 2026")
    expect(screen.getByText("Your confirmation is on this page. Keep the order number.")).toBeInTheDocument()
  })

  it("shows the promised date from the order, and in What happens next", () => {
    renderPk()
    expect(screen.getByTestId("order-delivery-date")).toHaveTextContent("Delivered by Friday 27 November")
    expect(screen.getByTestId("order-next-steps")).toHaveTextContent("It's delivered by Friday 27 November.")
  })

  it("cash on delivery: the amount to pay on delivery, and the method", () => {
    renderPk()
    expect(plain(screen.getByTestId("order-payment-line").textContent)).toBe(
      "Pay PKR 2,250 in cash when your order arrives."
    )
    expect(screen.getByTestId("order-payment-method")).toHaveTextContent("Cash on delivery")
  })

  it("lists the lines and the totals with the currency code", () => {
    renderPk()
    const summary = screen.getByTestId("order-summary")
    expect(plain(within(summary).getByTestId("summary-line").textContent)).toBe("T-ShirtSize: M · × 1PKR 2,000")
    expect(plain(within(summary).getByTestId("order-items").textContent)).toBe("Items (1)PKR 2,000")
    expect(plain(within(summary).getByTestId("order-delivery").textContent)).toBe("Delivery in PakistanPKR 250")
    expect(plain(within(summary).getByTestId("order-total").textContent)).toBe("TotalPKR 2,250")
  })

  it("has no 'Tax not final', and promises no email and no account link-up", () => {
    renderPk()
    const text = document.body.textContent ?? ""
    expect(text).not.toMatch(/tax not final/i)
    expect(text).not.toMatch(/sent a confirmation|email/i)
    expect(text).not.toMatch(/appear in your account|linked/i)
  })

  it("gives the delivery address in lines, each isolated, with the phone", () => {
    renderPk()
    const address = screen.getByTestId("order-address")
    const lines = within(address).getAllByTestId("address-line").map((l) => l.textContent)
    expect(lines).toEqual(["محمد علی", "House 1, Street 2", "Block C", "Lahore", "Punjab", "Pakistan"])
    expect(within(address).getByText("0300 1234567")).toHaveAttribute("dir", "ltr")
  })

  it("guests: Create an account with the email; everyone: Back to the store", () => {
    renderPk()
    expect(screen.getByRole("link", { name: "Create an account" })).toHaveAttribute(
      "href",
      "/pk/account?view=create&email=ali%40example.com"
    )
    expect(screen.getByTestId("back-to-store")).toHaveAttribute("href", "/pk")
  })

  it("the signed-in customer's own order: See all your orders instead", () => {
    renderPk(true)
    expect(screen.queryByRole("link", { name: "Create an account" })).toBeNull()
    expect(screen.getByRole("link", { name: "See all your orders" })).toHaveAttribute("href", "/pk/account/orders")
  })

  it("United Kingdom: GBP, 'Included' for the duty-paid line, and the test payment line", () => {
    render(<OrderCompletedTemplate view={orderConfirmationView({ order: orderGb, promise: null })} ownOrder={false} />)
    expect(plain(screen.getByTestId("order-delivery").textContent)).toBe("Shipping & duties includedIncluded")
    expect(plain(screen.getByTestId("order-total").textContent)).toBe("TotalGBP 220.00")
    expect(document.body.textContent).not.toContain("GBP 0.00")
    expect(screen.getByTestId("order-payment-line")).toHaveTextContent("Test payment. No money was taken.")
  })

  it("leaves the date out when the order kept none, and says how it is delivered instead", () => {
    render(<OrderCompletedTemplate view={orderConfirmationView({ order: orderGb, promise: null })} ownOrder={false} />)
    expect(screen.queryByTestId("order-delivery-date")).toBeNull()
    expect(screen.getByTestId("order-next-steps")).toHaveTextContent("We deliver it to the address below.")
    expect(document.body.textContent).not.toMatch(/Delivered by/)
  })
})

describe("a cart from another region (AC 7)", () => {
  beforeEach(() => {
    moves.calls = []
    moves.result = true
    moves.refreshed = 0
  })

  it("shows the page's skeleton while it moves the cart to the URL's region", () => {
    render(<MoveCartToRegion countryCode="pk" fallback={<p>skeleton</p>} />)
    expect(screen.getByTestId("moving-cart")).toHaveTextContent("skeleton")
  })

  it("moves it once and reads the page again; still shown afterwards, it stops instead of looping", async () => {
    await act(async () => {
      render(<MoveCartToRegion countryCode="pk" fallback={<p>skeleton</p>} />)
    })
    expect(moves.calls).toEqual(["pk"])
    expect(moves.refreshed).toBe(1)
    // the stand-in refresh changes nothing, as if the cart hadn't followed
    expect(screen.getByTestId("server-error")).toBeInTheDocument()
    expect(moves.calls).toEqual(["pk"])
  })

  it("shows the server-error block when the cart can't be moved", async () => {
    moves.result = false
    await act(async () => {
      render(<MoveCartToRegion countryCode="pk" fallback={<p>skeleton</p>} />)
    })
    expect(screen.getByTestId("server-error")).toBeInTheDocument()
  })
})
