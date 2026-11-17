/**
 * The reset token's lock (lib/rules/reset-token-lock.ts says why): a PostgreSQL advisory lock per
 * token, held in a transaction of its own while a password update with that token runs, the same
 * way as the order's cash lock (workflows/cash-collection/order-cash-lock.ts). It lives in the
 * database, so it holds across server instances and without Redis, and ends with its transaction,
 * also when the process dies. It holds one database connection while it is held.
 */
import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

type Trx = { raw: (sql: string, bindings?: unknown[]) => Promise<unknown> }
type Knex = { transaction: <T>(run: (trx: Trx) => Promise<T>) => Promise<T> }

/** How long a second update with the same token waits (PostgreSQL lock_timeout syntax). */
export const RESET_TOKEN_LOCK_WAIT = "10s"

/** Thrown when the lock was not free within RESET_TOKEN_LOCK_WAIT. */
export class ResetTokenLockBusy extends Error {
  constructor() {
    super("The reset token's lock was held by another request for too long.")
    this.name = "ResetTokenLockBusy"
  }
}

/**
 * Runs `fn` while holding the lock `key` (resetTokenLockKey). Throws ResetTokenLockBusy when the
 * lock was not free in time (`fn` then did not run); an error of `fn` is passed on, and the lock
 * is released either way.
 */
export async function withResetTokenLock<T>(
  container: MedusaContainer,
  key: string,
  fn: () => Promise<T>
): Promise<T> {
  const knex = container.resolve(ContainerRegistrationKeys.PG_CONNECTION) as unknown as Knex
  return knex.transaction(async (trx) => {
    await trx.raw(`SET LOCAL lock_timeout = '${RESET_TOKEN_LOCK_WAIT}'`)
    try {
      await trx.raw("SELECT pg_advisory_xact_lock(hashtextextended(?, 0))", [key])
    } catch (error) {
      if ((error as { code?: unknown } | null)?.code === "55P03") {
        throw new ResetTokenLockBusy()
      }
      throw error
    }
    return fn()
  })
}
