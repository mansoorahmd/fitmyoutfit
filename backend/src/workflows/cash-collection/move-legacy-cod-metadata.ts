/**
 * Moves what orders recorded as collected before 12 Nov (S1-1c) kept in their metadata
 * (`cod_slip_reference`, `cod_collected_at`, `cod_collected_by`) into the cash-collection table,
 * and removes every `cod_` key from those orders' metadata, so a customer's `GET /store/orders` no
 * longer returns them (QA's tenth review, M1).
 *
 * Run by the migration script migration-scripts/move-cod-metadata-to-cash-collection.ts, which
 * Medusa runs once per database during `medusa db:migrate` (so during `npm run setup` and at
 * deploy). Safe to run again: for each order, the record is created only if the order has none
 * (the unique index decides, ON CONFLICT DO NOTHING), and then the keys are removed; an order
 * whose keys are gone is not read again. An interrupted run leaves each order either untouched,
 * with its record and its keys, or done.
 *
 * What to move is decided by lib/rules/order-metadata.ts (legacyCashCollectionPlan). Deleted
 * orders are moved too, so restoring one brings no `cod_` keys back.
 */
import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, generateEntityId } from "@medusajs/framework/utils"
import { legacyCashCollectionPlan, STAFF_ONLY_KEY_PREFIX } from "../../lib/rules/order-metadata"

type Knex = {
  raw: (sql: string, bindings?: unknown[]) => Promise<{ rows?: Record<string, unknown>[] }>
}

export type LegacyMoveResult = {
  /** Orders that had `cod_` keys. */
  orders: number
  /** Records created from the keys (an order that had one already keeps it). */
  recordsCreated: number
  /** Orders whose keys held no slip reference: their keys are removed, nothing is recorded. */
  withoutSlip: string[]
}

export async function moveLegacyCodMetadata(container: MedusaContainer, now: Date = new Date()): Promise<LegacyMoveResult> {
  const knex = container.resolve(ContainerRegistrationKeys.PG_CONNECTION) as unknown as Knex
  const prefix = [STAFF_ONLY_KEY_PREFIX.length, STAFF_ONLY_KEY_PREFIX]
  const { rows = [] } = await knex.raw(
    `SELECT id, metadata FROM "order"
      WHERE jsonb_typeof(metadata) = 'object'
        AND EXISTS (SELECT 1 FROM jsonb_object_keys(metadata) AS k WHERE left(k, ?) = ?)
      ORDER BY id`,
    prefix
  )
  const result: LegacyMoveResult = { orders: rows.length, recordsCreated: 0, withoutSlip: [] }
  for (const row of rows) {
    const orderId = row.id as string
    const plan = legacyCashCollectionPlan(row.metadata)
    if (plan.record) {
      const inserted = await knex.raw(
        `INSERT INTO cash_collection (id, order_id, slip_reference, collected_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT (order_id) WHERE deleted_at IS NULL DO NOTHING
         RETURNING id`,
        [generateEntityId(undefined, "cashcol"), orderId, plan.record.slip_reference, plan.record.collected_at ?? now]
      )
      result.recordsCreated += (inserted.rows ?? []).length
    } else {
      result.withoutSlip.push(orderId)
    }
    // Only after the record is safe. The keys are read again from the row in the same statement,
    // so a key written meanwhile by someone else is kept unless it is a `cod_` key.
    await knex.raw(
      `UPDATE "order"
          SET metadata = metadata - ARRAY(SELECT k FROM jsonb_object_keys(metadata) AS k WHERE left(k, ?) = ?),
              updated_at = now()
        WHERE id = ? AND jsonb_typeof(metadata) = 'object'`,
      [...prefix, orderId]
    )
  }
  return result
}
