import { describe, expect, it } from "vitest"

import {
  AddressFormValues,
  addressLines,
  addressStepDone,
  FIELD_MAX,
  countryFieldRules,
  initialAddressValues,
  isEmail,
  isPhone,
  normalizePkMobile,
  normalizePostalCode,
  savedAddressesInRegion,
  toCartUpdate,
  validateAddressForm,
  withNewAddress,
  withSavedAddress,
} from "@lib/util/checkout-address"
import { subdivisionName } from "@lib/util/subdivisions"

import { checkoutCartGb, checkoutCartPk } from "./fixtures/m1-checkout"

const blankAddress = (country: string) => ({
  first_name: "",
  last_name: "",
  company: "",
  country_code: country,
  address_1: "",
  address_2: "",
  city: "",
  province: "",
  postal_code: "",
})

const form = (country: string, over: Partial<AddressFormValues> = {}): AddressFormValues => ({
  email: "ali@example.com",
  phone: "0300 1234567",
  shipping: {
    ...blankAddress(country),
    first_name: "Ali",
    address_1: "House 12, Street 4",
    city: "Lahore",
    province: country === "pk" ? "pk-pb" : country === "us" ? "us-ny" : country === "ae" ? "ae-du" : "",
    postal_code: country === "gb" ? "SW1A 1AA" : country === "us" ? "10001" : "",
  },
  billingSame: true,
  billing: blankAddress(country),
  saveToAccount: false,
  ...over,
})

describe("the fields each country has (05, 6.4, fields 10 and 11)", () => {
  it("Pakistan: a required province list, an optional postal code", () => {
    const rules = countryFieldRules("pk")
    expect(rules.province).toMatchObject({ shown: true, required: true, label: "Province" })
    expect(rules.province.options.map((o) => o.label)).toContain("Punjab")
    expect(rules.postalCode).toEqual({ shown: true, required: false, label: "Postal code (optional)" })
  })

  it("United Kingdom: no province, a required postcode", () => {
    const rules = countryFieldRules("gb")
    expect(rules.province.shown).toBe(false)
    expect(rules.postalCode).toEqual({ shown: true, required: true, label: "Postcode" })
  })

  it("United Arab Emirates: a required emirate, no postal code", () => {
    const rules = countryFieldRules("ae")
    expect(rules.province).toMatchObject({ shown: true, required: true, label: "Emirate" })
    expect(rules.province.options).toHaveLength(7)
    expect(rules.postalCode.shown).toBe(false)
  })

  it("United States: a required state, a required ZIP code", () => {
    const rules = countryFieldRules("us")
    expect(rules.province).toMatchObject({ shown: true, required: true, label: "State" })
    expect(rules.province.options.length).toBe(51)
    expect(rules.postalCode).toEqual({ shown: true, required: true, label: "ZIP code" })
  })
})

describe("email and phone checks", () => {
  it("takes an ordinary email and refuses one without @ or domain", () => {
    expect(isEmail("ali@example.com")).toBe(true)
    expect(isEmail(" ali@example.com ")).toBe(true)
    expect(isEmail("ali@example")).toBe(false)
    expect(isEmail("ali.example.com")).toBe(false)
    expect(isEmail("ali @example.com")).toBe(false)
  })

  it("takes local and international numbers with spaces, dashes and brackets", () => {
    for (const ok of ["0300 1234567", "+92 300 1234567", "07700 900123", "(201) 555-0123", "050-123-4567"]) {
      expect(isPhone(ok), ok).toBe(true)
    }
  })

  it("refuses letters, too few or too many digits, and a + inside", () => {
    for (const bad of ["abc", "12345", "0300 12345678901234", "0300+1234567", "call me"]) {
      expect(isPhone(bad), bad).toBe(false)
    }
  })
})

describe("validateAddressForm", () => {
  it("passes a complete Pakistani address with an Urdu name and no last name", () => {
    const values = form("pk")
    values.shipping.first_name = "محمد علی"
    values.shipping.city = "لاہور"
    expect(validateAddressForm(values, ["pk"])).toEqual({})
  })

  it("passes an Arabic name in the UAE, with no postal code", () => {
    const values = form("ae")
    values.shipping.first_name = "عبدالله الهاشمي"
    expect(validateAddressForm(values, ["ae"])).toEqual({})
  })

  it("names every empty required field with what to do", () => {
    const errors = validateAddressForm(
      { ...form("pk"), email: "", phone: "", shipping: blankAddress("pk") },
      ["pk"]
    )
    expect(errors).toEqual({
      email: "Enter your email address, like name@example.com",
      phone: "Enter a phone number",
      "shipping.first_name": "Enter your first name",
      "shipping.address_1": "Enter the house and street",
      "shipping.city": "Enter the city",
      "shipping.province": "Choose a province",
    })
  })

  it("names the region field for the country: province, state, emirate (QA S1-4, D9)", () => {
    const missing = (country: string) => {
      const values = form(country)
      values.shipping.province = ""
      return validateAddressForm(values, [country])["shipping.province"]
    }
    expect(missing("pk")).toBe("Choose a province")
    expect(missing("us")).toBe("Choose a state")
    expect(missing("ae")).toBe("Choose an emirate")
    expect(countryFieldRules("pk").province.placeholder).toBe("Choose a province")
    expect(countryFieldRules("us").province.placeholder).toBe("Choose a state")
    expect(countryFieldRules("ae").province.placeholder).toBe("Choose an emirate")
  })

  it("requires the phone in every region (decision 008, 2)", () => {
    for (const country of ["pk", "gb", "ae", "us"]) {
      expect(validateAddressForm(form(country, { phone: " " }), [country]).phone, country).toBe(
        "Enter a phone number"
      )
    }
  })

  it("says a bad email and a bad phone, with a number in the country's own format", () => {
    const errors = validateAddressForm(form("gb", { email: "ali@", phone: "abc" }), ["gb"])
    expect(errors.email).toBe("Enter your email address, like name@example.com")
    expect(errors.phone).toBe("Enter a phone number, like 07700 900123")
  })

  it("a delivery in Pakistan needs a Pakistan mobile number; other countries take any valid number (QA S1-4, D15)", () => {
    for (const ok of ["0300 1234567", "0300-1234567", "+92 300 1234567", "923001234567", "0092 300 1234567"]) {
      expect(validateAddressForm(form("pk", { phone: ok }), ["pk"]).phone, ok).toBeUndefined()
    }
    for (const bad of ["07700 900123", "+44 7700 900123", "042 35761234", "0300 123456", "+1 201 555 0123"]) {
      expect(validateAddressForm(form("pk", { phone: bad }), ["pk"]).phone, bad).toBe(
        "Enter a Pakistan mobile number, like 0300 1234567 or +92 300 1234567"
      )
    }
    expect(validateAddressForm(form("gb", { phone: "+92 300 1234567" }), ["gb"]).phone).toBeUndefined()
    expect(validateAddressForm(form("us", { phone: "07700 900123" }), ["us"]).phone).toBeUndefined()
  })

  it("requires the postcode in the UK and the ZIP code in the US, not in Pakistan", () => {
    const gb = form("gb")
    gb.shipping.postal_code = ""
    expect(validateAddressForm(gb, ["gb"])["shipping.postal_code"]).toBe("Enter a postcode")
    const us = form("us")
    us.shipping.postal_code = ""
    expect(validateAddressForm(us, ["us"])["shipping.postal_code"]).toBe("Enter a ZIP code")
    expect(validateAddressForm(form("pk"), ["pk"])["shipping.postal_code"]).toBeUndefined()
  })

  it("checks the postal code's format for the country (QA S1-4, D7)", () => {
    const withPostal = (country: string, postal: string) => {
      const values = form(country)
      values.shipping.postal_code = postal
      return validateAddressForm(values, [country])["shipping.postal_code"]
    }
    expect(withPostal("gb", "ABC")).toBe("Enter a UK postcode, like SW1A 1AA")
    expect(withPostal("gb", "sw1a1aa")).toBeUndefined()
    expect(withPostal("us", "1")).toBe(
      "Enter a ZIP code of five digits, like 10001, or ZIP+4, like 10001-1234"
    )
    expect(withPostal("us", "10001-1234")).toBeUndefined()
    expect(withPostal("pk", "5400")).toBe("Enter a postal code of five digits, like 54000, or leave it empty")
    expect(withPostal("pk", "54000")).toBeUndefined()
    expect(withPostal("pk", "")).toBeUndefined()
  })

  it("refuses a field longer than the store keeps, saying the limit (QA S1-4, D11)", () => {
    const values = form("pk")
    values.shipping.address_1 = "x".repeat(FIELD_MAX.address_1 + 1)
    values.shipping.last_name = "y".repeat(FIELD_MAX.last_name + 1)
    const errors = validateAddressForm(values, ["pk"])
    expect(errors["shipping.address_1"]).toBe(`Use ${FIELD_MAX.address_1} characters or fewer`)
    expect(errors["shipping.last_name"]).toBe(`Use ${FIELD_MAX.last_name} characters or fewer`)
    values.shipping.address_1 = "x".repeat(190) // a 190-character word fits, and wraps on the page
    expect(validateAddressForm(values, ["pk"])["shipping.address_1"]).toBeUndefined()
  })

  it("refuses a province that isn't on the country's list", () => {
    const values = form("pk")
    values.shipping.province = "us-ny"
    expect(validateAddressForm(values, ["pk"])["shipping.province"]).toBeDefined()
  })

  it("refuses a country outside the region", () => {
    expect(validateAddressForm(form("gb"), ["pk"])["shipping.country_code"]).toBe("Choose a country")
  })

  it("checks the billing address only when it is not the same", () => {
    expect(validateAddressForm(form("pk"), ["pk"])).toEqual({})
    const errors = validateAddressForm(form("pk", { billingSame: false }), ["pk"])
    expect(Object.keys(errors)).toEqual([
      "billing.first_name",
      "billing.address_1",
      "billing.city",
      "billing.province",
    ])
  })
})

describe("what the cart receives", () => {
  it("trims, keeps the province code, and copies the address to billing when the same", () => {
    const values = form("pk", { email: " ali@example.com " })
    values.shipping.first_name = "  محمد علی "
    const update = toCartUpdate(values)
    expect(update.email).toBe("ali@example.com")
    expect(update.shipping_address).toMatchObject({
      first_name: "محمد علی",
      country_code: "pk",
      province: "pk-pb",
      phone: "+923001234567",
    })
    expect(update.billing_address).toEqual(update.shipping_address)
  })

  it("stores each postal code and the Pakistan mobile in one form (QA S1-4, D7 and D15)", () => {
    const gb = form("gb", { phone: "07700 900123" })
    gb.shipping.postal_code = " sw1a1aa "
    expect(toCartUpdate(gb).shipping_address).toMatchObject({ postal_code: "SW1A 1AA", phone: "07700 900123" })
    const us = form("us")
    us.shipping.postal_code = "100011234"
    expect(toCartUpdate(us).shipping_address.postal_code).toBe("10001-1234")
    for (const typed of ["0300 1234567", "+92 300 1234567", "92-300-1234567", "0092 300 1234567"]) {
      expect(toCartUpdate(form("pk", { phone: typed })).shipping_address.phone, typed).toBe("+923001234567")
    }
  })

  it("normalizes as the stored forms say", () => {
    expect(normalizePostalCode("gb", "ec1a 1bb")).toBe("EC1A 1BB")
    expect(normalizePostalCode("gb", "M1 1AE")).toBe("M1 1AE")
    expect(normalizePostalCode("gb", "12345")).toBeNull()
    expect(normalizePostalCode("us", "12345 6789")).toBe("12345-6789")
    expect(normalizePostalCode("us", "1234")).toBeNull()
    expect(normalizePostalCode("pk", "540000")).toBeNull()
    expect(normalizePkMobile("0300 1234567")).toBe("+923001234567")
    expect(normalizePkMobile("+923001234567")).toBe("+923001234567")
    expect(normalizePkMobile("+44 7700 900123")).toBeNull()
    expect(normalizePkMobile("0423 5761234")).toBeNull()
  })

  it("leaves out the fields the country doesn't have", () => {
    const values = form("ae")
    values.shipping.postal_code = "12345"
    expect(toCartUpdate(values).shipping_address.postal_code).toBe("")
    const gb = form("gb")
    gb.shipping.province = "pk-pb"
    expect(toCartUpdate(gb).shipping_address.province).toBe("")
  })

  it("sends a separate billing address when asked", () => {
    const values = form("pk", { billingSame: false })
    values.billing = { ...values.shipping, first_name: "Team Treasurer", address_1: "Club House" }
    const update = toCartUpdate(values)
    expect(update.billing_address).toMatchObject({ first_name: "Team Treasurer", address_1: "Club House" })
    expect(update.shipping_address.first_name).toBe("Ali")
  })
})

describe("the form's first values", () => {
  it("are the cart's address and email, with billing the same", () => {
    const values = initialAddressValues({ cart: checkoutCartPk(), countryCodes: ["pk"] })
    expect(values.email).toBe("ali@example.com")
    expect(values.phone).toBe("0300 1234567")
    expect(values.shipping.first_name).toBe("محمد علی")
    expect(values.shipping.province).toBe("pk-pb")
    expect(values.billingSame).toBe(true)
  })

  it("start empty in the region's country, with the customer's email", () => {
    const values = initialAddressValues({
      cart: { email: null, shipping_address: null },
      customerEmail: "member@example.com",
      countryCodes: ["gb"],
    })
    expect(values.email).toBe("member@example.com")
    expect(values.shipping.country_code).toBe("gb")
    expect(values.shipping.address_1).toBe("")
  })

  it("drop an address from another region (a cart moved from the UK to Pakistan)", () => {
    const values = initialAddressValues({ cart: checkoutCartGb(), countryCodes: ["pk"] })
    expect(values.shipping.address_1).toBe("")
    expect(values.shipping.country_code).toBe("pk")
  })
})

describe("addressStepDone", () => {
  it("is done for a complete address in the region", () => {
    expect(addressStepDone(checkoutCartPk(), ["pk"])).toBe(true)
    expect(addressStepDone(checkoutCartGb(), ["gb"])).toBe(true)
  })

  it("is not done without an email, a phone, or in another region", () => {
    expect(addressStepDone(checkoutCartPk({ email: null }), ["pk"])).toBe(false)
    expect(
      addressStepDone(checkoutCartPk({ shipping_address: { ...checkoutCartPk().shipping_address, phone: "" } }), ["pk"])
    ).toBe(false)
    expect(addressStepDone(checkoutCartGb(), ["pk"])).toBe(false)
  })

  it("is not done for the empty address Medusa leaves after a region change", () => {
    // as the backend answered after moving a UK cart to Pakistan
    const moved = checkoutCartPk({
      shipping_address: { first_name: null, address_1: null, city: null, country_code: "pk", province: null, phone: null },
    })
    expect(addressStepDone(moved, ["pk"])).toBe(false)
  })
})

describe("address lines", () => {
  it("lists the name, street, area, city, province name and country", () => {
    expect(addressLines(checkoutCartPk().shipping_address, "Pakistan")).toEqual([
      "محمد علی",
      "House 1, Street 2",
      "Block C",
      "Lahore",
      "Punjab",
      "Pakistan",
    ])
  })

  it("puts the postcode after the city and leaves out empty lines", () => {
    expect(addressLines(checkoutCartGb().shipping_address, "United Kingdom")).toEqual([
      "Ali Raza",
      "1 High Street",
      "London SW1A 1AA",
      "United Kingdom",
    ])
  })

  it("shows a province typed in the admin as it was stored", () => {
    expect(subdivisionName("pk", "Punjab")).toBe("Punjab")
    expect(subdivisionName("pk", "Somewhere")).toBe("Somewhere")
  })
})

describe("saved addresses", () => {
  const saved = [
    { id: "a1", country_code: "pk", address_1: "1 Mall Road", is_default_shipping: false },
    { id: "a2", country_code: "gb", address_1: "1 High Street", is_default_shipping: true },
    { id: "a3", country_code: "pk", address_1: "2 Canal Road", is_default_shipping: true, phone: "0321 7654321" },
  ]

  it("are those in the region, the default first", () => {
    expect(savedAddressesInRegion(saved, ["pk"]).map((a) => a.id)).toEqual(["a3", "a1"])
  })

  it("fill the form with the chosen address's own phone (QA S1-4, D14)", () => {
    const empty = form("pk", { phone: "" })
    expect(withSavedAddress(empty, saved[2]).phone).toBe("0321 7654321")
    // the default's phone was in the form; the second address brings its own
    expect(withSavedAddress(form("pk"), saved[2]).phone).toBe("0321 7654321")
    expect(withSavedAddress(form("pk"), saved[2]).shipping.address_1).toBe("2 Canal Road")
    // an address saved without a phone keeps the one in the form
    expect(withSavedAddress(form("pk"), saved[0]).phone).toBe("0300 1234567")
  })

  it("'Use a new address' is empty apart from the account's name (QA S1-4, D14)", () => {
    const fromSaved = withSavedAddress(form("pk"), saved[2])
    const fresh = withNewAddress(fromSaved, { first_name: "Ali", last_name: "Raza" })
    expect(fresh.shipping).toEqual({ ...blankAddress("pk"), first_name: "Ali", last_name: "Raza" })
    expect(fresh.email).toBe(fromSaved.email)
    expect(withNewAddress(fromSaved, null).shipping).toEqual(blankAddress("pk"))
  })
})
