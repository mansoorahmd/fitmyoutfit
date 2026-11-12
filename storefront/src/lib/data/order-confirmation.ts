"use server"

import { HttpTypes } from "@medusajs/types"

import { sdk } from "@lib/config"
import { within } from "@lib/util/deadline"
import {
  OrderPromise,
  OrderRead,
  PROMISE_TIMEOUT_MS,
  orderReadFailure,
  parseOrderPromise,
} from "@lib/util/order-confirmation"

import { getAuthHeaders } from "./cookies"

/**
 * The order for its confirmation page (docs/design/05-m1-pages.md, 7):
 * lines, totals, the delivery address, the delivery method, the payments
 * (for the method) and the customer it belongs to. Read fresh. "Not found"
 * only when the backend says so (a 4xx); no answer or a 5xx is a failure,
 * and the page says the store didn't answer, never that the order doesn't
 * exist (QA S1-4, D3).
 */
export async function retrieveOrderForConfirmation(id: string): Promise<OrderRead> {
  try {
    const { order } = await sdk.client.fetch<HttpTypes.StoreOrderResponse>(
      `/store/orders/${encodeURIComponent(id)}`,
      {
        method: "GET",
        query: {
          fields:
            "*items,*items.variant,*items.product,*shipping_address,*shipping_methods,*payment_collections,*payment_collections.payments,+customer_id",
        },
        headers: { ...(await getAuthHeaders()) },
        cache: "no-store",
      }
    )
    return order ? { kind: "found", order } : { kind: "not_found" }
  } catch (error) {
    return orderReadFailure((error as { status?: unknown })?.status)
  }
}

/**
 * The date promised when the order was placed: GET
 * /store/orders/:id/delivery-promise (contract 8.1). Null when the order
 * has none, the route fails, the answer can't be read, or it takes longer
 * than PROMISE_TIMEOUT_MS: the page then leaves the date out (W-O11b),
 * never works it out again, and never waits on it (QA S1-4, D4).
 */
export async function getOrderDeliveryPromise(id: string): Promise<OrderPromise | null> {
  try {
    const json = await within(PROMISE_TIMEOUT_MS, async (signal) =>
      sdk.client.fetch<unknown>(`/store/orders/${encodeURIComponent(id)}/delivery-promise`, {
        method: "GET",
        headers: { ...(await getAuthHeaders()) },
        cache: "no-store",
        signal,
      })
    )
    return parseOrderPromise(json)
  } catch {
    return null
  }
}
