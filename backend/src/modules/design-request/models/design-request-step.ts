import { model } from "@medusajs/framework/utils"
import { DESIGN_REQUEST_STATUSES } from "../constants"

/**
 * The record of one status change of a design request: from which status to which, by which admin
 * user (`actor_id`), and when (`created_at`). One row per change, never changed or deleted.
 */
export const DesignRequestStep = model
  .define("design_request_step", {
    id: model.id({ prefix: "dreqstep" }).primaryKey(),
    design_request_id: model.text(),
    from_status: model.enum([...DESIGN_REQUEST_STATUSES]),
    to_status: model.enum([...DESIGN_REQUEST_STATUSES]),
    actor_id: model.text(),
  })
  .indexes([{ on: ["design_request_id"] }])
