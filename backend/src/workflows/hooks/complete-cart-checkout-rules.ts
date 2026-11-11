/**
 * Enforces the checkout rules when a cart is completed (POST /store/carts/:id/complete, a payment
 * provider's webhook, or any other caller of Medusa's completeCartWorkflow).
 *
 * Medusa's `validate` hook runs after the cart and its payment sessions are read and before the
 * order is created and the payment is authorized, so a refusal here charges nothing and creates
 * no order. The route answers with HTTP 400 and Medusa's usual error body (`type: "not_allowed"`,
 * `message`).
 *
 * Refused: below the minimum, cash on delivery when it is not available, and (a second barrier
 * behind api/middlewares.ts, which refuses them at the door) a cart carrying a staff-only
 * metadata key. Never for the promised delivery date: the order's own is written after the order
 * is created (subscribers/order-placed-delivery-promise.ts), so a webhook that completes a cart
 * never loses the order over it.
 *
 * Medusa allows one handler per workflow hook: every later check at cart completion (team orders,
 * deposits) goes into this file, not into a second hook file.
 *
 * Thin: the rules are in lib/rules/, the loading in ../checkout-rules/.
 */
import { MedusaError } from "@medusajs/framework/utils"
import { completeCartWorkflow } from "@medusajs/medusa/core-flows"
import { checkCartMetadataForCompletion } from "../../lib/rules/order-metadata"
import { COD_PAYMENT_PROVIDER_ID } from "../../modules/cod/constants"
import { assertCheckoutAllowed } from "../checkout-rules/load-checkout-rules"

type HookCart = {
  id: string
  completed_at?: unknown
  metadata?: Record<string, unknown> | null
  payment_collection?: {
    payment_sessions?: ({ provider_id?: string | null } | null)[] | null
  } | null
}

completeCartWorkflow.hooks.validate(async ({ cart }, { container }) => {
  const hookCart = cart as HookCart
  // A cart that already became an order is being completed again (Medusa returns the existing
  // order): nothing new is created or charged, so the rules are not applied a second time.
  if (hookCart.completed_at) {
    return
  }
  const metadata = checkCartMetadataForCompletion(hookCart.metadata)
  if (!metadata.ok) {
    throw new MedusaError(MedusaError.Types.NOT_ALLOWED, metadata.error)
  }
  const usesCashOnDelivery = (hookCart.payment_collection?.payment_sessions ?? []).some(
    (session) => session?.provider_id === COD_PAYMENT_PROVIDER_ID
  )
  await assertCheckoutAllowed(container, hookCart.id, {
    usesCashOnDelivery,
    checkMinimum: true,
  })
})
