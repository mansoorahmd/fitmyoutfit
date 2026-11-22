/**
 * POST /admin/team-orders/:id/steps   an admin's step of the status flow (sign-in as an admin user).
 *
 * Body `{ "action": "deposit_by_hand" | "start_production" | "ask_balance" | "balance_by_hand" | "ship" }`:
 * - `deposit_by_hand`: `approved -> deposit_paid`, marked as received by hand (payments are not
 *   built yet; nothing is checked);
 * - `start_production`: `deposit_paid -> in_production`;
 * - `ask_balance`: `in_production -> balance_due` (the organizer is emailed that the balance is due);
 * - `balance_by_hand`: a note on an order in `balance_due` that the balance was received by hand
 *   (once; the status stays `balance_due`);
 * - `ship`: `balance_due -> shipped`.
 * Every step is recorded with the admin user's id and the time. Answers 200 with the order as
 * GET /admin/team-orders/:id does. A step the rules do not offer for the order's status is 400
 * `step_not_allowed` (with `status`); 400 `action_invalid`; 409 `team_order_changed` (the order moved
 * at the same moment); 404 `team_order_not_found`; 401 without an admin sign-in.
 */
import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { bodyOf, Refusal, withRefusals } from "../../../../../lib/http/refusal"
import { stepForAdmin } from "../../../../../workflows/team-order/admin"

export const POST = withRefusals(async (req, res: MedusaResponse) => {
  const adminId = (req as AuthenticatedMedusaRequest).auth_context?.actor_id
  if (!adminId) {
    throw new Refusal(401, "not_allowed", "unauthorized", "Unauthorized")
  }
  res.status(200).json(await stepForAdmin(req.scope, adminId, req.params.id, bodyOf(req)))
})
