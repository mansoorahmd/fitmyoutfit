/**
 * POST /store/team-orders   makes a team order (status `draft`, empty team list) for the signed-in
 *                           customer, who is its organizer.
 * GET  /store/team-orders   lists the customer's own team orders, newest first.
 *
 * Body of POST: `{ team_name, design_version_id, region_id, product_id?, need_by_date? }`.
 * `design_version_id` must be a version of one of the customer's own designs (another customer's
 * is 404 `design_version_not_found`). The product is the version's; `product_id`, when sent, must
 * be it (400 `product_mismatch`). `need_by_date` is `YYYY-MM-DD` and is only stored. Which fields
 * the design prints (`prints`) is read from the design version, not from the request.
 * Answers 201 with the same body as GET /store/team-orders/:id. GET answers 200
 * `{ team_orders, count }`, each with `players` and `pieces`. Customer sign-in is required (401).
 * Refusals (400): team_name_invalid, need_by_date_invalid, design_version_id_required,
 * product_mismatch, product_not_found, region_id_required, region_not_found.
 */
import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { bodyOf, customerIdOf, withRefusals } from "../../../lib/http/refusal"
import { createTeamOrder, listOwnTeamOrders } from "../../../workflows/team-order/team-orders"

export const POST = withRefusals(async (req: MedusaRequest, res: MedusaResponse) => {
  res.status(201).json(await createTeamOrder(req.scope, customerIdOf(req), bodyOf(req)))
})

export const GET = withRefusals(async (req: MedusaRequest, res: MedusaResponse) => {
  const teamOrders = await listOwnTeamOrders(req.scope, customerIdOf(req))
  res.status(200).json({ team_orders: teamOrders, count: teamOrders.length })
})
