/**
 * GET /admin/team-orders/:id   one team order with everything staff look at (sign-in as an admin user).
 *
 * Answers 200 the store's whole read answer (`team_order`, `sizes`, `roster` with the checks and the
 * summary per size, `limits`, `schedule`, `current_proof`, `links`) plus:
 * - `organizer` `{ id, name, email }`, `region` `{ id, name }`, `product` `{ id, title }`,
 *   `design_version` `{ id, design_id, design_name, version }`;
 * - `proofs`: every proof, newest first, each with `number`, `status`, `hash`, `signed_name`,
 *   `signed_at`, `signed_by` (the organizer), `signed_by_customer_id`, `signed_ip` (the address it
 *   was signed from: personal data, staff only), `snapshot` (the list that was signed) and
 *   `snapshot_text`;
 * - `steps`: the record of status steps, oldest first: `step_name`, `from`, `to`, `actor`
 *   (`organizer`, `admin`, `system`), `actor_label`, `actor_person`, `by_hand`, `created_at`
 *   (the note "balance received by hand" has the same status in `from` and `to`);
 * - `emails`: the emails to the organizer: `kind`, `status` (`pending`, `sent`, `failed`),
 *   `attempts`, `sent_at`;
 * - `actions`: the buttons the order's status offers staff: `{ id, to, label, confirm, by_hand }`.
 * Refusals: 404 `team_order_not_found`; 401 without an admin sign-in.
 */
import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { withRefusals } from "../../../../lib/http/refusal"
import { readForAdmin } from "../../../../workflows/team-order/admin"

export const GET = withRefusals(async (req: MedusaRequest, res: MedusaResponse) => {
  res.status(200).json(await readForAdmin(req.scope, req.params.id))
})
