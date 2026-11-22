/**
 * The money lock of a team order: starting or completing a payment, marking one by hand, shipping,
 * going back to draft, pricing the order and the step that follows a payment never run at the same
 * time on one team order, on any number of server instances (decision 016).
 *
 * The same mechanism as the order's cash lock of decision 010 (workflows/cash-collection/
 * order-cash-lock.ts): a PostgreSQL advisory lock per team order, held in a transaction of its own
 * for as long as `fn` runs. `fn` uses its own connections (Medusa's workflows, the team-order
 * module); the lock's transaction only holds the lock. It ends with its transaction, also when the
 * process dies. A second request waits at most TEAM_ORDER_MONEY_LOCK_WAIT, then sees what the first
 * did (two "pay the deposit" requests pay once).
 */
import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

type Trx = { raw: (sql: string, bindings?: unknown[]) => Promise<unknown> }
type Knex = { transaction: <T>(run: (trx: Trx) => Promise<T>) => Promise<T> }

/** How long a request waits for another one on the same team order (PostgreSQL lock_timeout syntax). */
export const TEAM_ORDER_MONEY_LOCK_WAIT = "10s"

export function teamOrderMoneyLockKey(teamOrderId: string): string {
  return `fitmyoutfit:team-order-money:${teamOrderId}`
}

/** Thrown when the lock was not free within TEAM_ORDER_MONEY_LOCK_WAIT (`fn` did not run). */
export class TeamOrderMoneyBusy extends Error {
  constructor(teamOrderId: string) {
    super(`The money lock of team order ${teamOrderId} was held by another request for too long.`)
    this.name = "TeamOrderMoneyBusy"
  }
}

const isLockTimeout = (error: unknown): boolean => (error as { code?: unknown } | null)?.code === "55P03"

export async function withTeamOrderMoneyLock<T>(container: MedusaContainer, teamOrderId: string, fn: () => Promise<T>): Promise<T> {
  const knex = container.resolve(ContainerRegistrationKeys.PG_CONNECTION) as unknown as Knex
  return knex.transaction(async (trx) => {
    await trx.raw(`SET LOCAL lock_timeout = '${TEAM_ORDER_MONEY_LOCK_WAIT}'`)
    try {
      await trx.raw("SELECT pg_advisory_xact_lock(hashtextextended(?, 0))", [teamOrderMoneyLockKey(teamOrderId)])
    } catch (error) {
      if (isLockTimeout(error)) throw new TeamOrderMoneyBusy(teamOrderId)
      throw error
    }
    return fn()
  })
}
