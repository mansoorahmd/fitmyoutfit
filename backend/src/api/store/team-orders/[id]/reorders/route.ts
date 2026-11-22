/**
 * POST /store/team-orders/:id/reorders   starts a reorder from an order of the caller's own whose
 *                                        proof is signed (`approved` or later).
 *
 * The reorder is a new, full team order (draft) with the same design version and product, linked to
 * the source (`team_order.kind` "reorder", `linked_order_id`; the source's answer lists it under
 * `links.reorders`). The players are taken from the source's SIGNED list, never from a later draft.
 * The existing routes change sizes and counts, add players and make the proof; the region's ordinary
 * minimum applies and its numbers are checked within itself only.
 *
 * Body (all optional): `{ take?, team_name?, region_id?, need_by_date?, rush_requested? }`.
 * `take` is `"all"` (the default), `"none"`, or a list of positions in the signed list (0 is the
 * first line of the signed proof's snapshot, GET .../proofs/:proofId). The region is the source's
 * unless `region_id` names another. Answers 201 with the new order's whole read answer.
 *
 * Refusals: 400 `not_allowed` `team_order_not_signed` (with `status`); 400 `take_invalid`,
 * `take_out_of_range` (with `lines`), `team_name_invalid`, `need_by_date_invalid`,
 * `need_by_date_in_past`, `rush_requested_invalid`, `region_id_required`, `region_not_found`;
 * 404 `team_order_not_found` (also another customer's); 401 without sign-in.
 */
import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { bodyOf, customerIdOf, withRefusals } from "../../../../../lib/http/refusal"
import { createReorder } from "../../../../../workflows/team-order/linked-orders"

export const POST = withRefusals(async (req: MedusaRequest, res: MedusaResponse) => {
  res.status(201).json(await createReorder(req.scope, customerIdOf(req), req.params.id, bodyOf(req)))
})
