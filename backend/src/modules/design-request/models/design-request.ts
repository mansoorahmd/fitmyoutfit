import { model } from "@medusajs/framework/utils"
import { DESIGN_REQUEST_STATUSES } from "../constants"

/**
 * One request for free design help, as a team sent it (the store form is open to a visitor with no
 * account). Everything the requester typed is untrusted text: it is stored cleaned (the rules in
 * lib/rules/design-request.ts) and shown as text, never as HTML. `reference` is the short code the
 * requester is given. `email_key` is the address in lower case, for the limit per address and for
 * looking requests up; `ip_hash` is a salted hash of the requester's network address (never the
 * address itself), for the limit per address. `customer_id` is set when a signed-in customer made the
 * request. `staff_notes` and `assigned_to` (an admin user id) are for staff only and never reach a
 * store answer. Every status change is a row of `design_request_step`.
 */
export const DesignRequest = model
  .define("design_request", {
    id: model.id({ prefix: "dreq" }).primaryKey(),
    reference: model.text(),
    team_name: model.text(),
    contact_name: model.text(),
    email: model.text(),
    email_key: model.text(),
    phone: model.text().nullable(),
    product: model.text().nullable(),
    pieces: model.number().nullable(),
    need_by_date: model.text().nullable(),
    region: model.text(),
    message: model.text(),
    reference_links: model.array().default([]),
    customer_id: model.text().nullable(),
    status: model.enum([...DESIGN_REQUEST_STATUSES]).default("new"),
    staff_notes: model.text().nullable(),
    assigned_to: model.text().nullable(),
    ip_hash: model.text().nullable(),
  })
  .indexes([
    { on: ["reference"], unique: true },
    { on: ["status"] },
    { on: ["email_key"] },
    { on: ["ip_hash"] },
    { on: ["customer_id"] },
    { on: ["created_at"] },
  ])
