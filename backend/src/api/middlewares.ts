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
 *
 * Medusa's order cancel (POST /admin/orders/:id/cancel) holds the order's cash lock for as long as
 * it runs, so it never interleaves with "mark cash as collected" (holdOrderCashLockDuringCancel).
 *
 * Password reset (docs/contracts/m1-password-reset.md): every request's logged address and
 * Referer lose the value of a `token` parameter (redactCredentialsInRequestLog), and a password
 * update holds its reset token's lock, so a token works once even when two updates arrive at the
 * same moment (holdResetTokenLockDuringUpdate).
 *
 * Saved designs and team orders (/store/designs*, /store/team-orders*): the signed-in customer only
 * (`authenticate`, 401 without; 401 also for a deleted customer, refuseDeletedCustomer); a design's JSON may be larger than Medusa's default body limit,
 * so the two routes that take one allow a body of up to DESIGN_BODY_LIMIT.
 *
 * Team orders for staff (/admin/team-orders*) need no middleware of ours: Medusa puts every
 * /admin route behind the admin user's sign-in, and a customer's token is refused there (401).
 */
import {
  authenticate,
  defineMiddlewares,
  type MedusaNextFunction,
  type MedusaRequest,
  type MedusaResponse,
} from "@medusajs/framework/http"
import { validateAndTransformQuery } from "@medusajs/framework"
import { ContainerRegistrationKeys, MedusaError, Modules } from "@medusajs/framework/utils"
import * as StoreCartQueryConfig from "@medusajs/medusa/api/store/carts/query-config"
import { StoreGetCartsCart } from "@medusajs/medusa/api/store/carts/validators"
import { COD_PAYMENT_PROVIDER_ID } from "../modules/cod/constants"
import {
  hideStaffOnlyKeysInOrders,
  reservedKeysIn,
  reservedKeysMessage,
} from "../lib/rules/order-metadata"
import { isRushKind } from "../lib/rules/rush-charge"
import { redactLoggedRequestFields, type LoggedRequestFields } from "../lib/rules/request-log-redaction"
import { errorNameForLog } from "../lib/rules/password-reset"
import { RESET_TOKEN_BUSY_MESSAGE, resetTokenLockKey } from "../lib/rules/reset-token-lock"
import { ResetTokenLockBusy, withResetTokenLock } from "../workflows/password-reset/reset-token-lock"
import { ORDER_BUSY_FOR_CANCEL_MESSAGE } from "../lib/rules/cash-collection"
import { OrderCashLockBusy, withOrderCashLock } from "../workflows/cash-collection/order-cash-lock"
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
 * Before GET /store/orders, GET /store/orders/:id, Medusa's order-transfer routes and
 * POST /store/carts/:id/complete: keys starting with `cod_` (reserved for staff) are left out of
 * each order's metadata in the answer (QA's tenth review, M1). Such keys reach an order only from
 * a cart whose metadata was written past the store routes (they refuse them), because Medusa copies
 * a cart's metadata into its order. The data itself is cleaned by the order-placed subscriber (new
 * orders) and by the migration script (migration-scripts/move-cod-metadata-to-cash-collection.ts,
 * orders recorded before 12 Nov); this covers every moment in between, so a customer is never
 * shown them.
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

/** The longest a cancel holds the order's cash lock, whatever happens to its response. */
const CANCEL_LOCK_LIMIT_MS = 120 * 1000

/**
 * Before POST /admin/orders/:id/cancel (Medusa's route, cancelOrderWorkflow): takes the order's
 * cash lock (workflows/cash-collection/order-cash-lock.ts) and holds it until the response is sent,
 * so the cancel reads and changes the order's payments while no "mark cash as collected" runs on
 * the order, and a press waits until the cancel is done (QA's thirteenth review, B1). When the lock
 * is not free in time the cancel is not run: HTTP 409 (`conflict`) with a sentence for staff.
 */
export function holdOrderCashLockDuringCancel(
  req: MedusaRequest,
  res: MedusaResponse,
  next: MedusaNextFunction
): void {
  let release: () => void = () => undefined
  const done = new Promise<void>((resolve) => {
    release = resolve
  })
  res.once("finish", () => release())
  res.once("close", () => release())
  setTimeout(() => release(), CANCEL_LOCK_LIMIT_MS).unref()
  let handedOn = false
  withOrderCashLock(req.scope, req.params.id, async () => {
    handedOn = true
    next()
    await done
  }).catch((error: unknown) => {
    if (handedOn) {
      // The cancel ran and answered; only releasing the lock failed (it ends with its connection).
      req.scope
        .resolve(ContainerRegistrationKeys.LOGGER)
        .warn(`Order cash lock of ${req.params.id}: ${(error as Error)?.message ?? error}`)
      return
    }
    if (error instanceof OrderCashLockBusy) {
      // Answered here: Medusa's error handler replaces the message of every 409 with its own.
      res.status(409).json({ type: MedusaError.Types.CONFLICT, message: ORDER_BUSY_FOR_CANCEL_MESSAGE })
      return
    }
    next(error)
  })
}

/**
 * Before every request Medusa routes: removes the value of a `token` query parameter from the
 * request's logged address and from its `Referer` (lib/rules/request-log-redaction.ts), so Medusa's
 * request log never holds a reset or invite token (QA's fifteenth review, B2). Routing and the
 * route handlers read `req.url` and `req.query`, which are left alone.
 */
export function redactCredentialsInRequestLog(
  req: MedusaRequest,
  _res: MedusaResponse,
  next: MedusaNextFunction
): void {
  redactLoggedRequestFields(req as unknown as LoggedRequestFields)
  next()
}

/** The longest an update holds its reset token's lock, whatever happens to its response. */
const RESET_TOKEN_LOCK_LIMIT_MS = 60 * 1000

/**
 * Before POST /auth/:actor_type/emailpass/update (Medusa's route and its token check): holds the
 * reset token's lock (workflows/password-reset/reset-token-lock.ts) until the response is sent,
 * so a second update with the same token waits, then finds the token used and is refused (QA's
 * fifteenth review, S3). Without a readable `jti` nothing is locked. When the lock is not free in
 * time: HTTP 409 (`conflict`).
 */
export function holdResetTokenLockDuringUpdate(
  req: MedusaRequest,
  res: MedusaResponse,
  next: MedusaNextFunction
): void {
  const key = resetTokenLockKey(req.headers.authorization)
  if (!key) {
    return next()
  }
  let release: () => void = () => undefined
  const done = new Promise<void>((resolve) => {
    release = resolve
  })
  res.once("finish", () => release())
  res.once("close", () => release())
  setTimeout(() => release(), RESET_TOKEN_LOCK_LIMIT_MS).unref()
  let handedOn = false
  withResetTokenLock(req.scope, key, async () => {
    handedOn = true
    next()
    await done
  }).catch((error: unknown) => {
    if (handedOn) {
      // The update ran and answered; only releasing the lock failed (it ends with its connection).
      req.scope
        .resolve(ContainerRegistrationKeys.LOGGER)
        .warn(`Reset token lock: ${errorNameForLog(error)}`)
      return
    }
    if (error instanceof ResetTokenLockBusy) {
      res.status(409).json({ type: MedusaError.Types.CONFLICT, message: RESET_TOKEN_BUSY_MESSAGE })
      return
    }
    next(error)
  })
}

/**
 * The body limit of the routes that take a design (the design itself is capped at 1,000,000 bytes
 * in lib/rules/design-input.ts; the rest of the body is a few fields).
 */
export const DESIGN_BODY_LIMIT = "2mb"

/**
 * After `authenticate`, on the routes of designs and team orders: answers 401 when the customer the
 * token names no longer exists (deleted through the admin). A token stays valid until it expires,
 * so without this an old token of a deleted customer kept reading and creating designs and would
 * sign a proof. One primary-key lookup in the customer module per request (a deleted customer is
 * soft-deleted, so the lookup ignores it); nothing is cached, so the next request already sees it.
 */
export async function refuseDeletedCustomer(
  req: MedusaRequest,
  _res: MedusaResponse,
  next: MedusaNextFunction
): Promise<void> {
  try {
    const customerId = (req as MedusaRequest & { auth_context?: { actor_id?: string } }).auth_context?.actor_id
    if (customerId) {
      const customers = req.scope.resolve(Modules.CUSTOMER)
      const found = await customers.listCustomers({ id: customerId }, { select: ["id"], take: 1 })
      if (found.length === 0) {
        return next(new MedusaError(MedusaError.Types.UNAUTHORIZED, "Unauthorized"))
      }
    }
    return next()
  } catch (error) {
    return next(error)
  }
}

const customerOnly = [authenticate("customer", ["session", "bearer"]), refuseDeletedCustomer]

export default defineMiddlewares({
  routes: [
    {
      // No method: a global middleware, ahead of the routes.
      matcher: "/",
      middlewares: [redactCredentialsInRequestLog],
    },
    {
      matcher: "/store/designs",
      method: ["POST"],
      bodyParser: { sizeLimit: DESIGN_BODY_LIMIT },
      middlewares: customerOnly,
    },
    {
      matcher: "/store/designs/:id/versions",
      method: ["POST"],
      bodyParser: { sizeLimit: DESIGN_BODY_LIMIT },
      middlewares: customerOnly,
    },
    {
      matcher: "/store/designs",
      method: ["GET"],
      middlewares: customerOnly,
    },
    {
      matcher: "/store/designs/:id",
      method: ["GET"],
      middlewares: customerOnly,
    },
    {
      matcher: "/store/designs/:id/versions/:version",
      method: ["GET"],
      middlewares: customerOnly,
    },
    {
      matcher: "/store/team-orders",
      method: ["GET", "POST"],
      middlewares: customerOnly,
    },
    {
      matcher: "/store/team-orders/:id",
      method: ["GET", "POST", "DELETE"],
      middlewares: customerOnly,
    },
    {
      matcher: "/store/team-orders/:id/roster",
      method: ["PUT"],
      middlewares: customerOnly,
    },
    {
      matcher: "/store/team-orders/:id/proofs",
      method: ["GET", "POST"],
      middlewares: customerOnly,
    },
    {
      matcher: "/store/team-orders/:id/proofs/:proofId",
      method: ["GET"],
      middlewares: customerOnly,
    },
    {
      matcher: "/store/team-orders/:id/proofs/:proofId/sign",
      method: ["POST"],
      middlewares: customerOnly,
    },
    {
      matcher: "/store/team-orders/:id/add-ons",
      method: ["GET", "POST"],
      middlewares: customerOnly,
    },
    {
      matcher: "/store/team-orders/:id/reorders",
      method: ["POST"],
      middlewares: customerOnly,
    },
    {
      matcher: "/store/team-orders/:id/reopen",
      method: ["POST"],
      middlewares: customerOnly,
    },
    {
      matcher: "/store/team-orders/:id/schedule",
      method: ["POST"],
      middlewares: customerOnly,
    },
    {
      matcher: "/store/team-orders/:id/design-version",
      method: ["POST"],
      middlewares: customerOnly,
    },
    {
      matcher: "/auth/:actor_type/emailpass/update",
      method: ["POST"],
      middlewares: [holdResetTokenLockDuringUpdate],
    },
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
    {
      matcher: "/admin/orders/:id/cancel",
      method: ["POST"],
      middlewares: [holdOrderCashLockDuringCancel],
    },
    {
      // Medusa's order-transfer routes answer with the order too.
      matcher: "/store/orders/:id/transfer/*",
      method: ["POST"],
      middlewares: [hideStaffOnlyOrderKeys],
    },
  ],
})
