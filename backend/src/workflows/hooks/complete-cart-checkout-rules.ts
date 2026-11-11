/**
 * Enforces the checkout rules when a cart is completed (POST /store/carts/:id/complete, or any
 * other caller of Medusa's completeCartWorkflow).
 *
 * Medusa's `validate` hook runs after the cart and its payment sessions are read and before the
 * order is created and the payment is authorized, so a refusal here charges nothing and creates
 * no order. The route answers with HTTP 400 and Medusa's usual error body (`type: "not_allowed"`,
 * `message`).
 *
 * It also checks what the order will keep in its metadata (Medusa copies the cart's metadata into
 * the order): the promised delivery date, written into the cart just before completion by the
 * middleware on the complete route (api/middlewares.ts), and no staff-only key. A cart without the
 * right promise is refused with HTTP 409 (`type: "conflict"`, like Medusa's own "already being
 * completed"; Medusa's error handler replaces the message with its generic "retry" text, so the
 * reason is in the server log only): completing it again writes the promise afresh. Through the
 * store route this only happens when the cart's metadata is changed during completion.
 *
 * Medusa allows one handler per workflow hook: every later check at cart completion (team orders,
 * deposits) goes into this file, not into a second hook file.
 *
 * Thin: the rules are in lib/rules/, the loading in ../checkout-rules/.
 */
import { MedusaError } from "@medusajs/framework/utils"
import { completeCartWorkflow } from "@medusajs/medusa/core-flows"
import { checkCompletionMetadata } from "../../lib/rules/order-metadata"
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
  const usesCashOnDelivery = (hookCart.payment_collection?.payment_sessions ?? []).some(
    (session) => session?.provider_id === COD_PAYMENT_PROVIDER_ID
  )
  const { rules } = await assertCheckoutAllowed(container, hookCart.id, {
    usesCashOnDelivery,
    checkMinimum: true,
  })

  const kept = checkCompletionMetadata(hookCart.metadata, rules.delivery_promise)
  if (!kept.ok) {
    throw new MedusaError(
      MedusaError.Types.CONFLICT,
      `${kept.error} Complete the cart again through POST /store/carts/${hookCart.id}/complete.`
    )
  }
})
