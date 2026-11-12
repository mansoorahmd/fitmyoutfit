// The profile's editable rows (docs/design/05-m1-pages.md, 9.6): the name
// and the phone, with the same checks and messages as create account and
// the checkout. Plain data in and out.

import { checkoutContent } from "@content/checkout"

import { isPhone, tooLong } from "./checkout-address"
import { fill } from "./wording"

export type NameValues = { firstName: string; lastName: string }
export type PhoneValues = { phone: string; countryCode: string }

/** The profile's values as the page holds them: what it shows and starts each edit from. */
export type ProfileValues = { firstName: string; lastName: string; phone: string }

type StoredCustomer = { first_name?: string | null; last_name?: string | null; phone?: string | null }

/** The store's answer to a profile save, as the values the page shows; none when it sent no customer. */
export const savedProfile = (
  customer: StoredCustomer | null | undefined
): { first_name: string; last_name: string; phone: string } | undefined =>
  customer
    ? { first_name: customer.first_name ?? "", last_name: customer.last_name ?? "", phone: customer.phone ?? "" }
    : undefined

/**
 * The values after a save (QA S1-4c, B2): the store's answer when it gave
 * one; otherwise the saved row's fields as sent (trimmed, as the server
 * sends them) over the values shown before. Never the values the page was
 * first rendered with, which may be older than a save made since.
 */
export const afterProfileSave = (
  shown: ProfileValues,
  row: "name" | "phone",
  draft: ProfileValues,
  stored: StoredCustomer | null | undefined
): ProfileValues => {
  const answer = savedProfile(stored)
  if (answer) {
    return { firstName: answer.first_name, lastName: answer.last_name, phone: answer.phone }
  }
  return row === "name"
    ? { ...shown, firstName: draft.firstName.trim(), lastName: draft.lastName.trim() }
    : { ...shown, phone: draft.phone.trim() }
}

/**
 * The name row: a first name is needed; the last name is optional. Both
 * have the checkout's limit (QA S1-4c, S2).
 */
export const validateName = (values: NameValues): Partial<Record<keyof NameValues, string>> => {
  const errors: Partial<Record<keyof NameValues, string>> = {}
  if (!values.firstName.trim()) errors.firstName = checkoutContent.address.errors.firstName
  else {
    const long = tooLong("first_name", values.firstName)
    if (long) errors.firstName = long
  }
  const lastLong = tooLong("last_name", values.lastName)
  if (lastLong) errors.lastName = lastLong
  return errors
}

/**
 * The phone row: optional, as on create account (the phone the courier
 * calls is the one on each address); when given, a real phone number,
 * with the example in the visitor's country's format, within the
 * checkout's limit.
 */
export const validatePhone = (values: PhoneValues): Partial<Record<"phone", string>> => {
  if (!values.phone.trim()) return {}
  const long = tooLong("phone", values.phone)
  if (long) return { phone: long }
  if (isPhone(values.phone)) return {}
  const examples = checkoutContent.address.phoneExamples
  const example = examples[values.countryCode.toLowerCase()] ?? examples.pk
  return { phone: fill(checkoutContent.address.errors.phoneInvalid, { example }) }
}
