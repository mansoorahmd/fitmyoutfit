/**
 * Enforces the checkout rules when a cart is completed (POST /store/carts/:id/complete, a payment
 * provider's webhook, or any other caller of Medusa's completeCartWorkflow).
 *
 * Medusa's `validate` hook runs after the cart and its payment sessions are read and before the
 * order is created and the payment is authorized, so a refusal here charges nothing and creates
 * no order. The route answers with HTTP 400 and Medusa's usual error body (`type: "not_allowed"`,
 * `message`).
 *
 * Refused: below the minimum, and cash on delivery when it is not available. Never for a metadata
 * reason (decision 010): the promised delivery date is written on the order after it is created
 * (subscribers/order-placed-delivery-promise.ts), and cash collection is kept in a table of its
 * own (modules/cash-collection), not in metadata, so a `cod_` key a cart may carry means nothing
 * and a webhook that completes a cart never loses the order over it. The reserved keys are still
 * refused at the door (api/middlewares.ts).
 *
 * Medusa allows one handler per workflow hook: every later check at cart completion (team orders,
 * deposits) goes into this file, not into a second hook file.
 *
 * Thin: the rules are in lib/rules/, the loading in ../checkout-rules/.
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
  await assertCheckoutAllowed(container, hookCart.id, {
    usesCashOnDelivery,
    checkMinimum: true,
  })
})
