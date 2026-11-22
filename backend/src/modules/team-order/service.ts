import type { Context } from "@medusajs/framework/types"
import { InjectTransactionManager, MedusaContext, MedusaService } from "@medusajs/framework/utils"
import { RosterEntry } from "./models/roster-entry"
import { TeamOrder } from "./models/team-order"

/** Thrown by `replaceRoster` when the list is no longer at the version the save was made from. */
export class RosterVersionStale extends Error {
  constructor(readonly teamOrderId: string, readonly expectedVersion: number) {
    super(`The team list of ${teamOrderId} is no longer at version ${expectedVersion}.`)
    this.name = "RosterVersionStale"
  }
}

/** One line to store: already cleaned, never judged. */
export type RosterEntryInput = {
  line_id: string
  name: string
  number: string
  size: string
  count: number
  no_name: boolean
  no_number: boolean
}

/**
 * Medusa's generated data service for team orders and roster entries, and the one write that
 * must be atomic: saving a team list as a whole.
 */
class TeamOrderModuleService extends MedusaService({ TeamOrder, RosterEntry }) {
  /**
   * Replaces all the lines of a team order and moves its `list_version` from `expectedVersion` to
   * the next number, in one database transaction. The version moves first, with a condition on
   * the old value (an UPDATE ... WHERE list_version = expected, one statement), so of two saves made from the same
   * version one finds no row to update and throws `RosterVersionStale`; nothing is written then.
   * A save that fails halfway rolls back, so the list is never left empty or half-new. Returns the
   * new version.
   */
  @InjectTransactionManager()
  async replaceRoster(
    input: { teamOrderId: string; expectedVersion: number; productId: string; lines: RosterEntryInput[] },
    @MedusaContext() sharedContext: Context = {}
  ): Promise<number> {
    const { teamOrderId, expectedVersion } = input
    // Raw SQL on purpose: the generated update by selector reads the rows first and writes them
    // after, which two saves can interleave. This one statement takes the row lock and checks the
    // version in the same step; the second save waits for the first to commit, then matches no row.
    const manager = sharedContext.transactionManager as unknown as {
      getConnection: () => { execute: (sql: string, params: unknown[]) => Promise<{ id: string }[]> }
    }
    const moved = await manager
      .getConnection()
      .execute(
        "update team_order set list_version = ?, updated_at = now() where id = ? and list_version = ? and deleted_at is null returning id",
        [expectedVersion + 1, teamOrderId, expectedVersion]
      )
    if (moved.length === 0) {
      throw new RosterVersionStale(teamOrderId, expectedVersion)
    }
    await this.deleteRosterEntries({ team_order_id: teamOrderId }, sharedContext)
    if (input.lines.length > 0) {
      await this.createRosterEntries(
        input.lines.map((line, position) => ({
          ...line,
          team_order_id: teamOrderId,
          position,
          product_id: input.productId,
          locked: false,
        })),
        sharedContext
      )
    }
    return expectedVersion + 1
  }
}

export default TeamOrderModuleService
