/**
 * GET /store/designs/:id   one of the customer's own designs with the list of its versions (the
 * versions without their JSON, oldest first). Answers 200 `{ design, versions }`; another
 * customer's design, or an unknown id, is 404 `design_not_found`.
 */
import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { customerIdOf, withRefusals } from "../../../../lib/http/refusal"
import { readOwnDesign } from "../../../../workflows/design/designs"

export const GET = withRefusals(async (req: MedusaRequest, res: MedusaResponse) => {
  res.status(200).json(await readOwnDesign(req.scope, customerIdOf(req), req.params.id))
})
