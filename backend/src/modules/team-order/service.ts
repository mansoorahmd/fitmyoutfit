import type { Context } from "@medusajs/framework/types"
import { InjectTransactionManager, MedusaContext, MedusaService } from "@medusajs/framework/utils"
import { ProofApproval } from "./models/proof-approval"
import { RosterEntry } from "./models/roster-entry"
import { TeamOrder } from "./models/team-order"
import { TeamOrderEmail } from "./models/team-order-email"
import { TeamOrderStep } from "./models/team-order-step"
import { buildStepRecord, balanceNoteRecord, type StepRecord } from "../../lib/rules/team-order-steps"
import type { Actor, TeamOrderStatus } from "../../lib/rules/team-order-status"

/**
 * Thrown by `replaceRoster` when the list is no longer at the version the save was made from, or
 * the team order is no longer a draft (a proof was made).
 */
export class RosterVersionStale extends Error {
  constructor(readonly teamOrderId: string, readonly expectedVersion: number) {
    super(`The team list of ${teamOrderId} is no longer at version ${expectedVersion}, or is no longer a draft.`)
    this.name = "RosterVersionStale"
  }
}

/** Thrown by `noteBalance` when the balance was already marked as received. */
export class BalanceAlreadyNoted extends Error {
  constructor(readonly teamOrderId: string) {
    super(`The balance of ${teamOrderId} was already marked as received.`)
    this.name = "BalanceAlreadyNoted"
  }
}

/** Who makes a step, for the record of steps. */
export type StepBy = { actor: Actor; actorId: string | null }

/**
 * Thrown by the writes below when the team order is no longer in the state the request was made
 * from (its status, list version, name, design version, need-by date or rush choice moved since it
 * was read), or when another request got there first. Nothing was written. The caller reads the
 * order again and answers with the refusal that fits what it finds now.
 */
export class TeamOrderChanged extends Error {
  constructor(readonly teamOrderId: string, readonly what: string) {
    super(`Team order ${teamOrderId} changed while ${what}.`)
    this.name = "TeamOrderChanged"
  }
}

type Rows = { id: string }[]
type Connection = { execute: (sql: string, params: unknown[]) => Promise<Rows> }
type RawConnection = { execute: (sql: string, params: unknown[], method: "all", ctx: unknown) => Promise<Rows> }
type TransactionManager = { getConnection: () => RawConnection; getTransactionContext?: () => unknown }

/**
 * The transaction's connection, for the writes that must check a state and change it in one
 * statement: the generated update by selector reads rows first and writes them after, which two
 * requests can interleave. `update ... where <state> returning id` takes the row lock and checks
 * the state in the same step; a second request waits for the first to commit, then matches no row.
 */
function connectionOf(sharedContext: Context): Connection {
  const manager = sharedContext.transactionManager as unknown as TransactionManager
  const connection = manager.getConnection()
  // The transaction is passed on, so these statements run inside it: with the generated writes of
  // the same method they commit or roll back together, and the row locks they take last until then.
  const transaction = manager.getTransactionContext?.()
  return { execute: (sql, params) => connection.execute(sql, params, "all", transaction) }
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
 * Medusa's generated data service for team orders, roster entries and proofs, and the writes that
 * must be atomic: saving a team list as a whole, and the steps of the status flow.
 */
class TeamOrderModuleService extends MedusaService({ TeamOrder, RosterEntry, ProofApproval, TeamOrderStep, TeamOrderEmail }) {
  /** Stores the record of a step, in the transaction that made the step. */
  private async recordStep(teamOrderId: string, record: StepRecord, sharedContext: Context): Promise<void> {
    await this.createTeamOrderSteps(
      {
        team_order_id: teamOrderId,
        step_name: record.stepName,
        from_status: record.from,
        to_status: record.to,
        actor: record.actor,
        actor_id: record.actorId,
        by_hand: record.byHand,
      },
      sharedContext
    )
  }

  /** The record of a flow step by `by`; a record the flow does not allow is a programming error. */
  private stepRecordFor(from: TeamOrderStatus, to: TeamOrderStatus, by: StepBy, byHand = false): StepRecord {
    const built = buildStepRecord({ from, to, actor: by.actor, actorId: by.actorId, byHand })
    if (!built.ok) {
      throw new Error(`Not a recorded step: ${from} -> ${to} by ${by.actor} (${built.problem}).`)
    }
    return built.record
  }

  /**
   * Replaces all the lines of a team order and moves its `list_version` from `expectedVersion` to
   * the next number, in one database transaction. The version moves first, with a condition on
   * the old value and on the status (an UPDATE ... WHERE list_version = expected AND status =
   * 'draft', one statement), so of two saves made from the same version one finds no row to update
   * and throws `RosterVersionStale`; nothing is written then. A team order that is no longer a draft
   * (a proof was made) matches no row either: its list is frozen. A save that fails halfway rolls
   * back, so the list is never left empty or half-new. Returns the new version.
   */
  @InjectTransactionManager()
  async replaceRoster(
    input: { teamOrderId: string; expectedVersion: number; productId: string; lines: RosterEntryInput[] },
    @MedusaContext() sharedContext: Context = {}
  ): Promise<number> {
    const { teamOrderId, expectedVersion } = input
    const moved = await connectionOf(sharedContext).execute(
      "update team_order set list_version = ?, updated_at = now() where id = ? and list_version = ? and status = 'draft' and deleted_at is null returning id",
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
        })),
        sharedContext
      )
    }
    return expectedVersion + 1
  }

  /**
   * Makes a proof: the team order moves `draft -> proof_sent` only if it is still a draft at the
   * list version, team name and design version the snapshot was made from, and the proof is
   * stored with the next proof number, in one transaction. Throws `TeamOrderChanged` otherwise
   * (two requests at the same moment: one makes the proof, the other finds the order moved).
   */
  @InjectTransactionManager()
  async makeProof(
    input: {
      teamOrderId: string
      from: { listVersion: number; teamName: string; designVersionId: string }
      snapshotText: string
      snapshotHash: string
      by: StepBy
    },
    @MedusaContext() sharedContext: Context = {}
  ): Promise<{ id: string; proof_number: number }> {
    const { teamOrderId, from } = input
    const connection = connectionOf(sharedContext)
    const moved = await connection.execute(
      "update team_order set status = 'proof_sent', updated_at = now() where id = ? and status = 'draft' and list_version = ? and team_name = ? and design_version_id = ? and deleted_at is null returning id",
      [teamOrderId, from.listVersion, from.teamName, from.designVersionId]
    )
    if (moved.length === 0) {
      throw new TeamOrderChanged(teamOrderId, "the proof was made")
    }
    // The row lock taken above serialises the numbering: no other proof of this order is made now.
    const last = (await connection.execute(
      "select coalesce(max(proof_number), 0) as id from proof_approval where team_order_id = ?",
      [teamOrderId]
    )) as unknown as { id: number | string }[]
    const proofNumber = Number(last[0]?.id ?? 0) + 1
    const created = (await this.createProofApprovals(
      {
        team_order_id: teamOrderId,
        proof_number: proofNumber,
        status: "sent",
        design_version_id: from.designVersionId,
        list_version: from.listVersion,
        snapshot_text: input.snapshotText,
        snapshot_hash: input.snapshotHash,
      },
      sharedContext
    )) as { id: string }
    await this.recordStep(teamOrderId, this.stepRecordFor("draft", "proof_sent", input.by), sharedContext)
    return { id: created.id, proof_number: proofNumber }
  }

  /**
   * Goes back to draft: `proof_sent -> draft` (the proof becomes `withdrawn`) or `approved ->
   * draft` (the signed proof becomes `replaced`). Throws `TeamOrderChanged` when the order is not
   * in `from` any more. The proof is kept.
   */
  @InjectTransactionManager()
  async backToDraft(
    input: { teamOrderId: string; from: "proof_sent" | "approved"; by: StepBy },
    @MedusaContext() sharedContext: Context = {}
  ): Promise<void> {
    const { teamOrderId, from } = input
    const connection = connectionOf(sharedContext)
    const moved = await connection.execute(
      "update team_order set status = 'draft', updated_at = now() where id = ? and status = ? and deleted_at is null returning id",
      [teamOrderId, from]
    )
    if (moved.length === 0) {
      throw new TeamOrderChanged(teamOrderId, "it was taken back to draft")
    }
    const [closed, was] = from === "proof_sent" ? ["withdrawn", "sent"] : ["replaced", "signed"]
    await connection.execute(
      "update proof_approval set status = ?, closed_at = now(), updated_at = now() where team_order_id = ? and status = ? returning id",
      [closed, teamOrderId, was]
    )
    await this.recordStep(teamOrderId, this.stepRecordFor(from, "draft", input.by), sharedContext)
  }

  /**
   * Signs the current proof: the team order moves `proof_sent -> approved` and the proof (still
   * `sent`, with this hash) becomes `signed` with who, when, the address and the schedule at that
   * moment, in one transaction. The order is moved only if its need-by date and rush choice are
   * still what the organizer was shown. Of two signatures at the same moment one finds no row to
   * move and throws `TeamOrderChanged` (the caller then reads the signed proof and answers with it).
   */
  @InjectTransactionManager()
  async signProof(
    input: {
      teamOrderId: string
      proofId: string
      snapshotHash: string
      customerId: string
      signedName: string
      ip: string | null
      scheduleState: string
      needByDate: string | null
      rush: boolean
      promisedDeliveryDate: string
      by: StepBy
    },
    @MedusaContext() sharedContext: Context = {}
  ): Promise<void> {
    const connection = connectionOf(sharedContext)
    const moved = await connection.execute(
      "update team_order set status = 'approved', updated_at = now() where id = ? and status = 'proof_sent' and need_by_date is not distinct from ? and rush_requested = ? and deleted_at is null returning id",
      [input.teamOrderId, input.needByDate, input.rush]
    )
    if (moved.length === 0) {
      throw new TeamOrderChanged(input.teamOrderId, "the proof was signed")
    }
    const signed = await connection.execute(
      "update proof_approval set status = 'signed', signed_by_customer_id = ?, signed_name = ?, signed_at = now(), signed_ip = ?, schedule_state = ?, need_by_date = ?, rush = ?, promised_delivery_date = ?, updated_at = now() where id = ? and team_order_id = ? and status = 'sent' and snapshot_hash = ? and deleted_at is null returning id",
      [
        input.customerId,
        input.signedName,
        input.ip,
        input.scheduleState,
        input.needByDate,
        input.rush,
        input.promisedDeliveryDate,
        input.proofId,
        input.teamOrderId,
        input.snapshotHash,
      ]
    )
    if (signed.length === 0) {
      throw new TeamOrderChanged(input.teamOrderId, "the proof was signed")
    }
    await this.recordStep(input.teamOrderId, this.stepRecordFor("proof_sent", "approved", input.by), sharedContext)
  }

  /**
   * A step of the admin: `from -> to` only if the order is still in `from` (one conditional
   * statement), recorded in the same transaction. `byHand` marks the deposit as received by hand.
   * Throws `TeamOrderChanged` when the order is no longer in `from`.
   */
  @InjectTransactionManager()
  async adminStep(
    input: { teamOrderId: string; from: TeamOrderStatus; to: TeamOrderStatus; adminId: string; byHand: boolean },
    @MedusaContext() sharedContext: Context = {}
  ): Promise<void> {
    const record = this.stepRecordFor(input.from, input.to, { actor: "admin", actorId: input.adminId }, input.byHand)
    const moved = await connectionOf(sharedContext).execute(
      "update team_order set status = ?, updated_at = now() where id = ? and status = ? and deleted_at is null returning id",
      [input.to, input.teamOrderId, input.from]
    )
    if (moved.length === 0) {
      throw new TeamOrderChanged(input.teamOrderId, `it moved to ${input.to}`)
    }
    await this.recordStep(input.teamOrderId, record, sharedContext)
  }

  /**
   * The admin marks the balance as received by hand: a record on an order that is `balance_due`,
   * once. The status does not change. Throws `TeamOrderChanged` when the order is not `balance_due`
   * and `BalanceAlreadyNoted` when it was marked already (the order's row is locked meanwhile, so two
   * presses make one record).
   */
  @InjectTransactionManager()
  async noteBalance(
    input: { teamOrderId: string; adminId: string },
    @MedusaContext() sharedContext: Context = {}
  ): Promise<void> {
    const connection = connectionOf(sharedContext)
    const locked = await connection.execute(
      "select id from team_order where id = ? and status = 'balance_due' and deleted_at is null for update",
      [input.teamOrderId]
    )
    if (locked.length === 0) {
      throw new TeamOrderChanged(input.teamOrderId, "the balance was marked")
    }
    const record = balanceNoteRecord(input.adminId)
    const existing = await connection.execute(
      "select id from team_order_step where team_order_id = ? and step_name = ? and deleted_at is null limit 1",
      [input.teamOrderId, record.stepName]
    )
    if (existing.length > 0) {
      throw new BalanceAlreadyNoted(input.teamOrderId)
    }
    await this.recordStep(input.teamOrderId, record, sharedContext)
  }

  /**
   * Claims an email: stores its row (status `pending`) unless a row with this `dedupe_key` exists
   * already. Returns the new row's id, or null when the key was taken (another request, or an
   * earlier run of the job, has it). The unique index makes two claims at the same moment give one row.
   */
  async claimEmail(input: {
    teamOrderId: string
    kind: string
    dedupeKey: string
    payload: Record<string, unknown>
  }): Promise<string | null> {
    const taken = async () =>
      ((await this.listTeamOrderEmails({ dedupe_key: input.dedupeKey }, { select: ["id"] })) as Rows).length > 0
    if (await taken()) return null
    try {
      const created = (await this.createTeamOrderEmails({
        team_order_id: input.teamOrderId,
        kind: input.kind as never,
        dedupe_key: input.dedupeKey,
        payload: input.payload,
        status: "pending",
        attempts: 0,
      })) as { id: string }
      return created.id
    } catch (error) {
      // Lost the race on the unique index: the other claim owns the email.
      if (await taken()) return null
      throw error
    }
  }

  /**
   * Changes the team name and/or the design version (with what the design prints), only while the
   * team order is a draft; throws `TeamOrderChanged` otherwise.
   */
  @InjectTransactionManager()
  async updateWhileDraft(
    input: {
      teamOrderId: string
      teamName?: string
      design?: { designVersionId: string; printsName: boolean; printsNumber: boolean }
    },
    @MedusaContext() sharedContext: Context = {}
  ): Promise<void> {
    const sets: string[] = []
    const params: unknown[] = []
    if (input.teamName !== undefined) {
      sets.push("team_name = ?")
      params.push(input.teamName)
    }
    if (input.design) {
      sets.push("design_version_id = ?", "prints_name = ?", "prints_number = ?")
      params.push(input.design.designVersionId, input.design.printsName, input.design.printsNumber)
    }
    if (sets.length === 0) return
    const moved = await connectionOf(sharedContext).execute(
      `update team_order set ${sets.join(", ")}, updated_at = now() where id = ? and status = 'draft' and deleted_at is null returning id`,
      [...params, input.teamOrderId]
    )
    if (moved.length === 0) {
      throw new TeamOrderChanged(input.teamOrderId, "it was changed")
    }
  }

  /**
   * Sets the need-by date and/or the rush choice, only while the team order is a draft or has a
   * proof out; throws `TeamOrderChanged` otherwise. `needByDate: null` clears the date.
   */
  @InjectTransactionManager()
  async updateSchedule(
    input: { teamOrderId: string; needByDate?: string | null; rushRequested?: boolean },
    @MedusaContext() sharedContext: Context = {}
  ): Promise<void> {
    const sets: string[] = []
    const params: unknown[] = []
    if (input.needByDate !== undefined) {
      sets.push("need_by_date = ?")
      params.push(input.needByDate)
    }
    if (input.rushRequested !== undefined) {
      sets.push("rush_requested = ?")
      params.push(input.rushRequested)
    }
    if (sets.length === 0) return
    const moved = await connectionOf(sharedContext).execute(
      `update team_order set ${sets.join(", ")}, updated_at = now() where id = ? and status in ('draft', 'proof_sent') and deleted_at is null returning id`,
      [...params, input.teamOrderId]
    )
    if (moved.length === 0) {
      throw new TeamOrderChanged(input.teamOrderId, "its schedule was changed")
    }
  }
}

export default TeamOrderModuleService
