/**
 * POST /admin/design-requests/:id/status   `{ "status": "in_progress" }` moves the request along
 * (forward one step, back one step, or `done` reopened to `in_progress`: lib/rules/design-request.ts)
 * and records who did it. The first move to `in_progress` makes the admin user the one working on
 * it, when nobody is. Answers 200 with the same body as GET /admin/design-requests/:id.
 * Refusals: 400 `status_invalid`, `status_not_allowed` (`from`, `to`, `allowed`); 404
 * `design_request_not_found`; 409 `request_changed` (another change got there first).
 */
import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { bodyOf, Refusal, withRefusals } from "../../../../../lib/http/refusal"
import { changeDesignRequestStatus } from "../../../../../workflows/design-request/design-requests"

export const POST = withRefusals(async (req, res: MedusaResponse) => {
  const actorId = (req as AuthenticatedMedusaRequest).auth_context?.actor_id
  if (!actorId) throw new Refusal(401, "not_allowed", "unauthorized", "Sign in as an admin user.")
  res.status(200).json(await changeDesignRequestStatus(req.scope, req.params.id, bodyOf(req).status, actorId))
})
