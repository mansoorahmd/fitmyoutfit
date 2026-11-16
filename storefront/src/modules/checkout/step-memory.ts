// What the checkout keeps while the visitor moves between its steps.
//
// A step change is a real navigation (router.push to `?step=…`), so Back
// goes from step 2 to step 1. Next.js keys a page by its search params, so
// each step change mounts the page afresh; what the customer typed in step
// 1 and which step should take focus are kept here, in the browser's memory
// for this tab, by cart.

import { AddressFormValues } from "@lib/util/checkout-address"
import { CheckoutStep } from "@lib/util/checkout-view"

const drafts = new Map<string, AddressFormValues>()
let pendingFocus: CheckoutStep | null = null

/** The form's values as last typed on this cart, when they still fit the region's countries. */
export const addressDraft = (
  cartId: string,
  countryCodes: string[]
): AddressFormValues | null => {
  const draft = drafts.get(cartId)
  if (!draft) return null
  const fits = (code: string) => countryCodes.includes(code.toLowerCase())
  return fits(draft.shipping.country_code) && (draft.billingSame || fits(draft.billing.country_code))
    ? draft
    : null
}

export const keepAddressDraft = (cartId: string, values: AddressFormValues) => {
  drafts.set(cartId, values)
}

export const forgetAddressDraft = (cartId: string) => {
  drafts.delete(cartId)
}

/** The step whose heading takes focus when it opens after a step change. */
export const focusStepOnOpen = (step: CheckoutStep) => {
  pendingFocus = step
}

/** True once, for the step that should take focus. */
export const takeStepFocus = (step: CheckoutStep): boolean => {
  if (pendingFocus !== step) return false
  pendingFocus = null
  return true
}
