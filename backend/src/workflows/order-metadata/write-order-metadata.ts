/**
 * Medusa glue: writes single keys of an order's `metadata` atomically, in one SQL statement each.
 *
 * Used for the promised delivery date only (workflows/delivery-promise/). Cash collection is not
 * kept in metadata: Medusa's own order update (the admin's metadata editor) saves the metadata as
 * a whole and can drop a key written at the same moment, so it has a table of its own
 * (modules/cash-collection). The promise is safe here because it is written once, when the order
 * is placed, before anyone edits the order, and the read route writes it again if it is lost.
 *
 * Why not the order module's updateOrders: it saves the metadata as a whole, so two writers at
 * once (the order-placed subscriber and the promise route, on any number of server instances)
 * read the same metadata and the later save silently drops the other's key. The
 * statement below changes one key and only when the key still holds what the caller read
 * (compare-and-set). PostgreSQL locks the row for the UPDATE and re-checks the condition after a
 * concurrent writer commits, so exactly one of several writers succeeds, on any number of server
 * instances, without a lock in the application.
 *
 * Only `metadata` and `updated_at` change; the order module owns the table (`order`, Medusa
 * v2.22.6) and nothing else in it is touched. No business rule lives here.
 */
import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { STAFF_ONLY_KEY_PREFIX } from "../../lib/rules/order-metadata"

type Knex = {
  raw: (sql: string, bindings: unknown[]) => Promise<{ rows?: unknown[]; rowCount?: number }>
}

function knexOf(container: MedusaContainer): Knex {
  return container.resolve(ContainerRegistrationKeys.PG_CONNECTION) as unknown as Knex
}

function changed(result: { rows?: unknown[]; rowCount?: number }): boolean {
  return (result.rowCount ?? result.rows?.length ?? 0) > 0
}

/**
 * Sets `metadata[key]` to `next` only if it still holds `expected` (`undefined`: the key is
 * missing or the metadata is empty). Returns false when another writer changed it first, or the
 * order does not exist.
 */
export async function replaceOrderMetadataKey(
  container: MedusaContainer,
  orderId: string,
  key: string,
  expected: unknown,
  next: unknown
): Promise<boolean> {
  const result = await knexOf(container).raw(
    `UPDATE "order"
        SET metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), ARRAY[CAST(? AS text)], CAST(? AS jsonb), true),
            updated_at = now()
      WHERE id = ?
        AND deleted_at IS NULL
        AND (metadata -> CAST(? AS text)) IS NOT DISTINCT FROM CAST(? AS jsonb)
      RETURNING id`,
    [
      key,
      JSON.stringify(next ?? null),
      orderId,
      key,
      expected === undefined ? null : JSON.stringify(expected),
    ]
  )
  return changed(result)
}

/**
 * Removes every key starting with `cod_` (lib/rules/order-metadata.ts, isStaffOnlyKey) from the
 * order's metadata, in one statement: the keys to remove are read from the row as it is when
 * PostgreSQL has locked it, so a key another writer adds or changes at the same moment is kept.
 * Returns the removed keys (none when there were none or the order does not exist).
 */
export async function removeStaffOnlyOrderKeys(container: MedusaContainer, orderId: string): Promise<string[]> {
  const result = await knexOf(container).raw(
    `WITH target AS (
       SELECT id, ARRAY(SELECT k FROM jsonb_object_keys(metadata) AS k WHERE left(k, ?) = ?) AS keys
         FROM "order"
        WHERE id = ? AND deleted_at IS NULL AND jsonb_typeof(metadata) = 'object'
        FOR UPDATE
     )
     UPDATE "order" o
        SET metadata = o.metadata - target.keys,
            updated_at = now()
       FROM target
      WHERE o.id = target.id AND cardinality(target.keys) > 0
      RETURNING target.keys`,
    [STAFF_ONLY_KEY_PREFIX.length, STAFF_ONLY_KEY_PREFIX, orderId]
  )
  const row = (result.rows ?? [])[0] as { keys?: string[] } | undefined
  return row?.keys ?? []
}
