/**
 * GET /admin/design-requests   the design-help queue for staff (the admin's "Design requests" list):
 *   newest first, `?status=new|in_progress|proof_sent|done`, `?limit=` (1 to 100, default 20),
 *   `?offset=`. Answers `{ design_requests, count, limit, offset, counts, new_count }`: each row has
 *   the request's short fields (not the message), `counts` per status over the whole queue and
 *   `new_count` (the number of `new` ones). Refusals: 400 `status_invalid`, `paging_invalid`.
 * Admin routes need a signed-in admin user; Medusa checks that before this handler runs.
 */
import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { withRefusals } from "../../../lib/http/refusal"
import { listDesignRequestsForStaff } from "../../../workflows/design-request/design-requests"

export const GET = withRefusals(async (req: MedusaRequest, res: MedusaResponse) => {
  res.status(200).json(await listDesignRequestsForStaff(req.scope, req.query as Record<string, unknown>))
})
