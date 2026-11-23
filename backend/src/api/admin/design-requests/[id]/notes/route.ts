/**
 * POST /admin/design-requests/:id/notes   `{ "staff_notes": "..." }` sets the staff notes (an empty
 * text clears them). Staff only: notes are never in a store answer. Answers 200 with the same body
 * as GET /admin/design-requests/:id. Refusals: 400 `staff_notes_invalid`; 404 `design_request_not_found`.
 */
import type { MedusaResponse } from "@medusajs/framework/http"
import { bodyOf, withRefusals } from "../../../../../lib/http/refusal"
import { setStaffNotes } from "../../../../../workflows/design-request/design-requests"

export const POST = withRefusals(async (req, res: MedusaResponse) => {
  res.status(200).json(await setStaffNotes(req.scope, req.params.id, bodyOf(req).staff_notes))
})
