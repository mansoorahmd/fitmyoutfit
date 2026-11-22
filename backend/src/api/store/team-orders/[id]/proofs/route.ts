/**
 * POST /store/team-orders/:id/proofs   makes the roster proof of the team list as it is now
 *                                      (draft -> proof_sent). No body. Answers 201 with the whole
 *                                      read answer; `current_proof` is the new proof.
 * GET  /store/team-orders/:id/proofs   the team order's proofs, newest first, without their
 *                                      snapshots: `{ proofs, count }`.
 *
 * Refusals (400 `not_allowed`): `team_order_not_draft` (a proof is out or signed already),
 * `roster_empty`, `roster_has_problems` (`problems`, `indexes_to_fix`), `roster_below_minimum`
 * (`required`, `missing`); 409 `team_order_changed` (changed at the same moment); 404
 * `team_order_not_found`; 401 without sign-in.
 */
import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { customerIdOf, withRefusals } from "../../../../../lib/http/refusal"
import { listOwnProofs, makeProof } from "../../../../../workflows/team-order/proofs"

export const POST = withRefusals(async (req: MedusaRequest, res: MedusaResponse) => {
  res.status(201).json(await makeProof(req.scope, customerIdOf(req), req.params.id))
})

export const GET = withRefusals(async (req: MedusaRequest, res: MedusaResponse) => {
  res.status(200).json(await listOwnProofs(req.scope, customerIdOf(req), req.params.id))
})
