/**
 * Every new order keeps its promised delivery date (`metadata.delivery_promise`), worked out by
 * the server from the order's own creation time, whoever placed it: the store's complete route, a
 * payment provider's webhook (Medusa completes the cart without the store route), or a converted
 * draft order. All of them emit Medusa's `order.placed`.
 *
 * A promise the order carries at this point came from the cart, which a customer may have
 * written, so only one exactly equal to the server's answer is kept; anything else is replaced.
 *
 * A failure is logged, not thrown: creating the order is never undone for the promise, and
 * `GET /store/orders/:id/delivery-promise` works the promise out on its first read.
 */
import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { ContainerRegistrationKeys, OrderWorkflowEvents } from "@medusajs/framework/utils"
import { keepOrderDeliveryPromise } from "../workflows/delivery-promise/keep-order-delivery-promise"

export default async function keepDeliveryPromiseOnPlacedOrder({
  event: { data },
  container,
}: SubscriberArgs<{ id: string }>): Promise<void> {
  try {
    await keepOrderDeliveryPromise(container, data.id, "server_answer_only")
  } catch (error) {
    container
      .resolve(ContainerRegistrationKeys.LOGGER)
      .error(
        `Could not keep the delivery promise of order ${data.id}: ${(error as Error)?.message ?? error}. ` +
          "It is worked out again when the order's promise is read."
      )
  }
}

export const config: SubscriberConfig = {
  event: OrderWorkflowEvents.PLACED,
}
