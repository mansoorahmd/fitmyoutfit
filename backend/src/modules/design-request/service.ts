import type { Context } from "@medusajs/framework/types"
import { InjectTransactionManager, MedusaContext, MedusaService } from "@medusajs/framework/utils"
import { DesignRequest } from "./models/design-request"
import { DesignRequestEmail } from "./models/design-request-email"
import { DesignRequestStep } from "./models/design-request-step"
import {
  DESIGN_REQUEST_RATE_LIMITS,
  withinRateLimits,
  type DesignRequestInput,
  type DesignRequestStatus,
} from "../../lib/rules/design-request"
import { protectStatementValues } from "../../lib/rules/statement-privacy"

/** Thrown by `changeStatus` when the request is no longer in the status the change was made from. Nothing was written. */
export class DesignRequestChanged extends Error {
  constructor(readonly designRequestId: string) {
    super(`Design request ${designRequestId} changed while its status was being changed.`)
    this.name = "DesignRequestChanged"
  }
}

type Rows = Record<string, unknown>[]
type Connection = { execute: (sql: string, params: unknown[]) => Promise<Rows> }
type RawConnection = { execute: (sql: string, params: unknown[], method: "all", ctx: unknown) => Promise<Rows> }
type TransactionManager = { getConnection: () => RawConnection; getTransactionContext?: () => unknown }

/** The transaction's connection, for statements that check a state and change it in one step. */
function connectionOf(sharedContext: Context): Connection {
  const manager = sharedContext.transactionManager as unknown as TransactionManager
  const connection = manager.getConnection()
  const transaction = manager.getTransactionContext?.()
  return { execute: (sql, params) => connection.execute(sql, params, "all", transaction) }
}

export type NewRequest = {
  reference: string
  input: DesignRequestInput
  emailKey: string
  customerId: string | null
  /** A salted hash of the requester's address, or null when it is unknown. */
  ipHash: string | null
}

export type CreateOutcome = { ok: true; id: string } | { ok: false; reason: "rate_limited" }

/**
 * Medusa's generated data service for design requests, their steps and their emails, and the writes
 * that must be atomic: making a request under the limits, and a status change.
 */
class DesignRequestModuleService extends MedusaService({ DesignRequest, DesignRequestStep, DesignRequestEmail }) {
  /**
   * Stores a request if the limits allow another one, in one transaction. The limits (per address,
   * per email address, overall: lib/rules/design-request.ts) are counted over the requests stored
   * in their window. The transaction first takes an advisory lock per address and per email (in a
   * fixed order, so two requests never wait on each other in a circle): two requests at the same
   * moment from one address or for one email are counted one after the other, so the limit holds.
   * Returns `rate_limited` and writes nothing when a limit is reached.
   */
  @InjectTransactionManager()
  async createUnderLimits(
    request: NewRequest,
    @MedusaContext() sharedContext: Context = {}
  ): Promise<CreateOutcome> {
    const connection = connectionOf(sharedContext)
    const locks = [
      ...(request.ipHash ? [`fitmyoutfit:design-request:address:${request.ipHash}`] : []),
      `fitmyoutfit:design-request:email:${request.emailKey}`,
    ].sort()
    for (const key of locks) {
      await connection.execute("select pg_advisory_xact_lock(hashtextextended(?, 0))", [key])
    }
    const count = async (where: string, value: string | null, minutes: number): Promise<number> => {
      const rows = await connection.execute(
        `select count(*)::int as n from design_request where ${where} and created_at > now() - make_interval(mins => ?) and deleted_at is null`,
        [...(value === null ? [] : [value]), minutes]
      )
      return Number(rows[0]?.n ?? 0)
    }
    const { perAddress, perEmail, overall } = DESIGN_REQUEST_RATE_LIMITS
    const counts = {
      address: request.ipHash === null ? null : await count("ip_hash = ?", request.ipHash, perAddress.windowMinutes),
      email: await count("email_key = ?", request.emailKey, perEmail.windowMinutes),
      overall: await count("true", null, overall.windowMinutes),
    }
    if (!withinRateLimits(counts)) {
      return { ok: false, reason: "rate_limited" }
    }
    const { input } = request
    const created = (await this.createDesignRequests(
      {
        reference: request.reference,
        team_name: input.teamName,
        contact_name: input.contactName,
        email: input.email,
        email_key: request.emailKey,
        phone: input.phone,
        product: input.product,
        pieces: input.pieces,
        need_by_date: input.needByDate,
        region: input.region,
        message: input.message,
        reference_links: input.referenceLinks,
        customer_id: request.customerId,
        status: "new",
        ip_hash: request.ipHash,
      },
      sharedContext
    )) as { id: string }
    return { ok: true, id: created.id }
  }

  /**
   * Moves a request from `from` to `to` and records who did it, in one transaction: the update
   * names the status it expects (`where status = from`), so of two changes made from the same status
   * one finds no row and throws `DesignRequestChanged`, and no step is written for it. When `assign`
   * is set and nobody is working on the request, the actor becomes who is working on it.
   */
  @InjectTransactionManager()
  async changeStatus(
    input: { id: string; from: DesignRequestStatus; to: DesignRequestStatus; actorId: string; assign: boolean },
    @MedusaContext() sharedContext: Context = {}
  ): Promise<void> {
    const moved = await connectionOf(sharedContext).execute(
      `update design_request set status = ?, assigned_to = case when ? and assigned_to is null then ? else assigned_to end, updated_at = now() where id = ? and status = ? and deleted_at is null returning id`,
      [input.to, input.assign, input.actorId, input.id, input.from]
    )
    if (moved.length === 0) {
      throw new DesignRequestChanged(input.id)
    }
    await this.createDesignRequestSteps(
      { design_request_id: input.id, from_status: input.from, to_status: input.to, actor_id: input.actorId },
      sharedContext
    )
  }

  /**
   * Claims an email once. Returns the new row's id, or null when the key was taken (another request
   * has it). The unique index makes two claims at the same moment give one row.
   */
  async claimEmail(input: { designRequestId: string; kind: "received"; dedupeKey: string }): Promise<string | null> {
    const taken = async () =>
      ((await this.listDesignRequestEmails({ dedupe_key: input.dedupeKey }, { select: ["id"] })) as unknown[]).length > 0
    if (await taken()) return null
    try {
      const created = (await this.createDesignRequestEmails({
        design_request_id: input.designRequestId,
        kind: input.kind,
        dedupe_key: input.dedupeKey,
        status: "pending",
        attempts: 0,
      })) as { id: string }
      return created.id
    } catch (error) {
      if (await taken()) return null
      throw error
    }
  }
}

// A failed statement's error carries no values (names, email addresses, what a team wrote) outside
// development and tests (lib/rules/statement-privacy.ts).
protectStatementValues(DesignRequestModuleService)

export default DesignRequestModuleService
