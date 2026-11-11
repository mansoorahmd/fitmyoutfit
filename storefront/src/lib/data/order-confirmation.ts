"use server"

import { HttpTypes } from "@medusajs/types"

import { sdk } from "@lib/config"
import { OrderPromise, parseOrderPromise } from "@lib/util/order-confirmation"

import { getAuthHeaders } from "./cookies"

/**
 * The order for its confirmation page (docs/design/05-m1-pages.md, 7):
 * lines, totals, the delivery address, the delivery method and the
 * payments (for the method). Read fresh. Null when the backend doesn't know
 * it (or it can't be read): the page says it can't find the order.
 */
export async function retrieveOrderForConfirmation(
  id: string
): Promise<HttpTypes.StoreOrder | null> {
  try {
    const { order } = await sdk.client.fetch<HttpTypes.StoreOrderResponse>(
      `/store/orders/${encodeURIComponent(id)}`,
      {
        method: "GET",
        query: {
          fields:
            "*items,*items.variant,*items.product,*shipping_address,*shipping_methods,*payment_collections,*payment_collections.payments",
        },
        headers: { ...(await getAuthHeaders()) },
        cache: "no-store",
      }
    )
    return order
  } catch {
    return null
  }
}

/**
 * The date promised when the order was placed: GET
 * /store/orders/:id/delivery-promise (contract 8.1). Null when the order
 * has none, the route fails or the answer can't be read: the page then
 * leaves the date out, never works it out again.
 */
export async function getOrderDeliveryPromise(id: string): Promise<OrderPromise | null> {
  try {
    const json = await sdk.client.fetch<unknown>(
      `/store/orders/${encodeURIComponent(id)}/delivery-promise`,
      { method: "GET", headers: { ...(await getAuthHeaders()) }, cache: "no-store" }
    )
    return parseOrderPromise(json)
  } catch {
    return null
  }
}
