/**
 * Data migration (QA's tenth review, M1): orders recorded as collected before 12 Nov keep
 * `cod_slip_reference`, `cod_collected_at` and `cod_collected_by` in their metadata, which a
 * signed-in customer's `GET /store/orders` returns. This creates each such order's cash-collection
 * record from the keys (if it has none, and only when its cash-on-delivery payment is fully
 * captured) and removes every `cod_` key (workflows/cash-collection/move-legacy-cod-metadata.ts).
 * Every slip not recorded, and every slip that differs from the table's record, is logged with
 * its order id.
 *
 * A Medusa migration script: `medusa db:migrate` runs every script in this folder once per
 * database and keeps a row for it in `script_migrations`, so it runs during `npm run setup` and
 * at deploy, after the schema migrations (the `cash_collection` table exists by then). The work
 * itself is safe to repeat, so a run interrupted half-way is simply run again by the next migrate.
 */
import type { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import type { LegacySlipDropReason } from "../lib/rules/order-metadata"
import { moveLegacyCodMetadata } from "../workflows/cash-collection/move-legacy-cod-metadata"

const DROP_REASONS: Record<LegacySlipDropReason, string> = {
  not_cash_on_delivery: "the order is not paid by cash on delivery",
  not_fully_captured: "its cash-on-delivery payment is not fully captured (capture it in the order's Payments section and record the slip in the Cash on delivery panel)",
  several_payments: "it has several open cash-on-delivery payments",
}

export default async function moveCodMetadataToCashCollection({ container }: ExecArgs): Promise<void> {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const result = await moveLegacyCodMetadata(container)
  logger.info(
    `Cash collection: ${result.orders} order(s) had cod_ keys in their metadata; ` +
      `${result.recordsCreated} record(s) created, the keys removed.`
  )
  // QA's thirteenth review, B2: nothing is dropped silently. Development databases only (orders
  // recorded before 12 Nov); the slip references are staff's own entries, logged for staff.
  for (const { order_id, slip_reference, reason } of result.dropped) {
    logger.warn(
      `Cash collection: order ${order_id} had the slip reference ${JSON.stringify(slip_reference)} in its ` +
        `metadata, but ${DROP_REASONS[reason]}, so it was not recorded (the keys are removed).`
    )
  }
  for (const { order_id, slip_reference, kept } of result.differing) {
    logger.warn(
      `Cash collection: order ${order_id} had the slip reference ${JSON.stringify(slip_reference)} in its ` +
        `metadata, but the table already records ${JSON.stringify(kept)} for it; the table's is kept (the keys are removed).`
    )
  }
  if (result.withoutSlip.length > 0) {
    logger.warn(
      `Cash collection: these orders had cod_ keys but no slip reference, so nothing was recorded ` +
        `for them (the keys are removed): ${result.withoutSlip.join(", ")}`
    )
  }
}
