/**
 * GET /store/orders/:id/delivery-promise
 *
 * The delivery date promised when the order was placed (the order's `metadata.delivery_promise`,
 * docs/contracts/m1-checkout.md, section 8), for the confirmation and account pages:
 *
 *   { "delivery_promise": { "date": "2026-11-26", "days": 15, "based_on": "2026-11-11", "applies": "standard" } }
 *
 * `delivery_promise` is null for an order placed before the date was kept. Needs the publishable
 * key, like every store route. As in Medusa's own GET /store/orders/:id, the order id is what
 * gives access.
 *
 * Why a route of its own: Medusa's GET /store/orders/:id does not return `metadata` (it is not in
 * its allowed fields, and `fields=+metadata` is dropped), and the complete route returns the order
 * without it. Only the promise is returned here, not the rest of the order's metadata.
 */
import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import { DELIVERY_PROMISE_KEY, readPromisedDelivery } from "../../../../../lib/rules/order-metadata"

export async function GET(req: MedusaRequest, res: MedusaResponse): Promise<void> {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "order",
    fields: ["id", "metadata"],
    filters: { id: req.params.id, is_draft_order: false },
  })
  const order = (data as unknown as { metadata?: Record<string, unknown> | null }[])[0]
  if (!order) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, `Order id not found: ${req.params.id}`)
  }
  res.json({ delivery_promise: readPromisedDelivery(order.metadata?.[DELIVERY_PROMISE_KEY]) })
}
