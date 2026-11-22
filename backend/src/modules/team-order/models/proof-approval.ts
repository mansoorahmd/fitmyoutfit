import { model } from "@medusajs/framework/utils"
import { PROOF_STATUSES } from "../constants"

/**
 * A roster proof of a team order: one row per proof ever made, so a proof that was made and not
 * signed, or signed and later replaced, stays on record (nothing here is ever deleted).
 *
 * `proof_number` counts up within the team order (1, 2, ...). `status`: `sent` (made, not signed),
 * `signed`, `withdrawn` (it was sent and the organizer went back to draft), `replaced` (it was
 * signed and the organizer went back to draft before paying). At most one proof of a team order is
 * `sent` or `signed` at a time: the one the order's status (`proof_sent`, `approved`, ...) refers to.
 *
 * The snapshot is `snapshot_text`, the canonical JSON text of @fitmyoutfit/team-rules
 * (`hashSnapshot`), and `snapshot_hash` its SHA-256. `design_version_id` and `list_version` say what
 * the proof was made from. The `signed_*` columns are set when the organizer signs: who
 * (`signed_by_customer_id` and the name as typed), when, and the request's address (`signed_ip`:
 * personal data, never shown in an API answer and never logged); with the schedule as the
 * organizer saw it (`schedule_state`, `need_by_date`, `rush`) and the delivery date promised then.
 * `closed_at` is when it was withdrawn or replaced.
 */
export const ProofApproval = model
  .define("proof_approval", {
    id: model.id({ prefix: "proof" }).primaryKey(),
    team_order_id: model.text(),
    proof_number: model.number(),
    status: model.enum([...PROOF_STATUSES]).default("sent"),
    design_version_id: model.text(),
    list_version: model.number(),
    snapshot_text: model.text(),
    snapshot_hash: model.text(),
    signed_by_customer_id: model.text().nullable(),
    signed_name: model.text().nullable(),
    signed_at: model.dateTime().nullable(),
    signed_ip: model.text().nullable(),
    schedule_state: model.text().nullable(),
    need_by_date: model.text().nullable(),
    rush: model.boolean().nullable(),
    promised_delivery_date: model.text().nullable(),
    closed_at: model.dateTime().nullable(),
    // The money of the proof (decision 016): the Medusa order priced for it (a draft order while the
    // proof is out, an order from signing on), the two payment collections made at signing, and the
    // deposit share they were split with. Set once each; never changed after.
    order_id: model.text().nullable(),
    deposit_collection_id: model.text().nullable(),
    balance_collection_id: model.text().nullable(),
    deposit_percentage: model.float().nullable(),
  })
  .indexes([
    { on: ["team_order_id", "proof_number"], unique: true },
    { on: ["order_id"] },
    { on: ["deposit_collection_id"] },
    { on: ["balance_collection_id"] },
  ])
