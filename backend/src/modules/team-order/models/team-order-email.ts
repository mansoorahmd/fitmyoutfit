import { model } from "@medusajs/framework/utils"
import { TEAM_ORDER_EMAIL_KINDS } from "../constants"

/**
 * What the store sent, or tried to send, to an organizer about a team order. One row per email,
 * made BEFORE the send is tried: `dedupe_key` is unique, so an email that has a row is never made
 * twice, also when the reminder job runs twice or the server restarts (the record is in the
 * database, not in memory). `status`: `pending` (claimed, send not finished), `sent`, `failed`
 * (the send threw; the job tries again, up to a limit). `payload` is what the text is made from
 * (team name, proof number, dates; never an email address, a signature or an IP address).
 * `last_error` is the name of the error only.
 */
export const TeamOrderEmail = model
  .define("team_order_email", {
    id: model.id({ prefix: "toemail" }).primaryKey(),
    team_order_id: model.text(),
    kind: model.enum([...TEAM_ORDER_EMAIL_KINDS]),
    dedupe_key: model.text(),
    status: model.enum(["pending", "sent", "failed"]).default("pending"),
    attempts: model.number().default(0),
    payload: model.json(),
    last_error: model.text().nullable(),
    last_attempt_at: model.dateTime().nullable(),
    sent_at: model.dateTime().nullable(),
  })
  .indexes([
    { on: ["dedupe_key"], unique: true },
    { on: ["team_order_id"] },
    { on: ["status"] },
  ])
