"use server"

import { HttpTypes } from "@medusajs/types"

import { sdk } from "@lib/config"
import { OrderPromise } from "@lib/util/order-confirmation"

import { getAuthHeaders } from "./cookies"
import { getOrderDeliveryPromise } from "./order-confirmation"

// The signed-in customer's orders (docs/design/05-m1-pages.md, 9.3 and
// 9.4). Read fresh, never from the cache: staff change an order's status
// and record cash as collected in the admin, and the account must show
// that. Only the fields the pages show are asked for; an order's
// `metadata` (where staff keys such as `cod_slip_reference` live) is never
// read here. The promised date comes from its own route.

/** The order card's fields (05, 9.3): number, date, status, total, lines for the count and thumbnails. */
const LIST_FIELDS = [
  "id",
  "display_id",
  "created_at",
  "status",
  "fulfillment_status",
  "payment_status",
  "total",
  "currency_code",
  // "items.quantity" and the like return no items at all (Medusa 2.22, checked
  // against the backend); the whole line is the smallest ask that works.
  "*items",
].join(",")

/** One order's fields (05, 9.4): the confirmation's, the status, and whether the payment was captured. */
const ORDER_FIELDS = [
  "id",
  "display_id",
  "created_at",
  "email",
  "customer_id",
  "status",
  "fulfillment_status",
  "payment_status",
  "currency_code",
  "total",
  "item_subtotal",
  "shipping_subtotal",
  "*items",
  "*items.variant",
  "*items.product",
  "*shipping_address",
  "*shipping_methods",
  "*payment_collections",
  "*payment_collections.payments",
].join(",")

export type AccountOrderList =
  | { ok: true; orders: HttpTypes.StoreOrder[]; count: number; promises: (OrderPromise | null)[] }
  | { ok: false }

/**
 * The customer's orders, newest first, with each one's promised date
 * (null where none was kept or the route failed: the card leaves it out).
 */
export async function listAccountOrders(limit: number): Promise<AccountOrderList> {
  try {
    const { orders, count } = await sdk.client.fetch<HttpTypes.StoreOrderListResponse>(`/store/orders`, {
      method: "GET",
      query: { limit, offset: 0, order: "-created_at", fields: LIST_FIELDS },
      headers: { ...(await getAuthHeaders()) },
      cache: "no-store",
    })
    const promises = await Promise.all(orders.map((o) => getOrderDeliveryPromise(o.id)))
    return { ok: true, orders, count: count ?? orders.length, promises }
  } catch {
    return { ok: false }
  }
}

export type AccountOrder =
  | { kind: "found"; order: HttpTypes.StoreOrder; promise: OrderPromise | null }
  | { kind: "not_found" }
  | { kind: "failed" }

/**
 * One of the customer's orders. Medusa's store route gives any order to
 * whoever knows its id, so an order that isn't this customer's is "not
 * found" here (05, 7.3). An unknown id is "not found"; no answer or a 5xx
 * is "failed".
 */
export async function retrieveAccountOrder(id: string, customerId: string): Promise<AccountOrder> {
  try {
    const { order } = await sdk.client.fetch<HttpTypes.StoreOrderResponse>(
      `/store/orders/${encodeURIComponent(id)}`,
      {
        method: "GET",
        query: { fields: ORDER_FIELDS },
        headers: { ...(await getAuthHeaders()) },
        cache: "no-store",
      }
    )
    if (!order || order.customer_id !== customerId) {
      return { kind: "not_found" }
    }
    return { kind: "found", order, promise: await getOrderDeliveryPromise(order.id) }
  } catch (error) {
    const status = (error as { status?: number })?.status
    return typeof status === "number" && status < 500 ? { kind: "not_found" } : { kind: "failed" }
  }
}

// The order-transfer pages (/order/:id/transfer/:token) still use these.
// The account no longer offers a transfer request (task S1-5): it needs
// email, which M1 doesn't send (gap G7).

export const acceptTransferRequest = async (id: string, token: string) => {
  const headers = await getAuthHeaders()

  return await sdk.store.order
    .acceptTransfer(id, { token }, {}, headers)
    .then(({ order }) => ({ success: true, error: null, order }))
    .catch((err) => ({ success: false, error: err.message, order: null }))
}

export const declineTransferRequest = async (id: string, token: string) => {
  const headers = await getAuthHeaders()

  return await sdk.store.order
    .declineTransfer(id, { token }, {}, headers)
    .then(({ order }) => ({ success: true, error: null, order }))
    .catch((err) => ({ success: false, error: err.message, order: null }))
}
