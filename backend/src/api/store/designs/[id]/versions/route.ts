/**
 * POST /store/designs/:id/versions   adds a version to one of the customer's own designs. Nothing
 * is overwritten: the new version takes the next number.
 *
 * Body: `{ product_id?, design }` (`product_id` defaults to the latest version's). Answers 201
 * `{ design, version }`. Refusals as POST /store/designs, and 404 `design_not_found`.
 */
import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { bodyOf, customerIdOf, withRefusals } from "../../../../../lib/http/refusal"
import { addDesignVersion } from "../../../../../workflows/design/designs"

export const POST = withRefusals(async (req: MedusaRequest, res: MedusaResponse) => {
  const saved = await addDesignVersion(req.scope, customerIdOf(req), req.params.id, bodyOf(req))
  res.status(201).json(saved)
})
