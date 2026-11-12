import { model } from "@medusajs/framework/utils"

/**
 * One order's cash-collection record: the courier's slip reference and when staff recorded it.
 *
 * `order_id` is unique (among rows that are not soft-deleted), so the database keeps at most one
 * record per order, on any number of server instances: a second insert for the same order fails.
 * The row lives in this module's own table, so Medusa's saves of the order (which write the
 * order's metadata as a whole) cannot touch it, and a customer's order routes never return it.
 * Who captured the payment is Medusa's own capture record, not kept here.
 */
export const CashCollection = model.define("cash_collection", {
  id: model.id({ prefix: "cashcol" }).primaryKey(),
  order_id: model.text().unique(),
  slip_reference: model.text(),
  collected_at: model.dateTime(),
})
