/**
 * Prices the cart's rush line again after every change to the cart (docs/contracts/m1-checkout.md,
 * section 9; decision 011).
 *
 * Medusa's refreshCartItemsWorkflow runs at the end of every store change to a cart's contents or
 * prices: adding a line (addToCartWorkflow, also our POST /store/carts/:id/rush), changing a
 * quantity (updateLineItemInCartWorkflow), removing a line (deleteLineItemsWorkflow), updating the
 * cart (updateCartWorkflow: region and currency, promotion codes sent with the cart), choosing a
 * shipping method and moving the cart to a customer. It runs inside the cart's lock (the outer
 * workflow's), and its `beforeRefreshingPaymentCollection` hook comes after the line prices,
 * taxes and promotions are worked out and before the payment collection takes the cart's total.
 * So this handler sees the garments with their discounts, writes the rush line, and the payment
 * collection, and the answer the route then sends, already carry the new charge.
 *
 * The rush line is not discountable (lib/rules/rush-charge.ts, planRushLine), so its price never
 * changes the discounts Medusa has just worked out.
 *
 * If a later step of the workflow fails, Medusa undoes the change and this handler's write with it.
 *
 * Medusa allows one handler per workflow hook: anything else that must happen at this point goes
 * into this file.
 *
 * Not covered by this hook (handled elsewhere, see workflows/rush/rush-workflows.ts): promotion
 * codes applied or removed through /store/carts/:id/promotions, and the price check right before
 * completion.
 */
import { StepResponse } from "@medusajs/framework/workflows-sdk"
import { refreshCartItemsWorkflow } from "@medusajs/medusa/core-flows"
import { repriceRushLine, undoRushReprice, type RushUndo } from "../rush/rush-cart"

refreshCartItemsWorkflow.hooks.beforeRefreshingPaymentCollection(
  async ({ input }, { container }) => {
    const outcome = await repriceRushLine(container, input.cart_id)
    return new StepResponse(undefined, outcome.undo)
  },
  async (undo: RushUndo | undefined, { container }) => {
    await undoRushReprice(container, undo)
  }
)
