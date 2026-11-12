/**
 * Medusa glue: makes sure an order keeps its promised delivery date (`metadata.delivery_promise`).
 * Used by the order-placed subscriber (subscribers/order-placed-delivery-promise.ts) for every new
 * order, whoever placed it (the store route, a payment provider's webhook, a converted draft
 * order), and by `GET /store/orders/:id/delivery-promise` before it answers, so the confirmation
 * page gets the date even if it asks before the subscriber has run.
 *
 * Idempotent and safe to run twice at once: the promise is written with a compare-and-set
 * (../order-metadata/write-order-metadata.ts); when another run wrote first, the order is read
 * again and the decision taken again, so both runs end with the same one value.
 *
 * No business rule lives here: what to keep or write is decided by lib/rules/order-metadata.ts.
 */
import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import { appliedDeliverySpeed, type PromisedDelivery } from "../../lib/rules/delivery-promise"
import {
  decideOrderPromise,
  DELIVERY_PROMISE_KEY,
  type PromiseTrust,
} from "../../lib/rules/order-metadata"
import { readDeliveryDays } from "../../lib/settings/delivery-days"
import { replaceOrderMetadataKey } from "../order-metadata/write-order-metadata"

type OrderRow = {
  id: string
  created_at: string | Date
  is_draft_order?: boolean | null
  metadata?: Record<string, unknown> | null
  /** The cart the order was made from (Medusa's order-cart link), if any. */
  cart?: { metadata?: Record<string, unknown> | null } | null
}

/** Attempts before giving up when other writers keep changing the promise (never seen). */
const MAX_ATTEMPTS = 5

async function readOrder(container: MedusaContainer, orderId: string): Promise<OrderRow | undefined> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "order",
    fields: ["id", "created_at", "is_draft_order", "metadata", "cart.metadata"],
    filters: { id: orderId },
  })
  return (data as unknown as OrderRow[])[0]
}

async function readStoreSettings(container: MedusaContainer) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({ entity: "store", fields: ["metadata"] })
  return (data as unknown as { metadata?: Record<string, unknown> | null }[])[0]?.metadata
}

/**
 * The order's promise after making sure it is kept. `trust` is "server_answer_only" when the
 * order has just been placed, "order_own" on a read (lib/rules/order-metadata.ts): a kept promise
 * is then returned only if it is the order's own (based on its creation date, not a copy of its
 * cart's), else the server's answer is written and returned, so the read route never returns
 * anything else, also before the order-placed subscriber has run.
 *
 * Throws NOT_FOUND for an unknown order or a draft order (a draft is not placed yet), and
 * UNEXPECTED_STATE (HTTP 500, naming the key) when no valid promise is kept and the delivery-days
 * settings are missing or invalid: it never invents a date.
 */
export async function keepOrderDeliveryPromise(
  container: MedusaContainer,
  orderId: string,
  trust: PromiseTrust
): Promise<PromisedDelivery> {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const order = await readOrder(container, orderId)
    if (!order || order.is_draft_order) {
      throw new MedusaError(MedusaError.Types.NOT_FOUND, `Order id not found: ${orderId}`)
    }
    const kept = order.metadata?.[DELIVERY_PROMISE_KEY]
    const outcome = decideOrderPromise({
      kept,
      cartKept: order.cart?.metadata?.[DELIVERY_PROMISE_KEY],
      createdAt: new Date(order.created_at),
      days: readDeliveryDays(await readStoreSettings(container)),
      applies: appliedDeliverySpeed(),
      trust,
    })
    if (outcome.action === "keep") {
      return outcome.promise
    }
    if (outcome.action === "fail") {
      if (outcome.clear) {
        await replaceOrderMetadataKey(container, order.id, DELIVERY_PROMISE_KEY, kept, null)
      }
      throw new MedusaError(
        MedusaError.Types.UNEXPECTED_STATE,
        `The store's checkout settings are incomplete: ${outcome.error}`
      )
    }
    if (await replaceOrderMetadataKey(container, order.id, DELIVERY_PROMISE_KEY, kept, outcome.promise)) {
      return outcome.promise
    }
    // Another run changed the promise between the read and the write: decide again on what it
    // wrote (a valid promise is then kept as it is, unless this run is the placement check).
  }
  throw new MedusaError(
    MedusaError.Types.CONFLICT,
    `The delivery promise of order ${orderId} kept changing while it was being written.`
  )
}
