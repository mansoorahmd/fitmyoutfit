/**
 * GET    /store/team-orders/:id   one team order of the signed-in organizer, with its team list,
 *                                 the checks' result for every line and the summary with the
 *                                 region's minimum, the limits, the schedule, the current proof and
 *                                 `links` (what it belongs to, its add-ons and reorders):
 *                                 `{ team_order, sizes, roster, limits, schedule, current_proof, links }`.
 * POST   /store/team-orders/:id   renames the team: body `{ team_name }`; answers as GET.
 * DELETE /store/team-orders/:id   deletes a draft team order and its list:
 *                                 `{ id, object: "team_order", deleted: true }`.
 *
 * Another customer's team order, or an unknown id, is 404 `team_order_not_found`; no sign-in is
 * 401. Refusals: 400 team_name_invalid; 400 `team_order_not_draft` for a delete after `draft`;
 * 400 `team_order_has_linked_orders` for a delete of an order that has add-ons or reorders.
 */
import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { bodyOf, customerIdOf, withRefusals } from "../../../../lib/http/refusal"
import {
  deleteTeamOrder,
  readOwnTeamOrder,
  renameTeamOrder,
} from "../../../../workflows/team-order/team-orders"

export const GET = withRefusals(async (req: MedusaRequest, res: MedusaResponse) => {
  res.status(200).json(await readOwnTeamOrder(req.scope, customerIdOf(req), req.params.id))
})

export const POST = withRefusals(async (req: MedusaRequest, res: MedusaResponse) => {
  res.status(200).json(await renameTeamOrder(req.scope, customerIdOf(req), req.params.id, bodyOf(req)))
})

export const DELETE = withRefusals(async (req: MedusaRequest, res: MedusaResponse) => {
  res.status(200).json(await deleteTeamOrder(req.scope, customerIdOf(req), req.params.id))
})
