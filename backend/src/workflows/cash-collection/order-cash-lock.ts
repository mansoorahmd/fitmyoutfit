/**
 * The order's cash lock: "mark cash as collected" and Medusa's order cancel never run at the same
 * time on one order, on any number of server instances (QA's thirteenth review, B1).
 *
 * Why: Medusa's cancelOrderWorkflow reads the order's payments once, at its start, and then, in
 * steps of their own, cancels each payment it saw without a capture and refunds what it saw
 * captured, and only at its end marks the order canceled. A press that captured in between was
 * either canceled with its capture (2250 captured, nothing refunded) or refunded only in part. The
 * row locks at the insert (./record-cash-collection.ts) cannot prevent that: the cancel holds no
 * lock across its steps.
 *
 * How: a PostgreSQL advisory lock per order (pg_advisory_xact_lock on a key made from the order
 * id), held in a transaction of its own for as long as the press runs (check, capture, record) or
 * the cancel request runs (api/middlewares.ts, before POST /admin/orders/:id/cancel). The other
 * waits, at most ORDER_CASH_LOCK_WAIT, and then sees what the first did: a cancel after a press
 * refunds the captured cash ("Collected, then canceled and refunded"); a press after a cancel is
 * refused ("This order is canceled"). The lock lives in the database, so it holds across server
 * instances and without Redis; it ends with its transaction, also when the process dies (the
 * connection closes). It holds one database connection while it is held.
 *
 * Not covered: a cancel run without that route (cancelOrderWorkflow called by other code; none in
 * this project). For that case the panel's rule still tells the truth ("Canceled, cash still held",
 * lib/rules/cash-collection.ts).
 */
import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

type Trx = { raw: (sql: string, bindings?: unknown[]) => Promise<unknown> }
type Knex = { transaction: <T>(run: (trx: Trx) => Promise<T>) => Promise<T> }

/** How long a press or a cancel waits for the other (PostgreSQL lock_timeout syntax). */
export const ORDER_CASH_LOCK_WAIT = "10s"

/** The lock's key, one per order; hashed by PostgreSQL to the 64-bit advisory lock key. */
export function orderCashLockKey(orderId: string): string {
  return `fitmyoutfit:order-cash:${orderId}`
}

/** Thrown when the lock was not free within ORDER_CASH_LOCK_WAIT. */
export class OrderCashLockBusy extends Error {
  constructor(orderId: string) {
    super(`The cash lock of order ${orderId} was held by another request for too long.`)
    this.name = "OrderCashLockBusy"
  }
}

/** PostgreSQL's "lock_not_available" (lock_timeout ran out). */
function isLockTimeout(error: unknown): boolean {
  return (error as { code?: unknown } | null)?.code === "55P03"
}

/**
 * Runs `fn` while holding the order's cash lock. `fn` uses its own connections (Medusa's
 * workflows); the lock's transaction only holds the lock. Throws OrderCashLockBusy when the lock
 * was not free in time (`fn` then did not run); an error of `fn` is passed on, and the lock is
 * released either way.
 */
export async function withOrderCashLock<T>(
  container: MedusaContainer,
  orderId: string,
  fn: () => Promise<T>
): Promise<T> {
  const knex = container.resolve(ContainerRegistrationKeys.PG_CONNECTION) as unknown as Knex
  return knex.transaction(async (trx) => {
    await trx.raw(`SET LOCAL lock_timeout = '${ORDER_CASH_LOCK_WAIT}'`)
    try {
      await trx.raw("SELECT pg_advisory_xact_lock(hashtextextended(?, 0))", [orderCashLockKey(orderId)])
    } catch (error) {
      if (isLockTimeout(error)) {
        throw new OrderCashLockBusy(orderId)
      }
      throw error
    }
    return fn()
  })
}
