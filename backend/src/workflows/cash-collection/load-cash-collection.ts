/**
 * Medusa glue: loads one order's payments (with their captures and refunds) and capture
 * transactions with Query, and its cash-collection record from our own module
 * (modules/cash-collection), and hands them to the plain rule in lib/rules/cash-collection.ts. Used
 * by the admin route and by the steps that record the cash as collected, so both see the same
 * state. No business rule lives here: what counts as captured, what is left to capture and whether
 * the figures agree are the rule's.
 */
import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import {
  cashCollectionState,
  ORDER_NOT_FOUND_MESSAGE,
  type CashCollectionRecord,
  type CashCollectionState,
  type CollectionPayment,
} from "../../lib/rules/cash-collection"
import { CASH_COLLECTION_MODULE } from "../../modules/cash-collection/constants"
import type CashCollectionModuleService from "../../modules/cash-collection/service"
import { staffError } from "./staff-error"

type Amount = CollectionPayment["amount"]

type RawCapture = {
  amount?: unknown
  raw_amount?: unknown
  created_by?: string | null
  created_at?: unknown
} | null

type RawPayment = {
  id: string
  provider_id?: string | null
  amount?: unknown
  raw_amount?: unknown
  captured_at?: unknown
  canceled_at?: unknown
  captures?: RawCapture[] | null
  refunds?: ({ amount?: unknown; raw_amount?: unknown } | null)[] | null
} | null

type OrderRow = {
  id: string
  status?: string | null
  canceled_at?: unknown
  currency_code?: string | null
  payment_collections?: ({ payments?: RawPayment[] | null } | null)[] | null
  transactions?: ({ amount?: unknown; raw_amount?: unknown; reference?: string | null } | null)[] | null
}

function toIso(value: unknown): string | null {
  if (value === undefined || value === null) {
    return null
  }
  const date = value instanceof Date ? value : new Date(String(value))
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

/** Medusa's exact figure (`raw_amount`, a decimal string), or the plain amount if that is missing. */
function amountOf(raw: unknown, plain: unknown): Amount {
  return (raw ?? plain ?? null) as Amount
}

export type LoadedCashCollection = {
  state: CashCollectionState
}

/** The cash-collection record of an order, or null. */
export async function readCashCollectionRecord(
  container: MedusaContainer,
  orderId: string
): Promise<CashCollectionRecord | null> {
  const service = container.resolve<CashCollectionModuleService>(CASH_COLLECTION_MODULE)
  const [record] = await service.listCashCollections({ order_id: orderId }, { take: 1 })
  return record
    ? { slip_reference: record.slip_reference, collected_at: toIso(record.collected_at) }
    : null
}

/**
 * The order's cash-collection state. Throws NOT_FOUND for an unknown order, and for a deleted one
 * (Query leaves out soft-deleted orders).
 */
export async function loadCashCollection(
  container: MedusaContainer,
  orderId: string
): Promise<LoadedCashCollection> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "order",
    fields: [
      "id",
      "status",
      "canceled_at",
      "currency_code",
      "payment_collections.payments.id",
      "payment_collections.payments.provider_id",
      "payment_collections.payments.amount",
      "payment_collections.payments.raw_amount",
      "payment_collections.payments.captured_at",
      "payment_collections.payments.canceled_at",
      "payment_collections.payments.captures.amount",
      "payment_collections.payments.captures.raw_amount",
      "payment_collections.payments.captures.created_by",
      "payment_collections.payments.captures.created_at",
      // Refunds Medusa abandoned (failed) are soft-deleted, so Query leaves them out.
      "payment_collections.payments.refunds.amount",
      "payment_collections.payments.refunds.raw_amount",
      "transactions.amount",
      "transactions.raw_amount",
      "transactions.reference",
    ],
    filters: { id: orderId },
  })
  const order = (data as unknown as OrderRow[])[0]
  if (!order) {
    throw staffError(MedusaError.Types.NOT_FOUND, ORDER_NOT_FOUND_MESSAGE)
  }
  const raw = (order.payment_collections ?? []).flatMap((collection) =>
    (collection?.payments ?? []).flatMap((payment) => (payment ? [payment] : []))
  )
  const payments: CollectionPayment[] = raw.map((payment) => ({
    id: payment.id,
    provider_id: payment.provider_id ?? "",
    amount: amountOf(payment.raw_amount, payment.amount),
    captured_at: toIso(payment.captured_at),
    canceled: Boolean(payment.canceled_at),
    captures: (payment.captures ?? []).flatMap((capture) =>
      capture
        ? [
            {
              amount: amountOf(capture.raw_amount, capture.amount),
              created_by: capture.created_by ?? null,
              created_at: toIso(capture.created_at),
            },
          ]
        : []
    ),
    refunds: (payment.refunds ?? []).flatMap((refund) =>
      refund ? [amountOf(refund.raw_amount, refund.amount)] : []
    ),
  }))
  const orderCaptureTransactions = (order.transactions ?? []).flatMap((transaction) =>
    transaction?.reference === "capture" ? [amountOf(transaction.raw_amount, transaction.amount)] : []
  )
  const record = await readCashCollectionRecord(container, orderId)
  return {
    state: cashCollectionState({
      orderStatus: order.status,
      orderCanceledAt: toIso(order.canceled_at),
      currencyCode: order.currency_code,
      payments,
      record,
      orderCaptureTransactions,
    }),
  }
}
