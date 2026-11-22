/**
 * POST /store/team-orders/:id/reopen   back to draft, to change something: from `proof_sent` (the
 * proof becomes `withdrawn`) or from `approved` (the signed proof becomes `replaced`; nothing is
 * paid yet). No body. Answers 200 with the whole read answer. A new proof must be made and signed
 * afterwards; the old one stays on record.
 *
 * Refusals (400 `not_allowed`): `team_order_already_draft`, `team_order_not_reopenable` (after the
 * deposit); 409 `team_order_changed`; 404; 401.
 */
import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { customerIdOf, withRefusals } from "../../../../../lib/http/refusal"
import { reopenTeamOrder } from "../../../../../workflows/team-order/proofs"

export const POST = withRefusals(async (req: MedusaRequest, res: MedusaResponse) => {
  res.status(200).json(await reopenTeamOrder(req.scope, customerIdOf(req), req.params.id))
})
