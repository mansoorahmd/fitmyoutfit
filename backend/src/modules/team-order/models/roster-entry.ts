import { model } from "@medusajs/framework/utils"

/**
 * One line of a team list: a player, or a spare shirt. The list is saved as a whole, so a save
 * replaces all the lines of the team order at once (service.ts, replaceRoster).
 *
 * `line_id` is the id the editor gave the line (or the server did, when it sent none); it stays
 * the same when the line is edited or moved. `position` is the place in the list, from 0.
 * `product_id` is the team order's product (copied, as dev-plan.md lists it). Values are stored
 * cleaned (@fitmyoutfit/team-rules normalizeLines) but never judged: a line with problems is saved
 * as it is, and its problems are worked out when the list is read. `locked` is for the proof (next part).
 */
export const RosterEntry = model
  .define("roster_entry", {
    id: model.id({ prefix: "rosent" }).primaryKey(),
    team_order_id: model.text(),
    line_id: model.text(),
    position: model.number(),
    product_id: model.text(),
    name: model.text().default(""),
    number: model.text().default(""),
    size: model.text().default(""),
    count: model.number().default(1),
    no_name: model.boolean().default(false),
    no_number: model.boolean().default(false),
    locked: model.boolean().default(false),
  })
  .indexes([{ on: ["team_order_id", "position"] }])
