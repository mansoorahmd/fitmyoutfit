/**
 * Medusa glue: writes single keys of an order's `metadata` atomically, in one SQL statement each.
 *
 * Why not the order module's updateOrders: it saves the metadata as a whole, so two writers at
 * once (the order-placed subscriber and the promise route, or two staff presses on two server
 * instances) read the same metadata and the later save silently drops the other's key. Each
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
 * Adds `patch` to the order's metadata only while `guardKey` holds no text (missing, null, not a
 * string, or blank). Returns false when it already holds text, or the order does not exist.
 */
export async function addOrderMetadataUnlessSet(
  container: MedusaContainer,
  orderId: string,
  guardKey: string,
  patch: Record<string, unknown>
): Promise<boolean> {
  const result = await knexOf(container).raw(
    `UPDATE "order"
        SET metadata = COALESCE(metadata, '{}'::jsonb) || CAST(? AS jsonb),
            updated_at = now()
      WHERE id = ?
        AND deleted_at IS NULL
        AND (jsonb_typeof(metadata -> CAST(? AS text)) IS DISTINCT FROM 'string'
             OR btrim(metadata ->> CAST(? AS text)) = '')
      RETURNING id`,
    [JSON.stringify(patch), orderId, guardKey, guardKey]
  )
  return changed(result)
}
