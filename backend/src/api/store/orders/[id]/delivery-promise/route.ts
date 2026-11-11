/**
 * GET /store/orders/:id/delivery-promise
 *
 * The delivery date promised to the order (the order's `metadata.delivery_promise`,
 * docs/contracts/m1-checkout.md, section 8), for the confirmation and account pages:
 *
 *   { "delivery_promise": { "date": "2026-11-26", "days": 15, "based_on": "2026-11-11", "applies": "standard" } }
 *
 * Before answering it makes sure the order keeps its promise
 * (workflows/delivery-promise/keep-order-delivery-promise.ts): a valid kept promise is returned as
 * it is; an order without one (the order-placed subscriber has not run yet, a converted draft
 * order, an order placed before the promise was kept) gets it now, worked out from the order's
 * creation date in Asia/Karachi. When none is kept and the delivery-days settings are missing or
 * invalid, it answers HTTP 500 naming the key, like the other checkout routes: it never invents
 * a date. An unknown order (or a draft order): 404.
 *
 * Needs the publishable key, like every store route. As in Medusa's own GET /store/orders/:id,
 * the order id is what gives access.
 *
 * Why a route of its own: Medusa's GET /store/orders/:id does not return `metadata` (it is not in
 * its allowed fields, and `fields=+metadata` is dropped), and the complete route returns the order
 * without it. Only the promise is returned here, not the rest of the order's metadata.
 */
import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { keepOrderDeliveryPromise } from "../../../../../workflows/delivery-promise/keep-order-delivery-promise"

export async function GET(req: MedusaRequest, res: MedusaResponse): Promise<void> {
  const promise = await keepOrderDeliveryPromise(req.scope, req.params.id, "any_valid")
  res.json({ delivery_promise: promise })
}
