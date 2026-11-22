/**
 * POST /store/team-orders/:id/payments/:part   starts paying a part, `deposit` or `balance` (decision 016).
 *
 * Body, optional: `{ "provider_id"?: "pp_system_default" }` (the placeholder payment, the only one
 * team orders take today). Any amount sent is ignored: the amount is the rule's, from the order's
 * total. Makes a payment session on the part's Medusa payment collection (starting again replaces
 * the earlier session). Answers 200 with the cost answer of GET .../payments plus
 * `payment: { part, amount, currency_code, session: { id, provider_id, status, data }, next: { type } }`.
 * `next.type` is `"confirm"` for the placeholder (complete it with POST .../complete); a redirecting
 * gateway will answer `"redirect"` with where to send the organizer, in the same shape.
 *
 * Refusals (400 `not_allowed`, with `status`): `deposit_not_due`, `deposit_already_paid`,
 * `balance_not_due`, `balance_already_paid`, `payment_in_progress`, `order_canceled`; 400
 * `payment_part_invalid`, `payment_provider_invalid`; 404 `team_order_not_found`; 409 `payment_busy`; 401.
 */
import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { bodyOf, customerIdOf, withRefusals } from "../../../../../../lib/http/refusal"
import { startPayment } from "../../../../../../workflows/team-order/payments"

export const POST = withRefusals(async (req: MedusaRequest, res: MedusaResponse) => {
  res.status(200).json(await startPayment(req.scope, customerIdOf(req), req.params.id, req.params.part, bodyOf(req)))
})
