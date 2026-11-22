/**
 * GET /admin/team-orders   the list of team orders for staff (sign-in as an admin user).
 *
 * Query: `status` (one of the team-order statuses), `limit` (1 to 100, default 20), `offset`.
 * Newest first. Answers 200 `{ team_orders, count, limit, offset }` (`count` is the total that
 * matches). Each entry is an entry of the store's list (`id`, `team_name`, `status`, `kind`,
 * `linked_order_id`, `need_by_date`, `players`, `pieces`, `current_proof`, `created_at`, ...) with
 * `organizer` `{ id, name, email }`, `region` `{ id, name }` and `schedule` `{ state, need_by_date,
 * latest_sign_standard, latest_sign_rush, days_left_standard, days_left_rush, today }`: for a draft
 * or a proof out, the state today; for a signed order, the state recorded at signing.
 * Refusals: 400 `status_invalid`, `limit_invalid`, `offset_invalid`; 401 without an admin sign-in
 * (a customer's token is refused too).
 */
import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { withRefusals } from "../../../lib/http/refusal"
import { listForAdmin } from "../../../workflows/team-order/admin"

export const GET = withRefusals(async (req: MedusaRequest, res: MedusaResponse) => {
  res.status(200).json(await listForAdmin(req.scope, req.query))
})
