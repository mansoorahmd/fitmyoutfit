/**
 * Medusa glue: loads one order's payments (with their captures) with Query, and its
 * cash-collection record from our own module (modules/cash-collection), and hands them to the
 * plain rule in lib/rules/cash-collection.ts. Used by the admin route and by the steps that record
 * the cash as collected, so both see the same state. No business rule lives here.
 */
import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, MathBN, MedusaError } from "@medusajs/framework/utils"
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
} | null

type OrderRow = {
  id: string
  status?: string | null
  payment_collections?: ({ payments?: RawPayment[] | null } | null)[] | null
}

function toNumber(value: unknown): number {
  if (value === undefined || value === null) {
    return 0
  }
  return MathBN.convert(value as number).toNumber()
}

function toIso(value: unknown): string | null {
  if (value === undefined || value === null) {
    return null
  }
  const date = value instanceof Date ? value : new Date(String(value))
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

/** A value Medusa stores as a big number (`raw_amount`), or the plain amount if that is missing. */
function exact(raw: unknown, plain: unknown) {
  return MathBN.convert((raw ?? plain ?? 0) as number)
}

export type LoadedCashCollection = {
  state: CashCollectionState
  /**
   * What is still open of a payment (its amount less its captures), exactly, as a string for
   * Medusa's capture. Undefined for an unknown payment.
   */
  remainingOf: (paymentId: string) => string | undefined
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
  const payments: CollectionPayment[] = raw.map((payment) => {
    const captures = (payment.captures ?? []).flatMap((capture) => (capture ? [capture] : []))
    const amount = toNumber(payment.amount)
    const capturedAmount = captures.reduce((sum, capture) => sum + toNumber(capture.amount), 0)
    return {
      id: payment.id,
      provider_id: payment.provider_id ?? "",
      amount,
      captured_amount: capturedAmount,
      // Medusa sets captured_at once the whole amount is captured, a moment after it saves the
      // capture that completes it; the captures' sum says so already in between.
      fully_captured: Boolean(payment.captured_at) || (amount > 0 && capturedAmount >= amount),
      canceled: Boolean(payment.canceled_at),
      captures: captures.map((capture) => ({
        created_by: capture.created_by ?? null,
        created_at: toIso(capture.created_at),
      })),
    }
  })
  const record = await readCashCollectionRecord(container, orderId)
  return {
    state: cashCollectionState({ orderStatus: order.status, payments, record }),
    remainingOf: (paymentId) => {
      const payment = raw.find((p) => p.id === paymentId)
      if (!payment) {
        return undefined
      }
      const captured = (payment.captures ?? []).reduce(
        (sum, capture) => MathBN.add(sum, exact(capture?.raw_amount, capture?.amount)),
        MathBN.convert(0)
      )
      return MathBN.sub(exact(payment.raw_amount, payment.amount), captured).toFixed()
    },
  }
}
