/**
 * Enforces the checkout rules when a cart is completed (POST /store/carts/:id/complete, or any
 * other caller of Medusa's completeCartWorkflow).
 *
 * Medusa's `validate` hook runs after the cart and its payment sessions are read and before the
 * order is created and the payment is authorized, so a refusal here charges nothing and creates
 * no order. The route answers with HTTP 400 and Medusa's usual error body (`type: "not_allowed"`,
 * `message`).
 *
 * Thin: the rules are in lib/rules/, the loading in ../checkout-rules/load-checkout-rules.ts.
 */
import { completeCartWorkflow } from "@medusajs/medusa/core-flows"
import { COD_PAYMENT_PROVIDER_ID } from "../../modules/cod/constants"
import { assertCheckoutAllowed } from "../checkout-rules/load-checkout-rules"

type HookCart = {
  id: string
  completed_at?: unknown
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
  await assertCheckoutAllowed(container, hookCart.id, { usesCashOnDelivery, checkMinimum: true })
})
