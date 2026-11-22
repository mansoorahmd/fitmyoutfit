/**
 * PUT /store/team-orders/:id/roster   saves the team list as a whole.
 *
 * Body: `{ version, lines }`. `version` is the `roster.version` the save was made from;
 * `lines` is the whole list, in order: `{ id?, name?, number?, size?, count?, no_name?, no_number? }`
 * each. A list with problems is saved, and the answer carries the problems. Answers 200
 * with the same body as GET /store/team-orders/:id.
 *
 * Refusals: 400 `roster_malformed` (a line or field of the wrong type or too long; `detail` says
 * where), 400 `roster_too_many_lines`, 400 `roster_version_required`, 400 `team_order_not_editable`
 * (not a draft); 409 `roster_version_stale` with `current_version` when the list was saved since
 * `version`; 404 `team_order_not_found`; 401 without sign-in.
 */
import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { bodyOf, customerIdOf, withRefusals } from "../../../../../lib/http/refusal"
import { saveRoster } from "../../../../../workflows/team-order/team-orders"

export const PUT = withRefusals(async (req: MedusaRequest, res: MedusaResponse) => {
  res.status(200).json(await saveRoster(req.scope, customerIdOf(req), req.params.id, bodyOf(req)))
})
