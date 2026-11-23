/**
 * GET /admin/design-requests/:id   one request for staff: everything the requester sent (as text:
 * the admin shows it as text, never as HTML, and shows the links as text, not live links), the
 * staff notes and who works on it, the record of status changes (`steps`: who, from, to, when), the
 * statuses that may follow (`allowed_next`), and the customer and their team orders when the request
 * came from a signed-in customer. 404 `design_request_not_found`.
 */
import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { withRefusals } from "../../../../lib/http/refusal"
import { designRequestForStaff } from "../../../../workflows/design-request/design-requests"

export const GET = withRefusals(async (req: MedusaRequest, res: MedusaResponse) => {
  res.status(200).json(await designRequestForStaff(req.scope, req.params.id))
})
