/**
 * Data migration (QA's tenth review, M1): orders recorded as collected before 12 Nov keep
 * `cod_slip_reference`, `cod_collected_at` and `cod_collected_by` in their metadata, which a
 * signed-in customer's `GET /store/orders` returns. This creates each such order's cash-collection
 * record from the keys (if it has none) and removes every `cod_` key
 * (workflows/cash-collection/move-legacy-cod-metadata.ts).
 *
 * A Medusa migration script: `medusa db:migrate` runs every script in this folder once per
 * database and keeps a row for it in `script_migrations`, so it runs during `npm run setup` and
 * at deploy, after the schema migrations (the `cash_collection` table exists by then). The work
 * itself is safe to repeat, so a run interrupted half-way is simply run again by the next migrate.
 */
import type { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { moveLegacyCodMetadata } from "../workflows/cash-collection/move-legacy-cod-metadata"

export default async function moveCodMetadataToCashCollection({ container }: ExecArgs): Promise<void> {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const result = await moveLegacyCodMetadata(container)
  logger.info(
    `Cash collection: ${result.orders} order(s) had cod_ keys in their metadata; ` +
      `${result.recordsCreated} record(s) created, the keys removed.`
  )
  if (result.withoutSlip.length > 0) {
    logger.warn(
      `Cash collection: these orders had cod_ keys but no slip reference, so nothing was recorded ` +
        `for them (the keys are removed): ${result.withoutSlip.join(", ")}`
    )
  }
}
