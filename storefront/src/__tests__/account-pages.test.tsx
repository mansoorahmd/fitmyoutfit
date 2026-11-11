import { act, fireEvent, render, screen, within } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const { calls } = vi.hoisted(() => ({
  calls: { signout: [] as string[], removed: [] as string[], removeAnswer: { kind: "saved" } as unknown },
}))

vi.mock("next/navigation", () => ({
  useParams: () => ({ countryCode: "pk" }),
  useRouter: () => ({ push: () => {}, refresh: () => {} }),
}))
vi.mock("next/image", () => ({
  // eslint-disable-next-line @next/next/no-img-element
  default: ({ src, alt }: { src: string; alt: string }) => <img src={src} alt={alt} />,
}))
vi.mock("@lib/data/customer", () => ({
  signout: async (countryCode: string) => {
    calls.signout.push(countryCode)
  },
  deleteCustomerAddress: async (id: string) => {
    calls.removed.push(id)
    return calls.removeAnswer
  },
  addCustomerAddress: async () => ({ kind: "saved" }),
  updateCustomerAddress: async () => ({ kind: "saved" }),
  updateCustomerName: async () => ({ kind: "saved" }),
  updateCustomerPhone: async () => ({ kind: "saved" }),
}))

import { addressCardView, sortAddresses, storeCountries } from "@lib/util/account-address"
import { accountOrderView, orderCardView } from "@lib/util/account-orders"
import { profileRows } from "@lib/util/account-rows"
import { parseOrderPromise } from "@lib/util/order-confirmation"
import AddressBook from "@modules/account/components/address-book"
import { NoOrders, OrderList } from "@modules/account/components/order-list"
import ProfileRows from "@modules/account/components/profile-rows"
import AccountFrame from "@modules/account/templates/account-frame"
import AccountOrderTemplate from "@modules/account/templates/account-order-template"
import AccountOverview from "@modules/account/templates/account-overview"

import { customer, orderGbAccount, orderListPk, orderPkCollected, orderPkDue, promisePk, regions } from "./fixtures/account"

const plain = (s: string | null | undefined) => s?.replace(/\s/g, " ")
const promise = parseOrderPromise(promisePk)
const countries = storeCountries(regions)

beforeEach(() => {
  calls.signout = []
  calls.removed = []
  calls.removeAnswer = { kind: "saved" }
})

describe("the account frame (05, 9.1)", () => {
  it("overview: the title band with the Urdu name isolated, the email, and the menu twice (phone rows, side column)", () => {
    render(
      <AccountFrame page="overview" customer={customer}>
        <p>content</p>
      </AccountFrame>
    )
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Your account")
    const hello = screen.getByTestId("account-hello")
    expect(hello).toHaveTextContent("Hello, محمد علی")
    expect(within(hello).getByText("محمد علی").tagName).toBe("BDI")
    expect(screen.getByTestId("account-email")).toHaveTextContent(customer.email)
    expect(screen.getByTestId("account-menu-rows")).toBeInTheDocument()
    expect(screen.getByTestId("account-menu-side")).toBeInTheDocument()
    expect(screen.queryByTestId("account-back")).toBeNull()
    // no starter leftovers
    expect(screen.queryByText(/Got questions/)).toBeNull()
    expect(screen.queryByText(/completed/)).toBeNull()
  })

  it("inner page: the back link, no title band, the current item marked, no phone rows", () => {
    render(
      <AccountFrame page="orders" customer={customer}>
        <h1>Your orders</h1>
      </AccountFrame>
    )
    expect(screen.getByTestId("account-back")).toHaveAttribute("href", "/pk/account")
    expect(screen.getByTestId("account-back")).toHaveTextContent("Your account")
    expect(screen.queryByTestId("account-title-band")).toBeNull()
    expect(screen.queryByTestId("account-menu-rows")).toBeNull()
    const side = screen.getByTestId("account-menu-side")
    expect(within(side).getByRole("link", { name: "Orders" })).toHaveAttribute("aria-current", "page")
    expect(within(side).getByRole("link", { name: "Profile" })).not.toHaveAttribute("aria-current")
  })

  it("signs out with no confirm step, showing Signing out…", async () => {
    render(
      <AccountFrame page="profile" customer={customer}>
        <p />
      </AccountFrame>
    )
    await act(async () => {
      fireEvent.click(within(screen.getByTestId("account-menu-side")).getByRole("button", { name: "Sign out" }))
    })
    expect(calls.signout).toEqual(["pk"])
  })
})

describe("order history and overview (05, 9.2 and 9.3)", () => {
  const cards = orderListPk.orders.map((o: any) => orderCardView(o, promise))

  it("each card is one link named with the number and date, with the status in words", () => {
    render(<OrderList cards={cards} moreHref="/account/orders?shown=20" />)
    const link = screen.getByRole("link", { name: "Order #1, placed 12 November 2026" })
    expect(link).toHaveAttribute("href", "/pk/account/orders/details/order_01M768NPZTPMSBTP33ES97Z3KX")
    expect(plain(within(link).getByTestId("order-card-meta").textContent)).toBe("Placed on 12 November 2026 · 1 piece · PKR 2,250")
    expect(within(link).getByTestId("order-status")).toHaveTextContent("Order placed")
    expect(within(link).getByTestId("order-card-date")).toHaveTextContent("Delivered by Friday 27 November")
    expect(screen.getByRole("link", { name: "Show more orders" })).toHaveAttribute("href", "/pk/account/orders?shown=20")
  })

  it("the empty state is the heading and the home page's button", () => {
    render(<NoOrders />)
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent("No orders yet")
    expect(screen.getByRole("link", { name: "Start your team kit" })).toHaveAttribute("href", "/pk/store")
  })

  it("overview: recent orders with See all orders, and the default address", () => {
    const address = addressCardView(customer.addresses[0], "Pakistan")
    render(<AccountOverview orders={cards} address={address} />)
    expect(screen.getByRole("link", { name: "See all orders" })).toHaveAttribute("href", "/pk/account/orders")
    expect(screen.getByTestId("overview-address")).toHaveTextContent("Ali Raza")
    expect(screen.getByRole("link", { name: "Manage addresses" })).toHaveAttribute("href", "/pk/account/addresses")
  })

  it("overview with nothing yet: No orders yet, and No saved address yet. with Add an address", () => {
    render(<AccountOverview orders={[]} address={null} />)
    expect(screen.getByText("No orders yet")).toBeInTheDocument()
    expect(screen.getByText("No saved address yet.")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Add an address" })).toHaveAttribute("href", "/pk/account/addresses")
  })

  it("overview: the orders couldn't load", () => {
    render(<AccountOverview orders={null} address={null} />)
    expect(screen.getByText("We couldn't load your orders.")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument()
  })
})

describe("one order (05, 9.4)", () => {
  it("Pakistan, cash on delivery due: number, status, date, the amount to pay, lines, totals, address, method", () => {
    render(<AccountOrderTemplate view={accountOrderView({ order: orderPkDue, promise, countryName: "Pakistan" })} />)
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Order #1")
    expect(screen.getByTestId("order-status")).toHaveTextContent("Order placed")
    expect(screen.getByTestId("order-placed-on")).toHaveTextContent("Placed on 12 November 2026")
    expect(screen.getByTestId("order-delivery-date")).toHaveTextContent("Delivered by Friday 27 November")
    expect(plain(screen.getByTestId("order-payment-line").textContent)).toBe("Pay PKR 2,250 in cash when your order arrives.")
    expect(plain(screen.getByTestId("order-delivery").textContent)).toBe("Delivery in PakistanPKR 250")
    expect(plain(screen.getByTestId("order-total").textContent)).toBe("TotalPKR 2,250")
    expect(screen.getByTestId("order-payment-method")).toHaveTextContent("Cash on delivery")
    expect(document.body.textContent).not.toMatch(/tax not final/i)
  })

  it("cash collected: says it was paid", () => {
    render(<AccountOrderTemplate view={accountOrderView({ order: orderPkCollected, promise })} />)
    expect(screen.getByTestId("order-payment-line")).toHaveTextContent("Paid in cash on delivery.")
  })

  it("UK: GBP and Included for the duty-paid line; no date line without a promise", () => {
    render(<AccountOrderTemplate view={accountOrderView({ order: orderGbAccount, promise: null, countryName: "United Kingdom" })} />)
    expect(plain(screen.getByTestId("order-delivery").textContent)).toBe("Shipping & duties includedIncluded")
    expect(plain(screen.getByTestId("order-total").textContent)).toBe("TotalGBP 220.00")
    expect(screen.queryByTestId("order-delivery-date")).toBeNull()
  })
})

describe("addresses (05, 9.5)", () => {
  const saved = sortAddresses(customer.addresses)
  const view = (list = saved) => (
    <AddressBook
      cards={list.map((a: any) => addressCardView(a, "Pakistan"))}
      saved={list}
      countries={countries}
      countryCode="pk"
    />
  )

  it("the empty state says why to add one", () => {
    render(view([]))
    expect(screen.getByText("No saved addresses yet. Add one to check out faster.")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Add an address" })).toBeInTheDocument()
  })

  it("cards: Default, and Edit and Remove named with the first line", () => {
    render(view())
    expect(screen.getByTestId("address-card-default")).toHaveTextContent("Default")
    expect(screen.getByRole("button", { name: "Edit address, 12 Mall Road" })).toHaveTextContent("Edit")
    expect(screen.getByRole("button", { name: "Remove address, 12 Mall Road" })).toHaveTextContent("Remove")
  })

  it("the form has the checkout's fields with the phone and the default box, in the visitor's country", async () => {
    render(view())
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Add an address" }))
    })
    const form = await screen.findByTestId("address-form")
    expect(within(form).getByLabelText("Country")).toHaveValue("pk")
    expect(within(form).getByLabelText("Province")).toBeInTheDocument()
    expect(within(form).getByLabelText("Postal code (optional)")).toBeInTheDocument()
    expect(within(form).getByLabelText("Phone")).toHaveAttribute("dir", "ltr")
    expect(within(form).getByLabelText("Make this my default address")).not.toBeChecked()
    fireEvent.change(within(form).getByLabelText("Country"), { target: { value: "ae" } })
    expect(within(form).getByLabelText("Emirate")).toBeInTheDocument()
    expect(within(form).queryByLabelText(/Postal code|Postcode|ZIP/)).toBeNull()
    await act(async () => {
      fireEvent.click(within(form).getByRole("button", { name: "Save address" }))
    })
    expect(within(form).getAllByText("Enter a phone number").length).toBeGreaterThan(0)
    expect(within(form).getByTestId("error-list")).toBeInTheDocument()
  })

  it("asks before removing, and says so when removing fails", async () => {
    calls.removeAnswer = { kind: "failed" }
    render(view())
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Remove address, 12 Mall Road" }))
    })
    expect(await screen.findByText("Remove this address?")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Keep it" })).toBeInTheDocument()
    await act(async () => {
      fireEvent.click(screen.getByTestId("address-remove-confirm"))
    })
    expect(calls.removed).toEqual(["cuaddr_01M7678DBMDWFFATJ1Q7K2J6S5"])
    expect(await screen.findByText("We couldn't remove the address.")).toBeInTheDocument()
  })
})

describe("profile (05, 9.6)", () => {
  it("shows name, phone and a read-only email; no password row", () => {
    render(<ProfileRows rows={profileRows(customer)} initial={{ firstName: "محمد علی", lastName: "", phone: "0300 1234567" }} />)
    expect(screen.getByRole("button", { name: "Edit Name" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Edit Phone" })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Edit Email" })).toBeNull()
    expect(screen.getByTestId("profile-value-email")).toHaveTextContent(customer.email)
    expect(screen.queryByText("Password")).toBeNull()
  })

  it("edits a row in place and says Saved", async () => {
    render(<ProfileRows rows={profileRows(customer)} initial={{ firstName: "محمد علی", lastName: "", phone: "0300 1234567" }} />)
    fireEvent.click(screen.getByRole("button", { name: "Edit Name" }))
    expect(screen.getByLabelText("First name")).toHaveValue("محمد علی")
    expect(screen.getByLabelText("First name")).toHaveAttribute("dir", "auto")
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Save" }))
    })
    expect(screen.getByRole("status")).toHaveTextContent("Saved")
    expect(screen.queryByLabelText("First name")).toBeNull()
  })
})
