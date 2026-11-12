import "server-only"

import { HttpTypes } from "@medusajs/types"
import { revalidateTag } from "next/cache"

import { sdk } from "@lib/config"
import { within } from "@lib/util/deadline"
import {
  ORDER_STATUS_BACKEND_MS,
  OrderStatus,
  confirmationPath,
  findOrderFlow,
} from "@lib/util/order-status"

import { call } from "./backend-call"
import { revalidateCartCaches } from "./cart-cache"
import { getAuthHeaders, getCacheTag, getCartId, removeCartId } from "./cookies"

/**
 * After an order: the cart cookie goes (only when it still points to the
 * ordered cart), and every cached read of the cart and of the orders, so
 * no page shows the ordered cart as a live one again.
 */
export const afterOrder = async (cartId: string): Promise<void> => {
  if ((await getCartId()) === cartId) {
    await removeCartId()
  }
  await revalidateCartCaches()
  const orders = await getCacheTag("orders")
  if (orders) revalidateTag(orders)
}

/**
 * Whether a cart became an order, and its confirmation when it did (lib/
 * util/order-status.ts). Used by the order-status route and by adding to
 * the cart. All its calls to the backend share one time limit, so it
 * answers within ORDER_STATUS_BACKEND_MS. Only an order clears the cart
 * cookie; a cart that is an order but couldn't be read keeps it, so the
 * next page can try again.
 */
export async function findOrderForCart(cartId: string, urlCountry: string): Promise<OrderStatus> {
  const ends = Date.now() + ORDER_STATUS_BACKEND_MS
  const left = () => Math.max(1, ends - Date.now())
  const headers = { ...(await getAuthHeaders()) }

  const found = await findOrderFlow({
    readCart: () =>
      call(async () => {
        const { cart } = await within(left(), (signal) =>
          sdk.client.fetch<HttpTypes.StoreCartResponse>(`/store/carts/${encodeURIComponent(cartId)}`, {
            method: "GET",
            query: { fields: "id,completed_at" },
            headers,
            cache: "no-store",
            signal,
          })
        )
        return cart
      }),
    complete: () =>
      call(() =>
        within(left(), (signal) =>
          sdk.client.fetch<never>(`/store/carts/${encodeURIComponent(cartId)}/complete`, {
            method: "POST",
            headers,
            signal,
          })
        )
      ),
  })

  if (found.kind === "order") {
    await afterOrder(cartId)
    return { kind: "order", url: confirmationPath(found.orderId, found.countryCode, urlCountry) }
  }
  if (found.kind !== "no_answer") {
    // the cart as it is now, for every page that caches it (the header)
    await revalidateCartCaches()
  }
  return found
}
