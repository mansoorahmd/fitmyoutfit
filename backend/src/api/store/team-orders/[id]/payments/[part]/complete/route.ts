/**
 * POST /store/team-orders/:id/payments/:part/complete   completes paying a part (decision 016).
 *
 * Body `{ "session_id": "payses_..." }`: the session POST .../payments/:part started. Medusa
 * authorises and captures it (for the placeholder this is a plain confirmation); then the step the
 * payment causes follows: a paid deposit moves the order `approved -> deposit_paid` (a system
 * step). Answers 200 with the cost answer of GET .../payments. Two requests at the same moment: one
 * pays, the other is refused as already paid.
 *
 * Refusals (400 `not_allowed`, with `status`): `deposit_not_due`, `deposit_already_paid`,
 * `balance_not_due`, `balance_already_paid`, `order_canceled`, `payment_failed`,
 * `payment_requires_action`; 400 `payment_part_invalid`, `payment_session_required`; 409
 * `payment_session_stale` (not the part's session in progress: started again since, or dropped when
 * the order went back to draft), `payment_busy`; 404 `team_order_not_found`; 401.
 */
import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { bodyOf, customerIdOf, withRefusals } from "../../../../../../../lib/http/refusal"
import { completePayment } from "../../../../../../../workflows/team-order/payments"

export const POST = withRefusals(async (req: MedusaRequest, res: MedusaResponse) => {
  res.status(200).json(await completePayment(req.scope, customerIdOf(req), req.params.id, req.params.part, bodyOf(req)))
})
