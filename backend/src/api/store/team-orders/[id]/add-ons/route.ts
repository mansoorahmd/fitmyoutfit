/**
 * POST /store/team-orders/:id/add-ons   starts an add-on for late joiners from an order of the
 *                                       caller's own whose proof is signed (`approved` or later).
 * GET  /store/team-orders/:id/add-ons   the order's add-ons, oldest first.
 *
 * An add-on is a team order of its own (draft, empty team list), linked to the first order
 * (`team_order.kind` "add_on", `linked_order_id`), with the same design version, product and region.
 * It is read, filled, proofed and signed through the ordinary team-order routes; its team-list
 * checks also see the numbers taken in the first order's signed list and in the other add-ons that
 * have a proof out or signed (`number-taken-first-order`, `number-taken-add-on`), and its minimum
 * is the region's `addon_min_garment_quantity`.
 *
 * POST body (all optional): `{ team_name?, need_by_date?: "YYYY-MM-DD", rush_requested? }`.
 * POST answers 201 with the add-on's whole read answer. GET answers 200 `{ add_ons, count }`, each
 * as an entry of GET /store/team-orders (the order with `players`, `pieces`, `current_proof`).
 *
 * Refusals (400 `not_allowed`): `add_on_of_add_on` (an add-on cannot have add-ons),
 * `team_order_not_signed` (with `status`); 400 `team_name_invalid`, `need_by_date_invalid`,
 * `need_by_date_in_past`, `rush_requested_invalid`; 404 `team_order_not_found` (also another
 * customer's); 401 without sign-in.
 */
import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { bodyOf, customerIdOf, withRefusals } from "../../../../../lib/http/refusal"
import { createAddOn, listAddOns } from "../../../../../workflows/team-order/linked-orders"

export const POST = withRefusals(async (req: MedusaRequest, res: MedusaResponse) => {
  res.status(201).json(await createAddOn(req.scope, customerIdOf(req), req.params.id, bodyOf(req)))
})

export const GET = withRefusals(async (req: MedusaRequest, res: MedusaResponse) => {
  res.status(200).json(await listAddOns(req.scope, customerIdOf(req), req.params.id))
})
