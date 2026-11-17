import { describe, expect, it } from "vitest"

import { validateName, validatePhone } from "@lib/util/account-profile"
import {
  ACCOUNT_MENU,
  PASSWORD_CHANGE_AVAILABLE,
  greetingName,
  profileRows,
  showsBackLink,
  showsTitleBand,
} from "@lib/util/account-rows"

import { customer } from "./fixtures/account"

describe("the account menu and frame (05, 9.1)", () => {
  it("lists Orders, Addresses and Profile, in that order", () => {
    expect(ACCOUNT_MENU.map((m) => [m.label, m.href])).toEqual([
      ["Orders", "/account/orders"],
      ["Addresses", "/account/addresses"],
      ["Profile", "/account/profile"],
    ])
  })

  it("heads the overview with the title band, the inner pages with the back link", () => {
    expect(showsTitleBand("overview")).toBe(true)
    expect(showsBackLink("overview")).toBe(false)
    for (const page of ["orders", "addresses", "profile"] as const) {
      expect(showsTitleBand(page)).toBe(false)
      expect(showsBackLink(page)).toBe(true)
    }
  })

  it("greets by the first name, or not at all", () => {
    expect(greetingName(customer)).toBe("محمد علی")
    expect(greetingName({ first_name: "  " })).toBeNull()
  })
})

describe("profileRows (05, 9.6)", () => {
  it("shows Name and Phone to edit, the email read-only, a masked password and no billing address", () => {
    const rows = profileRows(customer)
    expect(rows.map((r) => [r.key, r.value, r.editable, r.direction])).toEqual([
      ["name", "محمد علی", true, "auto"],
      ["phone", "0300 1234567", true, "ltr"],
      ["email", "probe1794431526934@example.com", false, "ltr"],
      ["password", "••••••••", false, "ltr"],
    ])
  })

  it("has the password row (S1-10c): it asks for a reset link, so it has no Edit form", () => {
    expect(PASSWORD_CHANGE_AVAILABLE).toBe(true)
    const password = profileRows(customer).find((r) => r.key === "password")
    expect(password).toMatchObject({ label: "Password", editable: false, empty: false })
    expect(profileRows(customer, { passwordChange: false }).some((r) => r.key === "password")).toBe(false)
  })

  it("says 'Not given' for an empty value", () => {
    const rows = profileRows({ first_name: "Ali", last_name: "Raza", email: "a@b.co", phone: "" })
    expect(rows[0].value).toBe("Ali Raza")
    expect(rows[1]).toMatchObject({ value: "Not given", empty: true })
  })
})

describe("profile checks", () => {
  it("needs a first name; the last name is optional", () => {
    expect(validateName({ firstName: "", lastName: "Raza" })).toEqual({ firstName: "Enter your first name" })
    expect(validateName({ firstName: "عبدالله", lastName: "" })).toEqual({})
  })

  it("takes an empty phone or a real one", () => {
    expect(validatePhone({ phone: "", countryCode: "pk" })).toEqual({})
    expect(validatePhone({ phone: "+92 300 1112223", countryCode: "pk" })).toEqual({})
    expect(validatePhone({ phone: "not a phone", countryCode: "pk" })).toEqual({
      phone: "Enter a phone number, like 0300 1234567",
    })
  })

  it("names 100 and phone 25, the checkout's limits, with the limit in the message (QA S1-4c, S2)", () => {
    expect(validateName({ firstName: "ع".repeat(100), lastName: "R".repeat(100) })).toEqual({})
    expect(validateName({ firstName: "A".repeat(20_000), lastName: "R".repeat(101) })).toEqual({
      firstName: "Use 100 characters or fewer",
      lastName: "Use 100 characters or fewer",
    })
    expect(validatePhone({ phone: "1".repeat(26), countryCode: "pk" })).toEqual({ phone: "Use 25 characters or fewer" })
  })
})
