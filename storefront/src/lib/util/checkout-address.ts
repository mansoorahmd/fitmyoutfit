// Step 1 of the checkout, contact and address (docs/design/05-m1-pages.md,
// 6.4): which fields a country has, what is required, the checks and their
// messages, and the address Medusa receives. Plain data in and out; the
// form only lays it out. The same checks run in the server action before
// anything is saved.

import { checkoutContent } from "@content/checkout"

import compareAddresses from "./compare-addresses"
import { subdivisionCode, subdivisionName, subdivisionsOf } from "./subdivisions"
import { fill } from "./wording"

export type AddressFields = {
  first_name: string
  last_name: string
  company: string
  country_code: string
  address_1: string
  address_2: string
  city: string
  province: string
  postal_code: string
}

export type AddressFormValues = {
  email: string
  phone: string
  shipping: AddressFields
  billingSame: boolean
  billing: AddressFields
  /** Signed-in customers with a new address only (W-K11). */
  saveToAccount: boolean
}

/** "email", "phone", "shipping.city", "billing.province" and so on. */
export type AddressFieldKey =
  | "email"
  | "phone"
  | `shipping.${keyof AddressFields}`
  | `billing.${keyof AddressFields}`

export type AddressErrors = Partial<Record<AddressFieldKey, string>>

export type CountryChoice = { code: string; name: string }

export type CountryFieldRules = {
  province: {
    shown: boolean
    required: boolean
    label: string
    options: { value: string; label: string }[]
  }
  postalCode: { shown: boolean; required: boolean; label: string }
}

const words = checkoutContent.address

/**
 * The fields that depend on the country (05, 6.4, fields 10 and 11):
 * - Province / State / Emirate: a list in Pakistan, the US and the UAE, all
 *   required; none in the UK.
 * - Postal code: required in the UK and the US, optional in Pakistan, none
 *   in the UAE (it has no postal codes).
 * Any other country gets an optional postal code and no province.
 */
export const countryFieldRules = (countryCode: string | null | undefined): CountryFieldRules => {
  const code = (countryCode ?? "").toLowerCase()
  const options = subdivisionsOf(code).map((s) => ({ value: s.code, label: s.name }))
  const provinceLabel = words.fields.province[code] ?? words.fields.province.pk
  const postalLabel = words.fields.postalCode[code] ?? words.fields.postalCode.pk

  return {
    province: {
      shown: options.length > 0,
      required: options.length > 0,
      label: provinceLabel,
      options,
    },
    postalCode: {
      shown: code !== "ae",
      required: code === "gb" || code === "us",
      label: postalLabel,
    },
  }
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** An email address with one @ and a dot in the domain; no spaces. */
export const isEmail = (value: string): boolean => EMAIL.test(value.trim())

/**
 * A phone number as people type it: digits with spaces, dashes, dots and
 * brackets, and an optional + at the start; 7 to 15 digits (15 is the
 * longest international number, ITU-T E.164). Nothing else: letters mean
 * it isn't a phone number.
 */
export const isPhone = (value: string): boolean => {
  const trimmed = value.trim()
  if (!/^\+?[\d\s().-]+$/.test(trimmed)) {
    return false
  }
  const digits = trimmed.replace(/\D/g, "").length
  return digits >= 7 && digits <= 15
}

const blank = (value: string | null | undefined) => !value || !value.trim()

const checkAddress = (
  prefix: "shipping" | "billing",
  address: AddressFields,
  countryCodes: string[],
  errors: AddressErrors
) => {
  const e = words.errors
  if (blank(address.first_name)) errors[`${prefix}.first_name`] = e.firstName
  if (!countryCodes.includes(address.country_code.toLowerCase())) {
    errors[`${prefix}.country_code`] = e.country
  }
  if (blank(address.address_1)) errors[`${prefix}.address_1`] = e.address1
  if (blank(address.city)) errors[`${prefix}.city`] = e.city

  const rules = countryFieldRules(address.country_code)
  if (rules.province.required && !subdivisionCode(address.country_code, address.province)) {
    errors[`${prefix}.province`] = e.province
  }
  if (rules.postalCode.required && blank(address.postal_code)) {
    errors[`${prefix}.postal_code`] = e.postalCode
  }
}

/**
 * Every message for the form, by field, in the order the fields appear
 * (an empty object when it can be saved). `countryCodes` are the region's
 * countries: an address outside them is refused.
 */
export const validateAddressForm = (
  values: AddressFormValues,
  countryCodes: string[]
): AddressErrors => {
  const errors: AddressErrors = {}
  const e = words.errors
  const codes = countryCodes.map((c) => c.toLowerCase())

  if (!isEmail(values.email)) errors.email = e.email
  if (blank(values.phone)) {
    errors.phone = e.phone
  } else if (!isPhone(values.phone)) {
    const example =
      words.phoneExamples[values.shipping.country_code.toLowerCase()] ?? words.phoneExamples.pk
    errors.phone = fill(e.phoneInvalid, { example })
  }

  checkAddress("shipping", values.shipping, codes, errors)
  if (!values.billingSame) {
    checkAddress("billing", values.billing, codes, errors)
  }
  return errors
}

/** The single field a message belongs to, for "check when it loses focus". */
export const errorFor = (
  values: AddressFormValues,
  countryCodes: string[],
  key: AddressFieldKey
): string | undefined => validateAddressForm(values, countryCodes)[key]

/** The address Medusa receives for the cart: trimmed, and only the fields the country has. */
export const toCartAddress = (address: AddressFields, phone: string) => {
  const rules = countryFieldRules(address.country_code)
  const t = (value: string) => value.trim()
  return {
    first_name: t(address.first_name),
    last_name: t(address.last_name),
    company: t(address.company),
    address_1: t(address.address_1),
    address_2: t(address.address_2),
    city: t(address.city),
    country_code: address.country_code.toLowerCase(),
    province: rules.province.shown
      ? subdivisionCode(address.country_code, address.province) ?? ""
      : "",
    postal_code: rules.postalCode.shown ? t(address.postal_code) : "",
    phone: t(phone),
  }
}

export type CartAddressPayload = ReturnType<typeof toCartAddress>

/** What the address step saves to the cart: the email and both addresses. */
export const toCartUpdate = (values: AddressFormValues) => {
  const shipping = toCartAddress(values.shipping, values.phone)
  return {
    email: values.email.trim(),
    shipping_address: shipping,
    billing_address: values.billingSame ? shipping : toCartAddress(values.billing, values.phone),
  }
}

export type AddressLike = {
  first_name?: string | null
  last_name?: string | null
  company?: string | null
  country_code?: string | null
  address_1?: string | null
  address_2?: string | null
  city?: string | null
  province?: string | null
  postal_code?: string | null
  phone?: string | null
}

/** An address from the cart or the account, as form fields. */
export const addressFields = (
  address: AddressLike | null | undefined,
  defaultCountry: string
): AddressFields => {
  const country = (address?.country_code || defaultCountry).toLowerCase()
  return {
    first_name: address?.first_name ?? "",
    last_name: address?.last_name ?? "",
    company: address?.company ?? "",
    country_code: country,
    address_1: address?.address_1 ?? "",
    address_2: address?.address_2 ?? "",
    city: address?.city ?? "",
    province: subdivisionCode(country, address?.province) ?? "",
    postal_code: address?.postal_code ?? "",
  }
}

/**
 * The form's first values: what the cart already holds, else the
 * customer's email; the country is the region's first. Billing is "the
 * same" unless the cart holds a different billing address.
 */
export const initialAddressValues = ({
  cart,
  customerEmail,
  countryCodes,
}: {
  cart: {
    email?: string | null
    shipping_address?: AddressLike | null
    billing_address?: AddressLike | null
  }
  customerEmail?: string | null
  countryCodes: string[]
}): AddressFormValues => {
  const defaultCountry = countryCodes[0] ?? ""
  // An address from another region (the cart moved) is not kept.
  const inRegion = (a: AddressLike | null | undefined) =>
    !!a?.country_code && countryCodes.includes(a.country_code.toLowerCase())
  const shipping = inRegion(cart.shipping_address) ? cart.shipping_address : null
  const billing = inRegion(cart.billing_address) ? cart.billing_address : null

  return {
    email: cart.email || customerEmail || "",
    phone: shipping?.phone ?? "",
    shipping: addressFields(shipping, defaultCountry),
    billingSame: !billing || !shipping || compareAddresses(shipping, billing),
    billing: addressFields(billing, defaultCountry),
    saveToAccount: false,
  }
}

/**
 * Step 1 is done when the cart has an email and a delivery address in the
 * region with what the checks require. Delivery is chosen on save, and
 * step 2 says so when it is missing.
 */
export const addressStepDone = (
  cart: { email?: string | null; shipping_address?: AddressLike | null },
  countryCodes: string[]
): boolean => {
  const a = cart.shipping_address
  if (!a?.country_code || !countryCodes.includes(a.country_code.toLowerCase())) {
    return false
  }
  const values: AddressFormValues = {
    email: cart.email ?? "",
    phone: a.phone ?? "",
    shipping: addressFields(a, a.country_code),
    billingSame: true,
    billing: addressFields(null, a.country_code),
    saveToAccount: false,
  }
  return Object.keys(validateAddressForm(values, countryCodes)).length === 0
}

/**
 * The address as lines (05, 2.4): the name, the team or club, the street,
 * the area, the city with the postal code, the province, the country. Each
 * line is shown on its own inside `<bdi>` (05, 2.4), so Arabic and Urdu
 * read right to left while the block stays aligned with the page.
 */
export const addressLines = (
  address: AddressLike | null | undefined,
  countryName?: string | null
): string[] => {
  if (!address) {
    return []
  }
  const name = [address.first_name, address.last_name].filter((p) => !blank(p)).join(" ")
  const cityLine = [address.city, address.postal_code].filter((p) => !blank(p)).join(" ")
  return [
    name,
    address.company ?? "",
    address.address_1 ?? "",
    address.address_2 ?? "",
    cityLine,
    subdivisionName(address.country_code, address.province) ?? "",
    countryName ?? "",
  ]
    .map((line) => line.trim())
    .filter(Boolean)
}

/** A customer's saved addresses in this region, the default one first. */
export const savedAddressesInRegion = <
  T extends AddressLike & { id: string; is_default_shipping?: boolean | null }
>(
  addresses: T[] | null | undefined,
  countryCodes: string[]
): T[] =>
  (addresses ?? [])
    .filter((a) => !!a.country_code && countryCodes.includes(a.country_code.toLowerCase()))
    .sort((a, b) => Number(!!b.is_default_shipping) - Number(!!a.is_default_shipping))

/** The fields of a saved address put into the form (the phone only when the form has none). */
export const withSavedAddress = (
  values: AddressFormValues,
  saved: AddressLike
): AddressFormValues => ({
  ...values,
  phone: values.phone.trim() ? values.phone : saved.phone ?? "",
  shipping: addressFields(saved, values.shipping.country_code),
})
