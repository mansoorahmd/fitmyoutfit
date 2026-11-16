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
 * What to move is decided by lib/rules/order-metadata.ts (legacyCashCollectionPlan), from the keys
 * and the order's payments (QA's thirteenth review, B2): a record is created only for an order
 * whose cash-on-delivery payment is fully captured; any other slip is dropped and listed in the
 * result (`dropped`, with the reason), and a slip that differs from the record the table already
 * has is listed too (`differing`), for the script to log. Deleted orders are moved too, so
 * restoring one brings no `cod_` keys back; their payments are read straight from the tables
 * (Query leaves deleted orders out).
 *
 * A deliberate coupling to Medusa's tables `order`, `order_payment_collection`, `payment`,
 * `capture` and `refund`: check them on every Medusa upgrade (decision 010).
 */
import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, generateEntityId } from "@medusajs/framework/utils"
import type { CollectionPayment } from "../../lib/rules/cash-collection"
import {
  legacyCashCollectionPlan,
  STAFF_ONLY_KEY_PREFIX,
  type LegacySlipDropReason,
} from "../../lib/rules/order-metadata"

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
  /** Slips not recorded because of the order's payment (keys removed), with the reason. */
  dropped: { order_id: string; slip_reference: string; reason: LegacySlipDropReason }[]
  /** Slips that differ from the record the table already has for the order (the table's is kept). */
  differing: { order_id: string; slip_reference: string; kept: string }[]
}

/** The order's payments (also of a deleted order), as the rule reads them. */
async function paymentsOf(knex: Knex, orderId: string): Promise<CollectionPayment[]> {
  const { rows = [] } = await knex.raw(
    `SELECT p.id, p.provider_id, p.amount::text AS amount, p.captured_at, p.canceled_at,
            (SELECT coalesce(json_agg(c.amount::text), '[]'::json) FROM capture c
              WHERE c.payment_id = p.id AND c.deleted_at IS NULL) AS captures,
            (SELECT coalesce(json_agg(r.amount::text), '[]'::json) FROM refund r
              WHERE r.payment_id = p.id AND r.deleted_at IS NULL) AS refunds
       FROM order_payment_collection opc
       JOIN payment p ON p.payment_collection_id = opc.payment_collection_id
      WHERE opc.order_id = ? AND p.deleted_at IS NULL
      ORDER BY p.id`,
    [orderId]
  )
  return rows.map((row) => ({
    id: String(row.id),
    provider_id: String(row.provider_id ?? ""),
    amount: String(row.amount ?? "0"),
    captured_at: row.captured_at ? new Date(String(row.captured_at)).toISOString() : null,
    canceled: row.canceled_at !== null && row.canceled_at !== undefined,
    captures: ((row.captures as string[] | null) ?? []).map((amount) => ({ amount, created_by: null, created_at: null })),
    refunds: (row.refunds as string[] | null) ?? [],
  }))
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
  const result: LegacyMoveResult = { orders: rows.length, recordsCreated: 0, withoutSlip: [], dropped: [], differing: [] }
  for (const row of rows) {
    const orderId = row.id as string
    const plan = legacyCashCollectionPlan(row.metadata, await paymentsOf(knex, orderId))
    if (plan.record) {
      const inserted = await knex.raw(
        `INSERT INTO cash_collection (id, order_id, slip_reference, collected_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT (order_id) WHERE deleted_at IS NULL DO NOTHING
         RETURNING id`,
        [generateEntityId(undefined, "cashcol"), orderId, plan.record.slip_reference, plan.record.collected_at ?? now]
      )
      const created = (inserted.rows ?? []).length
      result.recordsCreated += created
      if (created === 0) {
        const existing = (
          await knex.raw(`SELECT slip_reference FROM cash_collection WHERE order_id = ? AND deleted_at IS NULL`, [orderId])
        ).rows?.[0]
        const kept = String(existing?.slip_reference ?? "")
        if (kept !== plan.record.slip_reference) {
          result.differing.push({ order_id: orderId, slip_reference: plan.record.slip_reference, kept })
        }
      }
    } else if (plan.dropped) {
      result.dropped.push({ order_id: orderId, ...plan.dropped })
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
