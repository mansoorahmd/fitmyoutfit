import { describe, expect, it } from "vitest"

import {
  AccountAddressValues,
  addressCardView,
  initialAccountAddress,
  nextDefaultAfterRemoval,
  overviewAddress,
  sortAddresses,
  storeCountries,
  storeCountryCodes,
  toCustomerAddress,
  validateAccountAddress,
} from "@lib/util/account-address"
import { addressFields, validateAddressForm } from "@lib/util/checkout-address"

import { customer, regions } from "./fixtures/account"

const codes = storeCountryCodes(regions)

const values = (over: Partial<AccountAddressValues["address"]> = {}, phone = "0300 1234567"): AccountAddressValues => ({
  address: { ...addressFields(null, "pk"), first_name: "محمد علی", address_1: "House 12", city: "Lahore", province: "pk-pb", ...over },
  phone,
  isDefault: false,
})

describe("the store's countries (05, 9.5, Country)", () => {
  it("lists every region's countries once, in the regions' order", () => {
    expect(storeCountries(regions)).toEqual([
      { code: "pk", name: "Pakistan" },
      { code: "gb", name: "United Kingdom" },
      { code: "ae", name: "United Arab Emirates" },
      { code: "us", name: "United States" },
    ])
    expect(storeCountries([...regions, regions[0]])).toHaveLength(4)
    expect(storeCountries(null)).toEqual([])
  })
})

describe("validateAccountAddress: the checkout's own rules", () => {
  it("accepts a complete address in each country", () => {
    expect(validateAccountAddress(values(), codes)).toEqual({})
    expect(validateAccountAddress(values({ country_code: "ae", province: "ae-du", city: "Dubai" }, "050 123 4567"), codes)).toEqual({})
    expect(validateAccountAddress(values({ country_code: "gb", province: "", postal_code: "NW1 6XE" }, "07700 900123"), codes)).toEqual({})
  })

  it("requires a phone in every region (decision 008)", () => {
    for (const c of ["pk", "gb", "ae", "us"]) {
      const v = values({ country_code: c, province: c === "us" ? "us-ny" : c === "ae" ? "ae-du" : c === "pk" ? "pk-pb" : "", postal_code: "10001" }, "")
      expect(validateAccountAddress(v, codes).phone, c).toBe("Enter a phone number")
    }
  })

  it("gives exactly the checkout's messages for the same fields, and no email message", () => {
    const empty = values({ first_name: "", address_1: "", city: "", province: "" }, "abc")
    const account = validateAccountAddress(empty, codes)
    const checkout = validateAddressForm(
      { email: "", phone: "abc", shipping: empty.address, billingSame: true, billing: empty.address, saveToAccount: false },
      codes
    )
    expect(account).toEqual({
      first_name: checkout["shipping.first_name"],
      address_1: checkout["shipping.address_1"],
      city: checkout["shipping.city"],
      province: checkout["shipping.province"],
      phone: checkout.phone,
    })
    expect(account).not.toHaveProperty("email")
  })

  it("follows the country: postcode required in the UK and US, none in the UAE, provinces from the lists", () => {
    expect(validateAccountAddress(values({ country_code: "gb", province: "", postal_code: "" }, "07700 900123"), codes).postal_code).toBe(
      "Enter a postcode"
    )
    expect(validateAccountAddress(values({ country_code: "ae", province: "pk-pb" }), codes).province).toBe(
      "Choose an emirate"
    )
    expect(validateAccountAddress(values({ country_code: "fr", province: "" }), codes).country_code).toBe("Choose a country")
  })
})

describe("toCustomerAddress", () => {
  it("is the checkout's address with the phone, and one default flag for delivery and billing", () => {
    const out = toCustomerAddress({ ...values({ country_code: "ae", province: "ae-du", postal_code: "123" }, " 050 123 4567 "), isDefault: true })
    expect(out).toMatchObject({
      first_name: "محمد علی",
      country_code: "ae",
      province: "ae-du",
      postal_code: "", // the UAE has no postal code field
      phone: "050 123 4567",
      is_default_shipping: true,
      is_default_billing: true,
    })
  })
})

describe("initial values, order and the overview's address", () => {
  it("starts a new address in the visitor's country, default when there is none yet", () => {
    expect(initialAccountAddress({ countryCode: "gb", hasDefault: false })).toMatchObject({
      address: { country_code: "gb" },
      phone: "",
      isDefault: true,
    })
    expect(initialAccountAddress({ countryCode: "gb", hasDefault: true }).isDefault).toBe(false)
  })

  it("starts an edit from the saved address (real answer)", () => {
    const saved = customer.addresses[0]
    expect(initialAccountAddress({ saved, countryCode: "gb", hasDefault: true })).toMatchObject({
      address: { first_name: "Ali", country_code: "pk", province: "pk-pb", address_1: "12 Mall Road" },
      phone: "0300 1234567",
      isDefault: true,
    })
  })

  it("puts the default first, then by when they were saved; the overview shows the first", () => {
    const a = { id: "a", created_at: "2026-11-01", is_default_shipping: false }
    const b = { id: "b", created_at: "2026-11-02", is_default_shipping: true }
    const c = { id: "c", created_at: "2026-10-01", is_default_shipping: false }
    expect(sortAddresses([a, b, c]).map((x) => x.id)).toEqual(["b", "c", "a"])
    expect(overviewAddress([])).toBeNull()
  })

  it("with no address marked as the default, the most recently added is the default (S1-11)", () => {
    const a = { id: "a", created_at: "2026-11-01", is_default_shipping: false }
    const c = { id: "c", created_at: "2026-10-01", is_default_shipping: null }
    const d: { id: string; created_at: string; is_default_shipping?: boolean | null } = { id: "d", created_at: "2026-11-05" }
    expect(overviewAddress([a, c])?.id).toBe("a")
    expect(overviewAddress([a, c])?.is_default_shipping).toBe(true)
    expect(sortAddresses([a, c, d]).map((x) => [x.id, !!x.is_default_shipping])).toEqual([
      ["d", true],
      ["c", false],
      ["a", false],
    ])
    expect(addressCardView(overviewAddress([a, c])!, "Pakistan").isDefault).toBe(true)
    // the stored list is not changed, and a marked default is kept as it is
    expect(a.is_default_shipping).toBe(false)
    expect(sortAddresses([{ ...a, is_default_shipping: true }, d]).map((x) => x.id)).toEqual(["a", "d"])
    expect(sortAddresses([])).toEqual([])
  })

  it("removing the default: the most recently added of the others becomes the default (QA S1-4c, m5)", () => {
    const old = { id: "old", created_at: "2026-10-01T10:00:00Z", is_default_shipping: false }
    const def = { id: "def", created_at: "2026-11-01T10:00:00Z", is_default_shipping: true }
    const newest = { id: "new", created_at: "2026-11-12T10:00:00Z", is_default_shipping: false }
    expect(nextDefaultAfterRemoval([old, def, newest], "def")?.id).toBe("new")
    expect(nextDefaultAfterRemoval([newest, def, old], "def")?.id).toBe("new")
    // not the default, the last one, or another is already the default: nothing to change
    expect(nextDefaultAfterRemoval([old, def, newest], "old")).toBeNull()
    expect(nextDefaultAfterRemoval([def], "def")).toBeNull()
    expect(nextDefaultAfterRemoval([def, { ...newest, is_default_shipping: true }], "def")).toBeNull()
    // after the change the overview heads the new default, never an address that isn't one
    const after = [old, { ...newest, is_default_shipping: true }]
    expect(overviewAddress(after)?.id).toBe("new")
    expect(overviewAddress(after)?.is_default_shipping).toBe(true)
  })
})

describe("addressCardView (05, 9.5)", () => {
  it("has the name apart, the lines, the phone, Default, and the first line for the buttons' names", () => {
    expect(addressCardView(customer.addresses[0], "Pakistan")).toEqual({
      id: "cuaddr_01M7678DBMDWFFATJ1Q7K2J6S5",
      name: "Ali Raza",
      lines: ["12 Mall Road", "Lahore", "Punjab", "Pakistan"],
      phone: "0300 1234567",
      isDefault: true,
      firstLine: "12 Mall Road",
    })
  })
})
