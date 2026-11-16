/**
 * POST   /store/carts/:id/promotions   { "promo_codes": [...] }
 * DELETE /store/carts/:id/promotions   { "promo_codes": [...] }
 *
 * Replaces Medusa's own handler for these two routes (a route file in the project overrides
 * Medusa's at the same path; Medusa's middlewares for the path, which check the body and the
 * `fields` query, still run first). It does what Medusa 2.22.6's handler does (apply or remove the
 * codes with updateCartPromotionsWorkflow, refresh the payment collection, answer with the cart),
 * and in the same run, under the cart's lock, prices the rush line on the new discounts
 * (workflows/rush/rush-workflows.ts), because Medusa's promotion workflow does not refresh the
 * cart's items and so never reaches our refresh hook.
 *
 * One difference: when another change holds the cart's lock for longer than Medusa waits
 * (2 seconds), it answers HTTP 409 (`conflict`, try again) like the rush routes, where Medusa's
 * handler answers 500 (QA's thirteenth review, A7).
 *
 * Check on every Medusa upgrade: Medusa's handler (node_modules/@medusajs/medusa/dist/api/store/
 * carts/[id]/promotions/route.js) against this copy.
 */
import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { PromotionActions } from "@medusajs/framework/utils"
import { refetchCart } from "@medusajs/medusa/api/store/carts/helpers"
import { asConflictOnLockTimeout } from "../../../../../workflows/rush/add-remove-rush"
import { updateCartPromotionsWithRushWorkflow } from "../../../../../workflows/rush/rush-workflows"

type PromotionsBody = { promo_codes?: string[] }

/** HTTP 409 (`conflict`) when the cart's lock is held too long, as the rush routes answer. */
async function run(req: MedusaRequest, action: string): Promise<void> {
  const body = (req.validatedBody ?? req.body ?? {}) as PromotionsBody
  await asConflictOnLockTimeout(req.params.id, () =>
    updateCartPromotionsWithRushWorkflow(req.scope).run({
      input: { cart_id: req.params.id, promo_codes: body.promo_codes ?? [], action },
    })
  )
}

export async function POST(req: MedusaRequest, res: MedusaResponse): Promise<void> {
  const codes = ((req.validatedBody ?? req.body ?? {}) as PromotionsBody).promo_codes ?? []
  await run(req, codes.length > 0 ? PromotionActions.ADD : PromotionActions.REPLACE)
  const cart = await refetchCart(req.params.id, req.scope, req.queryConfig.fields)
  res.status(200).json({ cart })
}

export async function DELETE(req: MedusaRequest, res: MedusaResponse): Promise<void> {
  await run(req, PromotionActions.REMOVE)
  const cart = await refetchCart(req.params.id, req.scope, req.queryConfig.fields)
  res.status(200).json({ cart })
}
