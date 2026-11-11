// The profile's editable rows (docs/design/05-m1-pages.md, 9.6): the name
// and the phone, with the same checks and messages as create account and
// the checkout. Plain data in and out.

import { checkoutContent } from "@content/checkout"

import { isPhone } from "./checkout-address"
import { fill } from "./wording"

export type NameValues = { firstName: string; lastName: string }
export type PhoneValues = { phone: string; countryCode: string }

/** The name row: a first name is needed; the last name is optional. */
export const validateName = (values: NameValues): Partial<Record<keyof NameValues, string>> =>
  values.firstName.trim() ? {} : { firstName: checkoutContent.address.errors.firstName }

/**
 * The phone row: optional, as on create account (the phone the courier
 * calls is the one on each address); when given, a real phone number,
 * with the example in the visitor's country's format.
 */
export const validatePhone = (values: PhoneValues): Partial<Record<"phone", string>> => {
  if (!values.phone.trim() || isPhone(values.phone)) return {}
  const examples = checkoutContent.address.phoneExamples
  const example = examples[values.countryCode.toLowerCase()] ?? examples.pk
  return { phone: fill(checkoutContent.address.errors.phoneInvalid, { example }) }
}
