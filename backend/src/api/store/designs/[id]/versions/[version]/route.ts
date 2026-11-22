/**
 * GET /store/designs/:id/versions/:version   one version, with the design JSON as saved
 * (`version.design`). `:version` is the version's number (1, 2, ...). Answers 200 `{ version }`;
 * another customer's design, or an unknown design or version, is 404.
 */
import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { customerIdOf, withRefusals } from "../../../../../../lib/http/refusal"
import { readOwnVersion } from "../../../../../../workflows/design/designs"

export const GET = withRefusals(async (req: MedusaRequest, res: MedusaResponse) => {
  res.status(200).json(await readOwnVersion(req.scope, customerIdOf(req), req.params.id, req.params.version))
})
