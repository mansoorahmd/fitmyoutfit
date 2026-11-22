import { model } from "@medusajs/framework/utils"

/**
 * A saved design: the name and owner. What was designed is in its versions (design-version.ts);
 * a design never holds the JSON itself, and nothing about a design is ever overwritten by a save.
 *
 * `customer_id` is the Medusa customer who owns it. Routes show a design only to its owner.
 */
export const Design = model
  .define("design", {
    id: model.id({ prefix: "design" }).primaryKey(),
    customer_id: model.text(),
    name: model.text(),
  })
  .indexes([{ on: ["customer_id"] }])
