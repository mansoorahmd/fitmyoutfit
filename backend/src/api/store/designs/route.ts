/**
 * POST /store/designs   saves a new design with its first version.
 * GET  /store/designs   lists the signed-in customer's own designs.
 *
 * Body of POST: `{ name?, product_id, design }`. `design` is the design JSON as the editor made
 * it, a JSON object with a whole-number `schemaVersion`, at most 1,000,000 bytes as JSON (the
 * editor's full schema is not checked here). `product_id` is the Medusa product it is for.
 * Answers 201 `{ design, version }` (the version without its JSON); GET answers 200
 * `{ designs, count }`, newest first. Customer sign-in is required (401 without). Refusals: 400
 * with `code` design_not_an_object, design_schema_version, design_too_large, design_name_invalid,
 * product_id_required, product_not_found, product_not_designable.
 */
import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { bodyOf, customerIdOf, withRefusals } from "../../../lib/http/refusal"
import { createDesign, listOwnDesigns } from "../../../workflows/design/designs"

export const POST = withRefusals(async (req: MedusaRequest, res: MedusaResponse) => {
  const saved = await createDesign(req.scope, customerIdOf(req), bodyOf(req))
  res.status(201).json(saved)
})

export const GET = withRefusals(async (req: MedusaRequest, res: MedusaResponse) => {
  const designs = await listOwnDesigns(req.scope, customerIdOf(req))
  res.status(200).json({ designs, count: designs.length })
})
