import { model } from "@medusajs/framework/utils"
import { STEP_ACTORS, TEAM_ORDER_STATUSES } from "../constants"

/**
 * The record of one status step of a team order: who made it (the organizer, an admin user or the
 * system), from which status to which, and when (`created_at`). One row per step, never changed or
 * deleted. `step_name` is the flow's name for the step (lib/rules/team-order-status.ts), or
 * `balance_received_by_hand` for the admin's note that the balance arrived (a record with no status
 * change: `from_status` and `to_status` are the same). `actor_id` is the customer id of the organizer
 * or the user id of the admin; null for the system. `by_hand` marks a payment step an admin made by
 * hand because payments do not exist yet.
 */
export const TeamOrderStep = model
  .define("team_order_step", {
    id: model.id({ prefix: "tostep" }).primaryKey(),
    team_order_id: model.text(),
    step_name: model.text(),
    from_status: model.enum([...TEAM_ORDER_STATUSES]),
    to_status: model.enum([...TEAM_ORDER_STATUSES]),
    actor: model.enum([...STEP_ACTORS]),
    actor_id: model.text().nullable(),
    by_hand: model.boolean().default(false),
  })
  .indexes([{ on: ["team_order_id"] }])
