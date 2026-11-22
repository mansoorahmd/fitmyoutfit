/**
 * GET /store/team-orders/:id/proofs/:proofId   one proof with its snapshot: `{ proof }`, where
 * `proof.snapshot` is the snapshot as an object and `proof.snapshot_text` the canonical JSON text
 * whose SHA-256 is `proof.hash`. The signer's address is never in the answer.
 *
 * Another customer's team order, or an unknown team order or proof, is 404 (`team_order_not_found`,
 * `proof_not_found`); 401 without sign-in.
 */
import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { customerIdOf, withRefusals } from "../../../../../../lib/http/refusal"
import { readOwnProof } from "../../../../../../workflows/team-order/proofs"

export const GET = withRefusals(async (req: MedusaRequest, res: MedusaResponse) => {
  res.status(200).json(await readOwnProof(req.scope, customerIdOf(req), req.params.id, req.params.proofId))
})
