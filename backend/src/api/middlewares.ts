/**
 * Custom API middlewares.
 *
 * Cash on delivery is refused when it is chosen, not only when the cart is completed: Medusa's
 * createPaymentSessionsWorkflow has no hook, so this middleware sits in front of its store route
 * (POST /store/payment-collections/:id/payment-sessions). For any other provider it does nothing.
 * Completion is checked again by workflows/hooks/complete-cart-checkout-rules.ts, because the cart
 * can change after the payment method was chosen.
 *
 * The key the server writes on an order (the promised delivery date) and every `cod_` key
 * (reserved for staff) are refused when a customer sends them in a cart's metadata, because Medusa
 * copies a cart's metadata into the order (refuseReservedCartMetadata, below).
 */
import {
  defineMiddlewares,
  type MedusaNextFunction,
  type MedusaRequest,
  type MedusaResponse,
} from "@medusajs/framework/http"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import { COD_PAYMENT_PROVIDER_ID } from "../modules/cod/constants"
import { reservedKeysIn, reservedKeysMessage } from "../lib/rules/order-metadata"
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

/**
 * Before POST /store/carts and POST /store/carts/:id: refuses (HTTP 400, `type: "invalid_data"`) a
 * body whose `metadata` contains a key only the server or staff write on an order
 * (`delivery_promise`, or any `cod_` key), whatever its value, null included. These are the only
 * store routes that write a cart's metadata in Medusa v2.22.6; the line-item routes write the
 * items' own metadata, which does not become the order's. Other keys pass as before.
 */
export async function refuseReservedCartMetadata(
  req: MedusaRequest,
  _res: MedusaResponse,
  next: MedusaNextFunction
): Promise<void> {
  const metadata = (req.body as { metadata?: unknown } | undefined)?.metadata
  const reserved = reservedKeysIn(metadata)
  if (reserved.length > 0) {
    return next(new MedusaError(MedusaError.Types.INVALID_DATA, reservedKeysMessage(reserved)))
  }
  return next()
}

export default defineMiddlewares({
  routes: [
    {
      matcher: "/store/payment-collections/:id/payment-sessions",
      method: ["POST"],
      middlewares: [refuseUnavailableCashOnDelivery],
    },
    {
      matcher: "/store/carts",
      method: ["POST"],
      middlewares: [refuseReservedCartMetadata],
    },
    {
      matcher: "/store/carts/:id",
      method: ["POST"],
      middlewares: [refuseReservedCartMetadata],
    },
  ],
})
