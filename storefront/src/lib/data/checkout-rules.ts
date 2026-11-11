"use server"

import { sdk } from "@lib/config"
import { CheckoutRules, parseCheckoutRules } from "@lib/util/checkout-rules"

import { getAuthHeaders } from "./cookies"

/**
 * The backend's checkout rules for a cart: GET
 * /store/carts/:id/checkout-rules (docs/contracts/m1-checkout.md, section
 * 6). Null when the route is missing (404), fails, or answers in a shape
 * the storefront can't read. The cart then leaves out the date and the
 * minimum progress and keeps checkout usable (05, 4.4): the backend still
 * enforces the rules when the order is placed. Never a made-up answer.
 *
 * Not cached: the rules change with every change to the cart, and the date
 * moves at midnight in Karachi.
 */
export async function getCheckoutRules(
  cartId: string | null | undefined
): Promise<CheckoutRules | null> {
  if (!cartId) {
    return null
  }

  try {
    const json = await sdk.client.fetch<unknown>(
      `/store/carts/${encodeURIComponent(cartId)}/checkout-rules`,
      {
        method: "GET",
        headers: { ...(await getAuthHeaders()) },
        cache: "no-store",
      }
    )
    return parseCheckoutRules(json)
  } catch {
    return null
  }
}
