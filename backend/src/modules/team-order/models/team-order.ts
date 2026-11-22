import { model } from "@medusajs/framework/utils"
import { TEAM_ORDER_STATUSES } from "../constants"

/**
 * A team order: an organizer's order for a team, with its team list (roster-entry.ts).
 *
 * `customer_id` is the organizer (the Medusa customer); routes show a team order only to them.
 * `design_id` and `design_version_id` name the saved design version the kit is made from, and
 * `product_id` the Medusa product, `region_id` the Medusa region (its `min_garment_quantity`
 * is the minimum). `prints_name` and `prints_number` say which fields the design prints, read
 * from the design version when the order is made: they decide what the team list must hold.
 * `need_by_date` is a calendar date (YYYY-MM-DD) kept as given; nothing is scheduled from it yet.
 *
 * `list_version` counts the saves of the team list, from 1. A save names the version it was made
 * from and is refused when the list has moved on, so two tabs cannot overwrite each other.
 */
export const TeamOrder = model
  .define("team_order", {
    id: model.id({ prefix: "teamord" }).primaryKey(),
    customer_id: model.text(),
    team_name: model.text(),
    design_id: model.text(),
    design_version_id: model.text(),
    product_id: model.text(),
    region_id: model.text(),
    need_by_date: model.text().nullable(),
    status: model.enum([...TEAM_ORDER_STATUSES]).default("draft"),
    prints_name: model.boolean(),
    prints_number: model.boolean(),
    list_version: model.number().default(1),
  })
  .indexes([{ on: ["customer_id"] }])
