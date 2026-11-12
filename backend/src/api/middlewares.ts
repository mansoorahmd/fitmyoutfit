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
 *
 * Rush (docs/contracts/m1-checkout.md, section 9): the rush product is put in a cart only by
 * POST /store/carts/:id/rush, at the server's price. Medusa's own routes that add a line or change
 * one refuse it (refuseRushThroughCartRoutes); removing it with Medusa's DELETE line route works.
 * Before a cart is completed its rush line is priced once more (priceRushBeforeCompletion).
 */
import {
  defineMiddlewares,
  type MedusaNextFunction,
  type MedusaRequest,
  type MedusaResponse,
} from "@medusajs/framework/http"
import { validateAndTransformQuery } from "@medusajs/framework"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import * as StoreCartQueryConfig from "@medusajs/medusa/api/store/carts/query-config"
import { StoreGetCartsCart } from "@medusajs/medusa/api/store/carts/validators"
import { COD_PAYMENT_PROVIDER_ID } from "../modules/cod/constants"
import {
  hideStaffOnlyKeysInOrders,
  reservedKeysIn,
  reservedKeysMessage,
} from "../lib/rules/order-metadata"
import { isRushKind } from "../lib/rules/rush-charge"
import { assertCheckoutAllowed } from "../workflows/checkout-rules/load-checkout-rules"
import { includesRushVariant, loadRushCart } from "../workflows/rush/rush-cart"
import { repriceRushWorkflow } from "../workflows/rush/rush-workflows"

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

/**
 * Before GET /store/orders, GET /store/orders/:id and POST /store/carts/:id/complete: keys
 * starting with `cod_` (reserved for staff) are left out of each order's metadata in the answer. The data itself is cleaned by the
 * order-placed subscriber (new orders) and by the migration script
 * (migration-scripts/move-cod-metadata-to-cash-collection.ts, older orders); this covers the moment
 * in between, so a customer is never shown them.
 */
export function hideStaffOnlyOrderKeys(
  _req: MedusaRequest,
  res: MedusaResponse,
  next: MedusaNextFunction
): void {
  const json = res.json.bind(res)
  res.json = ((body: unknown) => json(hideStaffOnlyKeysInOrders(body))) as typeof res.json
  next()
}

/** What a customer is told when they try to put rush in a cart another way. */
export const RUSH_ONLY_THROUGH_ITS_ROUTE =
  "Rush production is added with POST /store/carts/:id/rush and removed with " +
  "DELETE /store/carts/:id/rush; its price and quantity are set by the store."

function variantIdsOf(body: unknown): unknown[] {
  if (typeof body !== "object" || body === null) {
    return []
  }
  const { variant_id, items } = body as { variant_id?: unknown; items?: unknown }
  const fromItems = Array.isArray(items)
    ? items.map((item) => (typeof item === "object" && item !== null ? (item as { variant_id?: unknown }).variant_id : undefined))
    : []
  return [variant_id, ...fromItems]
}

/**
 * Before POST /store/carts (its `items`), POST /store/carts/:id/line-items and
 * POST /store/carts/:id/line-items/:line_id: refuses (HTTP 400, `not_allowed`) a line of the rush
 * product, and any change to the rush line (its quantity, its metadata, anything). The rush line's
 * price and quantity come from the server only. DELETE on the rush line is left to Medusa.
 */
export async function refuseRushThroughCartRoutes(
  req: MedusaRequest,
  _res: MedusaResponse,
  next: MedusaNextFunction
): Promise<void> {
  try {
    const variantIds = [...variantIdsOf(req.body), ...variantIdsOf(req.validatedBody)]
    if (await includesRushVariant(req.scope, variantIds)) {
      throw new MedusaError(MedusaError.Types.NOT_ALLOWED, RUSH_ONLY_THROUGH_ITS_ROUTE)
    }
    const lineId = req.params.line_id
    if (lineId) {
      const cart = await loadRushCart(req.scope, req.params.id)
      if (cart?.lines.some((line) => line.id === lineId && isRushKind(line.kind))) {
        throw new MedusaError(MedusaError.Types.NOT_ALLOWED, RUSH_ONLY_THROUGH_ITS_ROUTE)
      }
    }
    return next()
  } catch (error) {
    return next(error)
  }
}

/**
 * Before POST /store/carts/:id/complete: prices the cart's rush line once more, under the cart's
 * lock, so a change of `rush_percentage` since the cart's last change reaches the order. When the
 * price was already right (the usual case: every cart change prices it) nothing is written. When it
 * changes, the cart's total changes, and Medusa drops the payment session as it does for every
 * change of the total: the customer chooses payment again for the new total. Completion itself
 * also checks the line (workflows/hooks/complete-cart-checkout-rules.ts).
 */
export async function priceRushBeforeCompletion(
  req: MedusaRequest,
  _res: MedusaResponse,
  next: MedusaNextFunction
): Promise<void> {
  try {
    await repriceRushWorkflow(req.scope).run({ input: { cart_id: req.params.id } })
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
    {
      matcher: "/store/carts",
      method: ["POST"],
      middlewares: [refuseReservedCartMetadata, refuseRushThroughCartRoutes],
    },
    {
      matcher: "/store/carts/:id",
      method: ["POST"],
      middlewares: [refuseReservedCartMetadata],
    },
    {
      matcher: "/store/carts/:id/line-items",
      method: ["POST"],
      middlewares: [refuseRushThroughCartRoutes],
    },
    {
      matcher: "/store/carts/:id/line-items/:line_id",
      method: ["POST"],
      middlewares: [refuseRushThroughCartRoutes],
    },
    {
      matcher: "/store/carts/:id/rush",
      method: ["POST", "DELETE"],
      middlewares: [
        validateAndTransformQuery(StoreGetCartsCart, StoreCartQueryConfig.retrieveTransformQueryConfig),
      ],
    },
    {
      matcher: "/store/carts/:id/complete",
      method: ["POST"],
      middlewares: [priceRushBeforeCompletion, hideStaffOnlyOrderKeys],
    },
    {
      matcher: "/store/orders",
      method: ["GET"],
      middlewares: [hideStaffOnlyOrderKeys],
    },
    {
      matcher: "/store/orders/:id",
      method: ["GET"],
      middlewares: [hideStaffOnlyOrderKeys],
    },
  ],
})
