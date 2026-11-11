/**
 * Medusa glue: writes the promised delivery date into a cart's metadata just before the cart is
 * completed, so Medusa's own order creation copies it into the order's metadata
 * (`metadata.delivery_promise`) in the same step that creates the order.
 *
 * Why this way: Medusa's completeCartWorkflow exposes one hook, `validate`, which runs on a
 * snapshot of the cart read once before the order is built; a hook cannot change what goes into
 * the order, and the workflow's `orderCreated` hook is internal (not exposed). The order's
 * metadata is the cart's metadata, so the cart is the one place to put the promise. The
 * completion hook then checks the snapshot (lib/rules/order-metadata.ts), so no order can be
 * created without the promise, whoever completes the cart.
 *
 * No business rule lives here: the promise comes from loadCheckoutRules, the patch from
 * lib/rules/order-metadata.ts.
 */
import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { completionMetadataPatch } from "../../lib/rules/order-metadata"
import { loadCheckoutRules } from "./load-checkout-rules"

type CartRow = { id: string; completed_at?: unknown; metadata?: Record<string, unknown> | null }

/**
 * Writes the promise (and empties staff-only keys) on a cart that is not completed yet. Does
 * nothing for an unknown or already completed cart: Medusa's route answers those itself (404, or
 * the existing order). Throws like loadCheckoutRules when a setting is missing or invalid.
 */
export async function keepDeliveryPromiseOnCart(
  container: MedusaContainer,
  cartId: string,
  now: Date = new Date()
): Promise<void> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "cart",
    fields: ["id", "completed_at", "metadata"],
    filters: { id: cartId },
  })
  const cart = (data as unknown as CartRow[])[0]
  if (!cart || cart.completed_at) {
    return
  }
  const { rules } = await loadCheckoutRules(container, cartId, now)
  const patch = completionMetadataPatch(cart.metadata, rules.delivery_promise)
  // The cart module directly, not updateCartWorkflow: that workflow refreshes the cart's payment
  // collection, which would drop the payment session the customer just chose. Only the metadata
  // column changes here; totals, items and payment are untouched.
  await container.resolve(Modules.CART).updateCarts(cart.id, {
    metadata: { ...(cart.metadata ?? {}), ...patch },
  })
}
