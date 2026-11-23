/**
 * POST /admin/design-requests/:id/assign   `{ "assign": true }` makes the admin user the one working
 * on the request; `{ "assign": false }` lets it go. Answers 200 with the same body as
 * GET /admin/design-requests/:id. Refusals: 400 `assign_invalid`; 404 `design_request_not_found`.
 */
import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { bodyOf, Refusal, withRefusals } from "../../../../../lib/http/refusal"
import { setAssignment } from "../../../../../workflows/design-request/design-requests"

export const POST = withRefusals(async (req, res: MedusaResponse) => {
  const actorId = (req as AuthenticatedMedusaRequest).auth_context?.actor_id
  if (!actorId) throw new Refusal(401, "not_allowed", "unauthorized", "Sign in as an admin user.")
  res.status(200).json(await setAssignment(req.scope, req.params.id, bodyOf(req).assign, actorId))
})
