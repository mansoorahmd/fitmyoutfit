import { model } from "@medusajs/framework/utils"

/**
 * One return of fit kits that staff refunded: how many kits, the amount (a decimal string, exact),
 * how it was refunded (`medusa`: through Medusa's refund workflow on `payment_id`; `by_hand`:
 * cash on delivery, no money moved by the store) and who pressed the button (`actor_id`, an admin
 * user id; `created_at` is when). One row per return, never changed or deleted. The amount is the
 * rule's (lib/rules/fit-kit-refund.ts), never a request's. A customer's order routes never return
 * this table.
 */
export const FitKitRefund = model
  .define("fit_kit_refund", {
    id: model.id({ prefix: "kitref" }).primaryKey(),
    order_id: model.text(),
    quantity: model.number(),
    amount: model.text(),
    currency_code: model.text(),
    method: model.enum(["medusa", "by_hand"]),
    payment_id: model.text().nullable(),
    actor_id: model.text(),
  })
  .indexes([{ on: ["order_id"] }])
