/**
 * Medusa glue: loads one order's payments and metadata with Query and hands them to the plain
 * rule in lib/rules/cash-collection.ts. Used by the admin route and the workflow that records the
 * cash as collected, so both see the same state. No business rule lives here.
 */
import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
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
      captured_at?: unknown
      canceled_at?: unknown
      captures?: ({ id: string } | null)[] | null
    } | null)[] | null
  } | null)[] | null
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
      "payment_collections.payments.captured_at",
      "payment_collections.payments.canceled_at",
      "payment_collections.payments.captures.id",
    ],
    filters: { id: orderId },
  })
  const order = (data as unknown as OrderRow[])[0]
  if (!order) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, `Order id not found: ${orderId}`)
  }
  const payments: CollectionPayment[] = (order.payment_collections ?? []).flatMap((collection) =>
    (collection?.payments ?? []).flatMap((payment) =>
      payment
        ? [
            {
              id: payment.id,
              provider_id: payment.provider_id ?? "",
              captured: Boolean(payment.captured_at) || (payment.captures ?? []).length > 0,
              canceled: Boolean(payment.canceled_at),
            },
          ]
        : []
    )
  )
  const metadata = order.metadata ?? {}
  return {
    state: cashCollectionState({ orderStatus: order.status, payments, metadata }),
    metadata,
  }
}
