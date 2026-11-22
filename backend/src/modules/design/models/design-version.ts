import { model } from "@medusajs/framework/utils"

/**
 * One saved version of a design. Every save creates a row; no row is ever updated or deleted by
 * the routes, so a proof or a team order can refer to a version for good.
 *
 * `version` counts from 1 inside the design; the database keeps (design_id, version) unique, so
 * two saves at the same moment cannot take the same number. `data` is the design JSON exactly as
 * the editor produced it (lib/rules/design-input.ts says what is checked), `schema_version` is a
 * copy of its `schemaVersion`, and `product_id` is the Medusa product the design is for.
 */
export const DesignVersion = model
  .define("design_version", {
    id: model.id({ prefix: "desver" }).primaryKey(),
    design_id: model.text(),
    version: model.number(),
    product_id: model.text(),
    schema_version: model.number(),
    data: model.json(),
  })
  .indexes([
    { on: ["design_id", "version"], unique: true },
    { on: ["product_id"] },
  ])
