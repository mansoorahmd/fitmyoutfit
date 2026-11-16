/**
 * The record of "cash collected", inserted only if the order and the payment still allow it at that
 * very moment (QA's tenth review, M2: a cancel racing "mark collected" ended with both answering
 * 200 and a record on a canceled, refunded order).
 *
 * One database transaction:
 * 1. lock the order's row and the payment's row (SELECT ... FOR UPDATE). Medusa's cancel writes the
 *    order's row (its status) and cancels or refunds the payment; Medusa's refund locks the
 *    payment's row the same way before it inserts the refund (payment module, refundPayment_). So
 *    each of them either finished before these locks were taken, and is seen in step 2, or waits
 *    until this transaction ends, and happens after the record (the panel then says so: "Collected,
 *    then canceled and refunded");
 * 2. read the order's status, the payment's cancel time, its captures and its refunds, and ask the
 *    rule (recordRefusalAtInsert in lib/rules/cash-collection.ts): on a canceled order or payment
 *    the record is made only while cash is still held for it (QA's thirteenth review, B1);
 * 3. insert the record; the unique index on the order (among rows not deleted) lets one insert
 *    win on any number of server instances, and a second one inserts nothing ("already
 *    recorded").
 *
 * A deliberate coupling to Medusa's tables: `order` (id, status, deleted_at), `payment` (id,
 * canceled_at, deleted_at), `capture` and `refund` (payment_id, amount, deleted_at), and to our own module's table
 * `cash_collection`. Check them on every Medusa upgrade (decision 010).
 */
import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, generateEntityId } from "@medusajs/framework/utils"
import { recordRefusalAtInsert, type CashCollectionRefusal } from "../../lib/rules/cash-collection"

type Row = Record<string, unknown>
type Trx = { raw: (sql: string, bindings?: unknown[]) => Promise<{ rows?: Row[] }> }
type Knex = { transaction: <T>(run: (trx: Trx) => Promise<T>) => Promise<T> }

export type RecordOutcome = "recorded" | CashCollectionRefusal | "order_not_found"

/** The id prefix of the cash-collection model (modules/cash-collection/models/cash-collection.ts). */
const RECORD_ID_PREFIX = "cashcol"

export async function insertCashCollectionRecord(
  container: MedusaContainer,
  input: { orderId: string; paymentId: string; slipReference: string; collectedAt: Date }
): Promise<RecordOutcome> {
  const knex = container.resolve(ContainerRegistrationKeys.PG_CONNECTION) as unknown as Knex
  return knex.transaction(async (trx) => {
    // Wait at most a few seconds for a cancel or refund that holds a row; failing is answered as
    // a record that could not be saved (the capture stays, staff press again).
    await trx.raw("SET LOCAL lock_timeout = '5s'")
    const order = (
      await trx.raw(`SELECT status FROM "order" WHERE id = ? AND deleted_at IS NULL FOR UPDATE`, [input.orderId])
    ).rows?.[0]
    if (!order) {
      return "order_not_found"
    }
    const payment = (
      await trx.raw(`SELECT canceled_at FROM payment WHERE id = ? AND deleted_at IS NULL FOR UPDATE`, [
        input.paymentId,
      ])
    ).rows?.[0]
    // Exact sums (numeric, as text): what is captured and what refunded decide, on a canceled order
    // or payment, whether cash is still held for it.
    const money = (
      await trx.raw(
        `SELECT (SELECT coalesce(sum(amount), 0)::text FROM capture WHERE payment_id = ? AND deleted_at IS NULL) AS captured,
                (SELECT coalesce(sum(amount), 0)::text FROM refund WHERE payment_id = ? AND deleted_at IS NULL) AS refunded,
                (SELECT count(*)::int FROM refund WHERE payment_id = ? AND deleted_at IS NULL) AS refunds`,
        [input.paymentId, input.paymentId, input.paymentId]
      )
    ).rows?.[0]
    const refusal = recordRefusalAtInsert({
      orderStatus: (order.status as string | null) ?? null,
      // A payment that is gone is passed as null: the rule counts it as canceled, nothing held.
      payment: payment
        ? {
            canceled: payment.canceled_at !== null,
            captured: String(money?.captured ?? "0"),
            refunded: String(money?.refunded ?? "0"),
            refunds: Number(money?.refunds ?? 0),
          }
        : null,
    })
    if (refusal) {
      return refusal
    }
    const inserted = await trx.raw(
      `INSERT INTO cash_collection (id, order_id, slip_reference, collected_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT (order_id) WHERE deleted_at IS NULL DO NOTHING
       RETURNING id`,
      [generateEntityId(undefined, RECORD_ID_PREFIX), input.orderId, input.slipReference, input.collectedAt]
    )
    return (inserted.rows ?? []).length > 0 ? "recorded" : "already_recorded"
  })
}
