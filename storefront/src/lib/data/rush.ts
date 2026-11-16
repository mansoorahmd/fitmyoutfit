"use server"

import { sdk } from "@lib/config"
import { RushSaveResult, saveRushChoice } from "@lib/util/rush"

import { call } from "./backend-call"
import { revalidateCartCaches } from "./cart-cache"
import { getAuthHeaders, getCartId } from "./cookies"

// The rush option's calls to the backend (docs/contracts/m1-checkout.md,
// section 9): POST /store/carts/:id/rush adds the line, DELETE removes it.
// The price is always the server's; nothing is sent but the cart's id.

/** The fields the routes answer with: only the id (the page reads the cart itself). */
const ANSWER_FIELDS = "id"

const send = async (cartId: string, method: "POST" | "DELETE") => {
  const answer = await call(async () =>
    sdk.client.fetch<unknown>(`/store/carts/${encodeURIComponent(cartId)}/rush`, {
      method,
      query: { fields: ANSWER_FIELDS },
      headers: { ...(await getAuthHeaders()) },
      cache: "no-store",
    })
  )
  return answer.ok ? ({ ok: true } as const) : ({ ok: false, status: answer.status } as const)
}

/**
 * The customer chose Rush (`rush` true) or Standard: adds or removes the
 * rush line. A 409 is sent again once by itself (saveRushChoice). After an
 * answer that may have changed the cart, or a refusal (rush no longer
 * offered), every cached read of the cart is dropped, so the page shows the
 * cart, the totals and the control as the backend now has them.
 */
export async function chooseRush(rush: boolean): Promise<RushSaveResult> {
  const cartId = await getCartId()
  if (!cartId) {
    return { ok: false, kind: "cart_lost" }
  }
  const result = await saveRushChoice(() => send(cartId, rush ? "POST" : "DELETE"))
  if (result.ok || result.kind === "refused" || result.kind === "no_answer") {
    await revalidateCartCaches()
  }
  return result
}

/**
 * Takes off a rush line the store no longer offers (rushIsStale: the
 * percentage is 0, or no garment is left), before the cart page or the
 * checkout shows the cart. True when it is gone; false when it couldn't
 * be removed (the page then shows the cart as it is).
 *
 * The visitor's own cart only (the cookie's), never one named by the
 * caller. Called while a page renders, so it drops no cached reads itself;
 * the pages read the cart fresh, and the header's count never counts rush.
 */
export async function dropStaleRush(): Promise<boolean> {
  const cartId = await getCartId()
  if (!cartId) {
    return false
  }
  const result = await send(cartId, "DELETE")
  return result.ok
}
