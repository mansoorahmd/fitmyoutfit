import "server-only"

import { HttpTypes } from "@medusajs/types"
import { redirect } from "next/navigation"

import { customerState } from "@lib/data/customer"
import { authHref } from "@lib/util/account-auth"

/**
 * The signed-in customer for an inner account page, or null when the
 * store didn't answer (the page shows the server-error block). Signed out,
 * the visitor goes to sign-in, which returns here afterwards (`next`).
 */
export const requireCustomer = async (
  countryCode: string,
  path: string
): Promise<HttpTypes.StoreCustomer | null> => {
  const state = await customerState()
  if (state.kind === "signed_out") {
    redirect(`/${countryCode}${authHref("signin", { next: path })}`)
  }
  return state.kind === "signed_in" ? state.customer : null
}
