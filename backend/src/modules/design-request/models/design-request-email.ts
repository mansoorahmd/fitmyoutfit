import { model } from "@medusajs/framework/utils"
import { DESIGN_REQUEST_EMAIL_KINDS } from "../constants"

/**
 * What the store sent, or tried to send, to a requester. One row per email, made BEFORE the send is
 * tried: `dedupe_key` is unique, so an email that has a row is never made twice (the record is in the
 * database, not in memory). `status`: `pending` (claimed, send not finished), `sent`, `failed` (the
 * send threw). `last_error` is the name of the error only. The row holds no address and no text.
 */
export const DesignRequestEmail = model
  .define("design_request_email", {
    id: model.id({ prefix: "dreqmail" }).primaryKey(),
    design_request_id: model.text(),
    kind: model.enum([...DESIGN_REQUEST_EMAIL_KINDS]),
    dedupe_key: model.text(),
    status: model.enum(["pending", "sent", "failed"]).default("pending"),
    attempts: model.number().default(0),
    last_error: model.text().nullable(),
    last_attempt_at: model.dateTime().nullable(),
    sent_at: model.dateTime().nullable(),
  })
  .indexes([{ on: ["dedupe_key"], unique: true }, { on: ["design_request_id"] }])
