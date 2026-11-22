/**
 * POST /store/team-orders/:id/schedule   sets the need-by date and/or the rush choice, while the
 * team order is a draft or has a proof out.
 *
 * Body: `{ need_by_date?: "YYYY-MM-DD" | null, rush_requested?: boolean }`; at least one key.
 * `null` clears the date. Answers 200 with the whole read answer (`schedule` is the new schedule).
 * A date before today (the store's day) is refused; a date that cannot be met is not: the
 * schedule's `state` says it.
 *
 * Refusals: 400 `schedule_empty`, `need_by_date_invalid`, `need_by_date_in_past` (`today`),
 * `rush_requested_invalid`, `team_order_not_editable` (approved or later); 404; 401.
 */
import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { bodyOf, customerIdOf, withRefusals } from "../../../../../lib/http/refusal"
import { setSchedule } from "../../../../../workflows/team-order/proofs"

export const POST = withRefusals(async (req: MedusaRequest, res: MedusaResponse) => {
  res.status(200).json(await setSchedule(req.scope, customerIdOf(req), req.params.id, bodyOf(req)))
})
