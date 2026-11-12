/**
 * Workflows that price the cart's rush line again where Medusa's refreshCartItemsWorkflow (and so
 * our hook, workflows/hooks/refresh-cart-items-rush.ts) does not run:
 *
 * - repriceRushWorkflow: before a cart is completed (api/middlewares.ts, in front of
 *   POST /store/carts/:id/complete), so a change of `rush_percentage` since the cart's last change
 *   is applied before the order is made from the cart;
 * - updateCartPromotionsWithRushWorkflow: a promotion code applied or removed through
 *   POST / DELETE /store/carts/:id/promotions (our route replaces Medusa's handler there), because
 *   Medusa's updateCartPromotionsWorkflow does not refresh the cart's items.
 *
 * Each takes the cart's lock first (Medusa's locking module, the same key Medusa's cart workflows
 * use), prices the line in a step that is undone if a later step fails, and then lets Medusa
 * refresh the payment collection, which updates its amount and drops the payment sessions when
 * the total changed (Medusa's rule for every cart change).
 */
import {
  createStep,
  createWorkflow,
  StepResponse,
  transform,
  when,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import {
  acquireLockStep,
  refreshPaymentCollectionForCartWorkflow,
  releaseLockStep,
  updateCartPromotionsWorkflow,
  useQueryGraphStep,
} from "@medusajs/medusa/core-flows"
import { repriceRushLine, undoRushReprice, type RushUndo } from "./rush-cart"

export const repriceRushLineStepId = "fitmyoutfit-reprice-rush-line"

/** Prices the cart's rush line (./rush-cart.ts); undone when a later step of the workflow fails. */
export const repriceRushLineStep = createStep(
  repriceRushLineStepId,
  async (input: { cart_id: string }, { container }) => {
    const outcome = await repriceRushLine(container, input.cart_id)
    return new StepResponse({ changed: outcome.changed }, outcome.undo)
  },
  async (undo: RushUndo | undefined, { container }) => {
    await undoRushReprice(container, undo)
  }
)

/** Same lock key and limits as Medusa's completeCartWorkflow, which runs right after this. */
const COMPLETION_LOCK = { timeout: 30, ttl: 120 }
/** Same lock limits as Medusa's cart workflows (updateCartPromotionsWorkflow, addToCartWorkflow). */
const CART_LOCK = { timeout: 2, ttl: 10 }

function refreshPaymentCollection(cartId: string, name: string) {
  const { data: cart } = useQueryGraphStep({
    entity: "cart",
    fields: ["id", "completed_at", "payment_collection.id"],
    filters: { id: cartId },
    options: { isList: false },
  }).config({ name })
  refreshPaymentCollectionForCartWorkflow.runAsStep({ input: { cart } })
}

export const repriceRushWorkflowId = "fitmyoutfit-reprice-rush"

/** Prices the rush line under the cart's lock; refreshes the payment collection when it changed. */
export const repriceRushWorkflow = createWorkflow(
  repriceRushWorkflowId,
  (input: { cart_id: string }) => {
    acquireLockStep({ key: input.cart_id, ...COMPLETION_LOCK })
    const result = repriceRushLineStep({ cart_id: input.cart_id })
    when("rush-line-changed", { result }, ({ result }) => result.changed).then(() => {
      refreshPaymentCollection(input.cart_id, "fetch-cart-after-rush")
    })
    releaseLockStep({ key: input.cart_id })
    return new WorkflowResponse(result)
  }
)

export type UpdateCartPromotionsWithRushInput = {
  cart_id: string
  promo_codes: string[]
  /** Medusa's PromotionActions value: "add", "remove" or "replace". */
  action: string
}

export const updateCartPromotionsWithRushWorkflowId = "fitmyoutfit-update-cart-promotions-with-rush"

/**
 * Medusa's updateCartPromotionsWorkflow (as its store route runs it), then the rush line priced
 * on the new discounts, then the payment collection, all under the cart's lock. (Medusa's
 * workflow takes no lock of its own when it runs inside another workflow.)
 */
export const updateCartPromotionsWithRushWorkflow = createWorkflow(
  updateCartPromotionsWithRushWorkflowId,
  (input: UpdateCartPromotionsWithRushInput) => {
    acquireLockStep({ key: input.cart_id, ...CART_LOCK })
    const promotions = transform({ input }, ({ input }) => ({
      cart_id: input.cart_id,
      promo_codes: input.promo_codes,
      action: input.action as never,
      force_refresh_payment_collection: false,
    }))
    const outcome = updateCartPromotionsWorkflow.runAsStep({ input: promotions })
    repriceRushLineStep({ cart_id: input.cart_id })
    refreshPaymentCollection(input.cart_id, "fetch-cart-after-promotions")
    releaseLockStep({ key: input.cart_id })
    return new WorkflowResponse(outcome)
  }
)
