/**
 * GET /store/team-orders/:id/payments   what the team order costs and what is paid (decision 016).
 *
 * The cost is the Medusa order priced from the proof that is out or signed: one line per size, the
 * region's delivery (the duty-paid line for export), the rush charge when the order asks for rush,
 * tax as the store has it, the total; and the deposit and the balance (the split rule), each with
 * its state, whether it is due now, and what is paid and outstanding, in the region's currency.
 * While the proof is out it is a quote (`cost.state: "quote"`); from signing on, the order
 * (`"ordered"`). Answers 200 `{ team_order, cost, payments, order }`.
 *
 * Refusals: 400 `team_order_not_priced` (a draft: no proof yet, with `status`); 404
 * `team_order_not_found` (also another customer's); 409 `payment_busy`; 401 without sign-in.
 * docs/contracts (the payments section) describes the answer.
 */
import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { customerIdOf, withRefusals } from "../../../../../lib/http/refusal"
import { readOwnMoney } from "../../../../../workflows/team-order/payments"

export const GET = withRefusals(async (req: MedusaRequest, res: MedusaResponse) => {
  res.status(200).json(await readOwnMoney(req.scope, customerIdOf(req), req.params.id))
})
