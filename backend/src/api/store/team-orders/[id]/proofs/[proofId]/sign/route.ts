/**
 * POST /store/team-orders/:id/proofs/:proofId/sign   the organizer signs the proof.
 *
 * Body: `{ proof_hash, signed_name, confirmed: true, schedule_state }`: the hash of the proof they
 * looked at, their name as typed, the ticked box, and the schedule state they were shown. Answers
 * 200 with the whole read answer (status `approved`, `current_proof` signed). Signing a proof that
 * is already signed (same hash) answers 200 again and records nothing. The address of the request
 * is stored on the proof (see lib/rules/team-order-proof.ts, clientIp) and is never in an answer
 * or a log line.
 *
 * Refusals: 400 `proof_hash_required`, `signed_name_required`, `confirmation_required`,
 * `schedule_state_required`; 409 `proof_hash_mismatch` (`current_hash`), `proof_not_current`
 * (withdrawn, replaced, or the order is not waiting), `schedule_changed` (`schedule`: the state
 * today is not the one shown); 404 `team_order_not_found`, `proof_not_found`; 401.
 */
import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { bodyOf, customerIdOf, withRefusals } from "../../../../../../../lib/http/refusal"
import { clientIp, readTrustedProxyHops } from "../../../../../../../lib/rules/team-order-proof"
import { signProof } from "../../../../../../../workflows/team-order/proofs"

export const POST = withRefusals(async (req: MedusaRequest, res: MedusaResponse) => {
  const ip = clientIp({
    forwardedFor: req.headers["x-forwarded-for"],
    socketAddress: req.socket?.remoteAddress,
    trustedHops: readTrustedProxyHops(process.env.TRUSTED_PROXY_HOPS),
  })
  res.status(200).json(await signProof(req.scope, customerIdOf(req), req.params.id, req.params.proofId, bodyOf(req), { ip }))
})
