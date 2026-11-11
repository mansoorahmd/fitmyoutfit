/**
 * Custom API middlewares.
 *
 * Cash on delivery is refused when it is chosen, not only when the cart is completed: Medusa's
 * createPaymentSessionsWorkflow has no hook, so this middleware sits in front of its store route
 * (POST /store/payment-collections/:id/payment-sessions). For any other provider it does nothing.
 * Completion is checked again by workflows/hooks/complete-cart-checkout-rules.ts, because the cart
 * can change after the payment method was chosen.
 */
import {
  defineMiddlewares,
  type MedusaNextFunction,
  type MedusaRequest,
  type MedusaResponse,
} from "@medusajs/framework/http"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import { COD_PAYMENT_PROVIDER_ID } from "../modules/cod/constants"
import { assertCheckoutAllowed } from "../workflows/checkout-rules/load-checkout-rules"

export async function refuseUnavailableCashOnDelivery(
  req: MedusaRequest,
  _res: MedusaResponse,
  next: MedusaNextFunction
): Promise<void> {
  try {
    const providerId = (req.body as { provider_id?: unknown } | undefined)?.provider_id
    if (providerId !== COD_PAYMENT_PROVIDER_ID) {
      return next()
    }
    const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
    const { data: links } = await query.graph({
      entity: "cart_payment_collection",
      fields: ["cart_id"],
      filters: { payment_collection_id: req.params.id },
    })
    const cartId = (links as unknown as { cart_id?: string }[])[0]?.cart_id
    if (!cartId) {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        "Cash on delivery can only pay for a cart."
      )
    }
    // The minimum is checked at completion only, so the customer can choose how to pay first.
    await assertCheckoutAllowed(req.scope, cartId, { usesCashOnDelivery: true, checkMinimum: false })
    return next()
  } catch (error) {
    return next(error)
  }
}

export default defineMiddlewares({
  routes: [
    {
      matcher: "/store/payment-collections/:id/payment-sessions",
      method: ["POST"],
      middlewares: [refuseUnavailableCashOnDelivery],
    },
  ],
})
