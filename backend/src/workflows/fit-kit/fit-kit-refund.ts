/**
 * Medusa glue of "Kit returned: refund the deposit": loads one order for the plain rule
 * (lib/rules/fit-kit-refund.ts), and carries out a decision. No business rule lives here: which
 * lines are kits, what is refundable, when, and how (through Medusa or by hand) are the rule's.
 *
 * A press runs three finished steps under the order's cash lock (the lock of decision 010, taken
 * by Medusa's order cancel route too, so a cancel and a refund never interleave; two presses at
 * once take turns, and the second finds the state moved):
 *
 * 1. Read the order and its record of returns; ask the rule. A refusal is a code (`Refusal`).
 * 2. Pay: through Medusa's own `refundPaymentWorkflow` on the payment the rule chose (the refund,
 *    the order's refund transaction and the `payment.refunded` event are Medusa's; the placeholder
 *    provider today, a real gateway later through the same call). The request carries an
 *    idempotency key made from the order and the kits' range, so a press repeated after the record
 *    failed never refunds twice. By hand (cash on delivery): nothing is moved.
 * 3. Record: one row (module fit-kit-refund) with the kits, the exact amount, the method and the
 *    admin user.
 *
 * If step 3 fails after step 2, the payment stays refunded; staff are told not to press again.
 * Errors that reach staff are `Refusal`s with a sentence; the underlying error is logged without
 * any customer data.
 */
import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { refundPaymentWorkflow } from "@medusajs/medusa/core-flows"
import { Refusal, conflict, notAllowed, notFound } from "../../lib/http/refusal"
import {
  decideKitRefund,
  kitRefundState,
  ORDER_BUSY_MESSAGE,
  ORDER_NOT_FOUND_MESSAGE,
  RECORD_FAILED_MESSAGE,
  REFUND_FAILED_MESSAGE,
  type KitRefundInput,
  type KitRefundState,
  type RefusalCode,
} from "../../lib/rules/fit-kit-refund"
import { readExact, sum, toDecimalString, ZERO, type Exact } from "../../lib/rules/exact-amount"
import { readReturnDays } from "../../lib/settings/fit-kit-refund"
import { FIT_KIT_REFUND_MODULE } from "../../modules/fit-kit-refund/constants"
import type FitKitRefundModuleService from "../../modules/fit-kit-refund/service"
import { OrderCashLockBusy, withOrderCashLock } from "../cash-collection/order-cash-lock"
import { currencyDigits } from "../rush/rush-cart"

type RawCapture = { amount?: unknown; raw_amount?: unknown } | null
type RawPayment = {
  id: string
  provider_id?: string | null
  canceled_at?: unknown
  captures?: RawCapture[] | null
  refunds?: RawCapture[] | null
} | null
type OrderRow = {
  id: string
  status?: string | null
  canceled_at?: unknown
  created_at?: unknown
  currency_code?: string | null
  total?: unknown
  items?: ({ id: string; quantity?: unknown; total?: unknown; product?: { metadata?: { kind?: unknown } | null } | null } | null)[] | null
  payment_collections?: ({ payments?: RawPayment[] | null } | null)[] | null
}

/**
 * A number Medusa hands out as its big-number class (an order line's quantity and totals) as the
 * plain number or decimal string it prints as; anything else is returned as it is.
 */
const plain = (value: unknown): unknown =>
  typeof value === "object" && value !== null && typeof (value as { toJSON?: unknown }).toJSON === "function"
    ? (value as { toJSON: () => unknown }).toJSON()
    : value

const iso = (value: unknown): string | null => {
  if (value === undefined || value === null) return null
  const date = value instanceof Date ? value : new Date(String(value))
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

/** The exact sum of captures or refunds: Medusa's exact figure (`raw_amount`), or the plain amount if that is missing. */
const sumOf = (rows: RawCapture[] | null | undefined): Exact =>
  sum((rows ?? []).flatMap((row) => (row ? [readExact(row.raw_amount ?? row.amount ?? 0) ?? ZERO] : [])))

/** A return as the record holds it. */
export type ReturnRecord = {
  id: string
  quantity: number
  amount: string
  currency_code: string
  method: "medusa" | "by_hand"
  payment_id: string | null
  actor_id: string
  created_at: string
}

export async function listReturns(container: MedusaContainer, orderId: string): Promise<ReturnRecord[]> {
  const service = container.resolve<FitKitRefundModuleService>(FIT_KIT_REFUND_MODULE)
  const rows = await service.listFitKitRefunds({ order_id: orderId }, { order: { created_at: "ASC" } })
  return rows.map((row) => ({
    id: row.id,
    quantity: Number(row.quantity),
    amount: String(row.amount),
    currency_code: row.currency_code,
    method: row.method as "medusa" | "by_hand",
    payment_id: row.payment_id ?? null,
    actor_id: row.actor_id,
    created_at: iso(row.created_at) ?? "",
  }))
}

export type LoadedKitOrder = {
  input: KitRefundInput
  currencyCode: string
  returns: ReturnRecord[]
}

/** The order, ready for the rule. Throws `Refusal` 404 for an unknown (or deleted) order. */
export async function loadKitOrder(container: MedusaContainer, orderId: string, now: Date = new Date()): Promise<LoadedKitOrder> {
  if (orderId.includes("\u0000")) {
    throw notFound("order_not_found", ORDER_NOT_FOUND_MESSAGE)
  }
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "order",
    fields: [
      "id",
      "status",
      "canceled_at",
      "created_at",
      "currency_code",
      "total",
      "items.id",
      "items.quantity",
      "items.total",
      "items.product.metadata",
      "payment_collections.payments.id",
      "payment_collections.payments.provider_id",
      "payment_collections.payments.canceled_at",
      "payment_collections.payments.captures.amount",
      "payment_collections.payments.captures.raw_amount",
      "payment_collections.payments.refunds.amount",
      "payment_collections.payments.refunds.raw_amount",
    ],
    filters: { id: orderId },
  })
  const order = (data as unknown as OrderRow[])[0]
  if (!order) {
    throw notFound("order_not_found", ORDER_NOT_FOUND_MESSAGE)
  }
  const { data: stores } = await query.graph({ entity: "store", fields: ["metadata"] })
  const settings = (stores as unknown as { metadata?: Record<string, unknown> | null }[])[0]?.metadata
  const returnDays = readReturnDays(settings)
  const currencyCode = order.currency_code ?? ""
  const returns = await listReturns(container, orderId)
  const payments = (order.payment_collections ?? [])
    .flatMap((collection) => collection?.payments ?? [])
    .flatMap((payment) => (payment ? [payment] : []))
  return {
    currencyCode,
    returns,
    input: {
      orderStatus: order.status,
      orderCanceledAt: iso(order.canceled_at),
      currencyDigits: await currencyDigits(container, currencyCode),
      orderTotal: plain(order.total) as never,
      lines: (order.items ?? []).flatMap((item) =>
        item ? [{ id: item.id, kind: item.product?.metadata?.kind, quantity: plain(item.quantity), total: plain(item.total) as never }] : []
      ),
      payments: payments.map((payment) => ({
        id: payment.id,
        provider_id: payment.provider_id ?? "",
        canceled: Boolean(payment.canceled_at),
        captured: sumOf(payment.captures),
        refunded: sumOf(payment.refunds),
      })),
      prior: returns.map((r) => ({ quantity: r.quantity, amount: r.amount })),
      orderCreatedAt: iso(order.created_at),
      now,
      returnDays: returnDays.ok ? returnDays.value : 0,
    },
  }
}

export async function loadKitState(container: MedusaContainer, orderId: string): Promise<{ state: KitRefundState; returns: ReturnRecord[]; currencyCode: string; currencyDigits: number }> {
  const loaded = await loadKitOrder(container, orderId)
  return {
    state: kitRefundState(loaded.input),
    returns: loaded.returns,
    currencyCode: loaded.currencyCode,
    currencyDigits: loaded.input.currencyDigits,
  }
}

function logFailure(container: MedusaContainer, what: string, orderId: string, error: unknown): void {
  container.resolve(ContainerRegistrationKeys.LOGGER).error(`Fit kit refund, order ${orderId}: ${what}: ${(error as Error)?.name ?? "Error"}`)
}

export type RefundKitsInput = {
  order_id: string
  /** As sent by staff; checked by the rule. */
  quantity: unknown
  /** The admin user pressing the button. */
  recorded_by: string
}

export type RefundKitsResult = { quantity: number; amount: number; method: "medusa" | "by_hand" }

/** Refunds a return of kits, under the order's lock. Throws `Refusal`. */
export async function refundKits(container: MedusaContainer, input: RefundKitsInput): Promise<RefundKitsResult> {
  try {
    return await withOrderCashLock(container, input.order_id, () => refundUnderLock(container, input))
  } catch (error) {
    if (error instanceof OrderCashLockBusy) {
      throw conflict("order_busy", ORDER_BUSY_MESSAGE)
    }
    throw error
  }
}

async function refundUnderLock(container: MedusaContainer, input: RefundKitsInput): Promise<RefundKitsResult> {
  const orderId = input.order_id
  // 1. The check.
  const loaded = await loadKitOrder(container, orderId)
  const decision = decideKitRefund(loaded.input, input.quantity)
  if (!decision.ok) {
    throw notAllowed(decision.code satisfies RefusalCode, decision.message)
  }
  const before = loaded.returns.reduce((count, r) => count + r.quantity, 0)

  // 2. The money, through Medusa's own workflow (nothing moves by hand).
  if (decision.method === "medusa") {
    const { errors } = await refundPaymentWorkflow(container).run({
      input: {
        payment_id: decision.paymentId,
        amount: decision.amount,
        created_by: input.recorded_by,
        note: "Fit kit returned",
        idempotency_key: `fit-kit:${orderId}:${before}-${before + decision.quantity}`,
      },
      throwOnError: false,
    })
    if (errors?.length) {
      logFailure(container, "the refund failed", orderId, errors[0]?.error)
      throw new Refusal(500, "not_allowed", "refund_failed", REFUND_FAILED_MESSAGE)
    }
  }

  // 3. The record.
  try {
    await container.resolve<FitKitRefundModuleService>(FIT_KIT_REFUND_MODULE).createFitKitRefunds({
      order_id: orderId,
      quantity: decision.quantity,
      amount: toDecimalString(decision.amountExact),
      currency_code: loaded.currencyCode,
      method: decision.method,
      payment_id: decision.paymentId,
      actor_id: input.recorded_by,
    })
  } catch (error) {
    logFailure(container, "the payment is refunded but the record could not be saved", orderId, error)
    throw new Refusal(500, "not_allowed", "record_failed", RECORD_FAILED_MESSAGE)
  }
  return { quantity: decision.quantity, amount: decision.amount, method: decision.method }
}

/** The email addresses of the admin users named in the returns, by user id (for the order page). */
export async function userEmails(container: MedusaContainer, ids: readonly string[]): Promise<Record<string, string>> {
  if (ids.length === 0) return {}
  const users = await container.resolve(Modules.USER).listUsers({ id: [...ids] }, { select: ["id", "email"] })
  return Object.fromEntries(users.map((user) => [user.id, user.email]))
}
