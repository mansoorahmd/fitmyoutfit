/**
 * Medusa glue: loads one order's payments (with their captures) and metadata with Query and hands
 * them to the plain rule in lib/rules/cash-collection.ts. Used by the admin route and the workflow
 * that records the cash as collected, so both see the same state. No business rule lives here.
 */
import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, MathBN, MedusaError } from "@medusajs/framework/utils"
import {
  cashCollectionState,
  type CashCollectionState,
  type CollectionPayment,
} from "../../lib/rules/cash-collection"

type OrderRow = {
  id: string
  status?: string | null
  metadata?: Record<string, unknown> | null
  payment_collections?: ({
    payments?: ({
      id: string
      provider_id?: string | null
      amount?: unknown
      captured_at?: unknown
      canceled_at?: unknown
      captures?: ({ amount?: unknown; created_by?: string | null; created_at?: unknown } | null)[] | null
    } | null)[] | null
  } | null)[] | null
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

export type LoadedCashCollection = {
  state: CashCollectionState
  metadata: Record<string, unknown>
}

/** The order's cash-collection state. Throws NOT_FOUND for an unknown order. */
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
      "metadata",
      "payment_collections.payments.id",
      "payment_collections.payments.provider_id",
      "payment_collections.payments.amount",
      "payment_collections.payments.captured_at",
      "payment_collections.payments.canceled_at",
      "payment_collections.payments.captures.amount",
      "payment_collections.payments.captures.created_by",
      "payment_collections.payments.captures.created_at",
    ],
    filters: { id: orderId },
  })
  const order = (data as unknown as OrderRow[])[0]
  if (!order) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, `Order id not found: ${orderId}`)
  }
  const payments: CollectionPayment[] = (order.payment_collections ?? []).flatMap((collection) =>
    (collection?.payments ?? []).flatMap((payment) => {
      if (!payment) {
        return []
      }
      const captures = (payment.captures ?? []).flatMap((capture) => (capture ? [capture] : []))
      const amount = toNumber(payment.amount)
      const capturedAmount = captures.reduce((sum, capture) => sum + toNumber(capture.amount), 0)
      return [
        {
          id: payment.id,
          provider_id: payment.provider_id ?? "",
          amount,
          captured_amount: capturedAmount,
          // Medusa sets captured_at once the whole amount is captured, a moment after it saves
          // the capture that completes it; the captures' sum says so already in between.
          fully_captured: Boolean(payment.captured_at) || (amount > 0 && capturedAmount >= amount),
          canceled: Boolean(payment.canceled_at),
          captures: captures.map((capture) => ({
            created_by: capture.created_by ?? null,
            created_at: toIso(capture.created_at),
          })),
        },
      ]
    })
  )
  const metadata = order.metadata ?? {}
  return {
    state: cashCollectionState({ orderStatus: order.status, payments, metadata }),
    metadata,
  }
}
