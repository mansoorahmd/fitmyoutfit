import { act, fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { checkoutCartGb, providersPk, optionPk, rulesPkAvailable, checkoutCartPk } from "./fixtures/m1-checkout"

// S1-11 point 2. A form whose inputs have a `name` is sent as a plain GET by the browser when the
// button is pressed before the page's script has loaded: the email and the password then appear in
// the address bar, in history and in logs. No field of a form with a password or personal data may
// have a name. (A radio group needs one to be a group; it carries only a saved address's opaque id.)

vi.mock("@modules/account/load-page", () => ({ loadPage: () => {} }))
vi.mock("next/navigation", () => ({
  useParams: () => ({ countryCode: "pk" }),
  useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => {} }),
  useSearchParams: () => new URLSearchParams("step=address"),
}))
vi.mock("next/image", () => ({
  // eslint-disable-next-line @next/next/no-img-element
  default: ({ src, alt }: { src: string; alt: string }) => <img src={src} alt={alt} />,
}))
vi.mock("@lib/data/customer", () => ({
  signIn: async () => ({ kind: "problem", problem: "wrong" }),
  signUp: async () => ({ kind: "problem", problem: "wrong" }),
  signout: async () => ({ href: "/pk/account" }),
  deleteCustomerAddress: async () => ({ kind: "saved" }),
  addCustomerAddress: async () => ({ kind: "saved" }),
  updateCustomerAddress: async () => ({ kind: "saved" }),
  updateCustomerName: async () => ({ kind: "saved" }),
  updateCustomerPhone: async () => ({ kind: "saved" }),
}))
vi.mock("@lib/data/checkout", () => ({
  saveAddressStep: async () => ({ kind: "saved", delivery: true }),
  retryDelivery: async () => ({ ok: true }),
  choosePayment: async () => ({ ok: true }),
  placeOrder: async () => ({ kind: "refused" }),
  explainRefusedOrder: async () => ({ kind: "generic" }),
}))

import { addressCardView, sortAddresses, storeCountries } from "@lib/util/account-address"
import { parseCheckoutRules } from "@lib/util/checkout-rules"
import { checkoutView } from "@lib/util/checkout-view"
import AddressBook from "@modules/account/components/address-book"
import ProfileRows from "@modules/account/components/profile-rows"
import AuthTemplate from "@modules/account/templates/auth-template"
import CheckoutPage from "@modules/checkout/templates/checkout-page"

import { customer, regions } from "./fixtures/account"

/** Every input, select and textarea of every form on the page that has a name (radios and the like are listed apart). */
const namedFields = (root: HTMLElement) =>
  Array.from(root.querySelectorAll("form input[name], form select[name], form textarea[name]")).map(
    (el) => `${el.tagName.toLowerCase()}[name=${el.getAttribute("name")}]#${el.id}`
  )

describe("a submit before the script loads puts nothing in the address", () => {
  it("sign-in has no named field and keeps its autocomplete values", () => {
    const { container } = render(<AuthTemplate view="signin" next="/cart" email="" />)
    expect(container.querySelectorAll("form input").length).toBeGreaterThanOrEqual(2)
    expect(namedFields(container)).toEqual([])
    expect(screen.getByLabelText("Email")).toHaveAttribute("autocomplete", "email")
    expect(screen.getByLabelText("Password")).toHaveAttribute("autocomplete", "current-password")
  })

  it("create account has no named field and keeps its autocomplete values", () => {
    const { container } = render(<AuthTemplate view="create" next="/cart" email="" />)
    expect(namedFields(container)).toEqual([])
    expect(screen.getByLabelText("Email")).toHaveAttribute("autocomplete", "email")
    expect(screen.getByLabelText("Password")).toHaveAttribute("autocomplete", "new-password")
    expect(screen.getByLabelText("First name")).toHaveAttribute("autocomplete", "given-name")
    expect(screen.getByTestId("field-phone").querySelector("input")).toHaveAttribute("autocomplete", "tel")
  })

  it("the profile's name and phone edit forms have no named field", () => {
    const { container } = render(
      <ProfileRows email={customer.email} initial={{ firstName: "Ali", lastName: "Khan", phone: "0300 1234567" }} />
    )
    fireEvent.click(screen.getByRole("button", { name: "Edit Name" }))
    expect(container.querySelectorAll("form input").length).toBe(2)
    expect(namedFields(container)).toEqual([])
    fireEvent.click(screen.getByTestId("profile-cancel"))
    fireEvent.click(screen.getByRole("button", { name: "Edit Phone" }))
    expect(container.querySelectorAll("form input").length).toBe(1)
    expect(namedFields(container)).toEqual([])
    expect(screen.getByLabelText("Phone")).toHaveAttribute("autocomplete", "tel")
  })

  it("the account's address form has no named field, in Pakistan and in the UAE", async () => {
    const saved = sortAddresses(customer.addresses)
    render(
      <AddressBook
        cards={saved.map((a: any) => addressCardView(a, "Pakistan"))}
        saved={saved}
        countries={storeCountries(regions)}
        countryCode="pk"
      />
    )
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Add an address" }))
    })
    const form = await screen.findByTestId("address-form")
    expect(form.querySelectorAll("input, select").length).toBeGreaterThan(8)
    expect(namedFields(form.parentElement as HTMLElement)).toEqual([])
    fireEvent.change(screen.getByLabelText("Country"), { target: { value: "ae" } })
    expect(screen.getByLabelText("Emirate")).toBeInTheDocument()
    expect(namedFields(form.parentElement as HTMLElement)).toEqual([])
    expect(screen.getByTestId("address-field-address_1").querySelector("input")).toHaveAttribute("autocomplete", "address-line1")
  })

  it("the checkout's contact and address form has no named text field or select, for Pakistan and the UK", () => {
    const pk = checkoutView({
      cart: checkoutCartPk({ id: "cart_a", email: null, shipping_address: null, billing_address: null }),
      rules: parseCheckoutRules(rulesPkAvailable),
      shippingOptions: [optionPk],
      providerIds: providersPk,
      customer: null,
      countryCode: "pk",
    })
    const { container, unmount } = render(<CheckoutPage view={pk} />)
    expect(container.querySelectorAll("form input").length).toBeGreaterThan(5)
    expect(namedFields(container)).toEqual([])
    expect(screen.getByLabelText("Email")).toHaveAttribute("autocomplete", "email")
    unmount()
    const gb = checkoutView({
      cart: checkoutCartGb({ id: "cart_b", email: null, shipping_address: null, billing_address: null }),
      rules: parseCheckoutRules(rulesPkAvailable),
      shippingOptions: [optionPk],
      providerIds: providersPk,
      customer: null,
      countryCode: "gb",
    })
    const second = render(<CheckoutPage view={gb} />)
    expect(namedFields(second.container)).toEqual([])
  })
})
