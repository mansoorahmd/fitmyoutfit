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
    /** Named for the country: "Province", "State", "Emirate" (W-K9). */
    label: string
    /** The list's empty first choice, named the same way. */
    placeholder: string
    options: { value: string; label: string }[]
  }
  postalCode: { shown: boolean; required: boolean; label: string }
}

const words = checkoutContent.address

/** The country's own entry in a per-country table of words, else Pakistan's. */
const forCountry = (table: Record<string, string>, code: string): string => table[code] ?? table.pk

/**
 * The fields that depend on the country (05, 6.4, fields 10 and 11):
 * - Province / State / Emirate: a list in Pakistan, the US and the UAE, all
 *   required; none in the UK (the specification hides it there).
 * - Postal code: required in the UK and the US, optional in Pakistan, none
 *   in the UAE (it has no postal codes).
 * Any other country gets an optional postal code and no province. Labels,
 * the list's first choice and the messages are named for the country (QA
 * S1-4, D9).
 */
export const countryFieldRules = (countryCode: string | null | undefined): CountryFieldRules => {
  const code = (countryCode ?? "").toLowerCase()
  const options = subdivisionsOf(code).map((s) => ({ value: s.code, label: s.name }))

  return {
    province: {
      shown: options.length > 0,
      required: options.length > 0,
      label: forCountry(words.fields.province, code),
      placeholder: forCountry(words.fields.chooseProvince, code),
      options,
    },
    postalCode: {
      shown: code !== "ae",
      required: code === "gb" || code === "us",
      label: forCountry(words.fields.postalCode, code),
    },
  }
}

/**
 * The most characters each field keeps (QA S1-4, D11). Medusa stores these
 * as text without a limit, so the limits are the store's: long enough for
 * any real name or address line, short enough that one field can't take
 * over a page or a courier label. 254 is the longest email address (RFC
 * 5321).
 */
export const FIELD_MAX = {
  email: 254,
  phone: 25,
  first_name: 100,
  last_name: 100,
  company: 100,
  address_1: 200,
  address_2: 200,
  city: 100,
  postal_code: 12,
} as const

export type LimitedField = keyof typeof FIELD_MAX

/**
 * Digits as a phone number or a postcode is checked and stored (QA S1-4c,
 * m3): digits typed by an Urdu or Arabic keyboard (Arabic-Indic U+0660 to
 * U+0669, Extended Arabic-Indic U+06F0 to U+06F9) and full-width
 * characters (NFKC: "０３００", "ＳＷ１Ａ") become ASCII.
 */
export const asciiDigits = (value: string): string =>
  value
    .normalize("NFKC")
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))

/**
 * Postcodes the UK format would take, or that belong to a British address
 * outside the UK, where the store doesn't deliver: British Forces (BFPO)
 * and the overseas territories (QA S1-4c, m3). They get their own message
 * instead of the format's.
 */
const UK_OUTSIDE_DELIVERY = [
  /^BFPO\d{1,4}$/, // British Forces Post Office
  /^(ASCN|BBND|BIQQ|FIQQ|PCRN|SIQQ|STHL|TDCU|TKCA)1ZZ$/, // Ascension, BIOT, Antarctic, Falklands, Pitcairn, South Georgia, St Helena, Tristan da Cunha, Turks and Caicos
  /^GX111AA$/, // Gibraltar
  /^AI-?\d{4}$/, // Anguilla
  /^KY\d-?\d{4}$/, // Cayman Islands
  /^MSR\d{4}$/, // Montserrat
  /^VG\d{4}$/, // British Virgin Islands
]

/** A BFPO or overseas-territory postcode: a British address the store doesn't deliver to. */
export const isUkOutsideDelivery = (value: string): boolean => {
  const compact = asciiDigits(value).toUpperCase().replace(/\s+/g, "")
  return UK_OUTSIDE_DELIVERY.some((pattern) => pattern.test(compact))
}

/**
 * A postal code in the country's one stored form, or null when it isn't one
 * (QA S1-4, D7):
 * - UK: the postcode format (outward code, inward code), stored upper case
 *   with one space: "sw1a1aa" becomes "SW1A 1AA";
 * - US: five digits, or ZIP+4 stored as "12345-6789";
 * - Pakistan: five digits;
 * - other countries: as typed, trimmed.
 * Urdu, Arabic and full-width digits are read as ASCII (asciiDigits). A
 * BFPO or overseas-territory postcode is not a UK one here.
 */
export const normalizePostalCode = (
  countryCode: string | null | undefined,
  value: string
): string | null => {
  const code = (countryCode ?? "").toLowerCase()
  const trimmed = asciiDigits(value).trim()
  if (code === "gb") {
    const compact = trimmed.toUpperCase().replace(/\s+/g, "")
    if (compact === "GIR0AA") return "GIR 0AA"
    if (isUkOutsideDelivery(compact)) return null
    const match = /^([A-Z]{1,2}\d[A-Z\d]?)(\d[A-Z]{2})$/.exec(compact)
    return match ? `${match[1]} ${match[2]}` : null
  }
  if (code === "us") {
    const match = /^(\d{5})(?:[\s-]?(\d{4}))?$/.exec(trimmed)
    return match ? (match[2] ? `${match[1]}-${match[2]}` : match[1]) : null
  }
  if (code === "pk") {
    return /^\d{5}$/.test(trimmed) ? trimmed : null
  }
  return trimmed
}

/**
 * A Pakistan mobile number in its one stored form, "+923001234567", or
 * null when it isn't one (QA S1-4, D15). Accepted as people write it:
 * "0300 1234567", "0300-1234567", "+92 300 1234567", "92 300 1234567",
 * "0092 300 1234567", and with the trunk 0 kept after the country code,
 * "+92 0300 1234567" or "+92 (0) 300 1234567" (QA S1-4c, m3). Urdu,
 * Arabic and full-width digits are read as ASCII. A delivery in Pakistan
 * needs one: the courier calls before a cash delivery.
 */
export const normalizePkMobile = (value: string): string | null => {
  const trimmed = asciiDigits(value).trim()
  if (!/^\+?[\d\s().-]+$/.test(trimmed)) return null
  const digits = trimmed.replace(/\D/g, "")
  let national: string | null = null
  if (trimmed.startsWith("+")) national = digits.startsWith("92") ? digits.slice(2) : null
  else if (digits.startsWith("0092")) national = digits.slice(4)
  else if (digits.startsWith("92") && (digits.length === 12 || digits.length === 13)) national = digits.slice(2)
  else if (digits.startsWith("0")) national = digits.slice(1)
  // the trunk 0 written after the country code: "+92 0300 …", "+92 (0) 300 …"
  if (national && /^03\d{9}$/.test(national)) national = national.slice(1)
  return national && /^3\d{9}$/.test(national) ? `+92${national}` : null
}

/**
 * The phone as it is stored: Pakistan's one form for a delivery there;
 * elsewhere trimmed, with ASCII digits (asciiDigits).
 */
export const normalizePhone = (value: string, countryCode: string | null | undefined): string =>
  (countryCode ?? "").toLowerCase() === "pk"
    ? normalizePkMobile(value) ?? asciiDigits(value).trim()
    : asciiDigits(value).trim()

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * Control and format characters (Unicode Cc and Cf): zero-width spaces and
 * joiners, direction marks and embeddings, the soft hyphen, the byte order
 * mark. Written as ranges: the project's compile target has no `u` flag.
 */
const INVISIBLE = /[\u0000-\u001f\u007f-\u009f­؀-؅؜۝܏᠎​-‏‪-‮⁠-⁤⁦-⁯﻿￹-￻]/

/**
 * An email address with one @ and a dot in the domain; no spaces, no two
 * dots in a row, no dot at either end of the name or the domain, and no
 * invisible character (a zero-width space, a direction mark, a control
 * character; QA S1-4c, m3), which would make an address no one can type.
 */
export const isEmail = (value: string): boolean => {
  const trimmed = value.trim()
  if (!EMAIL.test(trimmed)) return false
  if (INVISIBLE.test(trimmed) || trimmed.includes("..")) return false
  const [local, domain] = trimmed.split("@")
  return !local.startsWith(".") && !local.endsWith(".") && !domain.startsWith(".") && !domain.endsWith(".")
}

/**
 * A phone number as people type it: digits with spaces, dashes, dots and
 * brackets, and an optional + at the start; 7 to 15 digits (15 is the
 * longest international number, ITU-T E.164). Nothing else: letters mean
 * it isn't a phone number.
 */
export const isPhone = (value: string): boolean => {
  const trimmed = asciiDigits(value).trim()
  if (!/^\+?[\d\s().-]+$/.test(trimmed)) {
    return false
  }
  const digits = trimmed.replace(/\D/g, "").length
  return digits >= 7 && digits <= 15
}

const blank = (value: string | null | undefined) => !value || !value.trim()

/**
 * "Use 100 characters or fewer" when the value is longer than the field
 * keeps. The one definition of the limits for the checkout, create account
 * and the profile (QA S1-4c, S2), on the server and on the inputs.
 */
export const tooLong = (field: LimitedField, value: string | null | undefined): string | null =>
  (value ?? "").trim().length > FIELD_MAX[field]
    ? fill(words.errors.tooLong, { max: FIELD_MAX[field] })
    : null

const LIMITED_ADDRESS_FIELDS = [
  "first_name",
  "last_name",
  "company",
  "address_1",
  "address_2",
  "city",
  "postal_code",
] as const

const checkAddress = (
  prefix: "shipping" | "billing",
  address: AddressFields,
  countryCodes: string[],
  errors: AddressErrors
) => {
  const e = words.errors
  const code = address.country_code.toLowerCase()
  if (blank(address.first_name)) errors[`${prefix}.first_name`] = e.firstName
  if (!countryCodes.includes(code)) {
    errors[`${prefix}.country_code`] = e.country
  }
  if (blank(address.address_1)) errors[`${prefix}.address_1`] = e.address1
  if (blank(address.city)) errors[`${prefix}.city`] = e.city

  const rules = countryFieldRules(code)
  if (rules.province.required && !subdivisionCode(code, address.province)) {
    errors[`${prefix}.province`] = forCountry(e.province, code)
  }
  if (rules.postalCode.shown) {
    if (blank(address.postal_code)) {
      if (rules.postalCode.required) errors[`${prefix}.postal_code`] = forCountry(e.postalCode, code)
    } else if (code === "gb" && isUkOutsideDelivery(address.postal_code)) {
      // in words, not the format's message: the format isn't what is wrong
      errors[`${prefix}.postal_code`] = e.postalCodeOutsideUk
    } else if (normalizePostalCode(code, address.postal_code) === null) {
      errors[`${prefix}.postal_code`] = fill(forCountry(e.postalCodeFormat, code), {
        example: forCountry(words.postalExamples, code),
      })
    }
  }

  for (const field of LIMITED_ADDRESS_FIELDS) {
    const message = errors[`${prefix}.${field}`] ? null : tooLong(field, address[field])
    if (message) errors[`${prefix}.${field}`] = message
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

  const country = values.shipping.country_code.toLowerCase()

  if (!isEmail(values.email)) errors.email = e.email
  else {
    const long = tooLong("email", values.email)
    if (long) errors.email = long
  }
  if (blank(values.phone)) {
    errors.phone = e.phone
  } else if (tooLong("phone", values.phone)) {
    errors.phone = tooLong("phone", values.phone) ?? e.phone
  } else if (country === "pk") {
    // The courier calls before a cash delivery: a Pakistan mobile number
    // (QA S1-4, D15). Other countries take any valid number.
    if (!normalizePkMobile(values.phone)) {
      errors.phone = fill(e.phonePk, { example: words.phoneExamples.pk })
    }
  } else if (!isPhone(values.phone)) {
    errors.phone = fill(e.phoneInvalid, { example: forCountry(words.phoneExamples, country) })
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

/**
 * The address Medusa receives for the cart: trimmed, only the fields the
 * country has, and the postal code and phone in their one stored form (a
 * UK postcode upper case with its space; a Pakistan mobile as
 * "+923001234567").
 */
export const toCartAddress = (address: AddressFields, phone: string) => {
  const rules = countryFieldRules(address.country_code)
  const t = (value: string) => value.trim()
  const postal = t(address.postal_code)
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
    postal_code:
      rules.postalCode.shown && postal
        ? normalizePostalCode(address.country_code, postal) ?? postal
        : "",
    phone: normalizePhone(phone, address.country_code),
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
  const isUs = (address.country_code ?? "").toLowerCase() === "us"
  let cityLine: string
  let provinceLine: string
  if (isUs) {
    // the US form (QA S1-4c, m10): "Newark, NJ 07102", city, state code, ZIP
    const code = subdivisionCode("us", address.province)
    const state = code ? code.slice(3).toUpperCase() : address.province?.trim() ?? ""
    const stateZip = [state, address.postal_code].filter((p) => !blank(p)).join(" ")
    cityLine = [address.city?.trim() ?? "", stateZip].filter(Boolean).join(", ")
    provinceLine = ""
  } else {
    // Pakistan, the UK and the UAE: the city with its postal code, then the province or emirate
    cityLine = [address.city, address.postal_code].filter((p) => !blank(p)).join(" ")
    provinceLine = subdivisionName(address.country_code, address.province) ?? ""
  }
  return [
    name,
    address.company ?? "",
    address.address_1 ?? "",
    address.address_2 ?? "",
    cityLine,
    provinceLine,
    countryName ?? "",
  ]
    .map((line) => line.trim())
    .filter(Boolean)
}

/**
 * The same address, as the store keeps it (QA S1-4c, S1): every field
 * compared in its stored form (trimmed, the postcode and the phone
 * normalized, the province as its code), letters case-blind. Used so that
 * saving an address to the account twice keeps one, and so that "Change"
 * selects the saved address the cart holds.
 */
export const sameAddress = (a: AddressLike | null | undefined, b: AddressLike | null | undefined): boolean => {
  if (!a || !b || !a.country_code || !b.country_code) return false
  const stored = (x: AddressLike) => {
    const country = (x.country_code ?? "").toLowerCase()
    const fields = toCartAddress(addressFields(x, country), x.phone ?? "")
    return Object.values(fields).map((v) => v.toLowerCase().replace(/\s+/g, " "))
  }
  const left = stored(a)
  const right = stored(b)
  return left.every((value, i) => value === right[i])
}

/**
 * "Save this address to my account" on Continue: only when the account
 * doesn't hold the same address already, so passing the step again (Continue,
 * Change, Continue) keeps one copy. `saved` null: the account couldn't be
 * read, and the address is saved (a failure here never stops the order).
 */
export const shouldSaveToAccount = (saved: AddressLike[] | null, address: AddressLike): boolean =>
  !saved || !saved.some((a) => sameAddress(a, address))

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

/**
 * The fields of a saved address put into the form, with its own phone
 * (QA S1-4, D14: choosing a second address kept the first one's phone).
 * A saved address without a phone keeps the one in the form.
 */
export const withSavedAddress = (
  values: AddressFormValues,
  saved: AddressLike
): AddressFormValues => ({
  ...values,
  phone: saved.phone?.trim() ? saved.phone : values.phone,
  shipping: addressFields(saved, values.shipping.country_code),
})

/**
 * "Use a new address" (W-K5): empty address fields in the region's
 * country, with only the account's name filled in (QA S1-4, D14). The
 * email and phone stay: they are the contact, not the address.
 */
export const withNewAddress = (
  values: AddressFormValues,
  name: { first_name?: string | null; last_name?: string | null } | null | undefined
): AddressFormValues => ({
  ...values,
  shipping: {
    ...addressFields(null, values.shipping.country_code),
    first_name: name?.first_name ?? "",
    last_name: name?.last_name ?? "",
  },
})
