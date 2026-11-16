/**
 * POST   /store/carts/:id/rush   adds the rush line, or leaves it if it is there.
 * DELETE /store/carts/:id/rush   removes it, or does nothing if it is not there.
 *
 * docs/contracts/m1-checkout.md, section 9. Publishable key, like every store route. Both answer
 * 200 with `{ "cart": … }`, the cart read with the same fields as Medusa's own cart routes (the
 * `fields` query parameter works the same way: api/middlewares.ts applies Medusa's cart query
 * config). The price of the line is the server's (lib/rules/rush-charge.ts), never the
 * customer's: the request body is ignored.
 *
 * Refusals (POST): unknown cart 404; `rush_percentage` missing or invalid, or the rush product
 * missing, 500 naming it; no garment line, or a percentage of 0, 400 `not_allowed`.
 * DELETE needs no setting (it is the customer's way out); unknown cart 404.
 *
 * Thin: workflows/rush/add-remove-rush.ts.
 */
import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { refetchCart } from "@medusajs/medusa/api/store/carts/helpers"
import { addRush, removeRush } from "../../../../../workflows/rush/add-remove-rush"

export async function POST(req: MedusaRequest, res: MedusaResponse): Promise<void> {
  await addRush(req.scope, req.params.id)
  const cart = await refetchCart(req.params.id, req.scope, req.queryConfig.fields)
  res.status(200).json({ cart })
}

export async function DELETE(req: MedusaRequest, res: MedusaResponse): Promise<void> {
  await removeRush(req.scope, req.params.id)
  const cart = await refetchCart(req.params.id, req.scope, req.queryConfig.fields)
  res.status(200).json({ cart })
}
