/**
 * POST /store/team-orders/:id/design-version   points a draft team order at another version of the
 * same design. Body `{ design_version_id }`. Answers 200 with the whole read answer (what the
 * design prints, `team_order.prints`, is read again from the new version).
 *
 * Refusals: 400 `design_version_id_required`, `design_mismatch`, `product_mismatch`,
 * `team_order_not_editable` (a proof was made: go back to draft first); 404 `design_version_not_found`
 * (unknown, or another customer's), `team_order_not_found`; 401.
 */
import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { bodyOf, customerIdOf, withRefusals } from "../../../../../lib/http/refusal"
import { setDesignVersion } from "../../../../../workflows/team-order/proofs"

export const POST = withRefusals(async (req: MedusaRequest, res: MedusaResponse) => {
  res.status(200).json(await setDesignVersion(req.scope, customerIdOf(req), req.params.id, bodyOf(req)))
})
