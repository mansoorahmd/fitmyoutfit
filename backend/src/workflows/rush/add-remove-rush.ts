/**
 * Medusa glue for adding and removing rush (POST and DELETE /store/carts/:id/rush). The decisions
 * (is rush offered, what it costs) are lib/rules/rush-charge.ts; the line is added and removed by
 * Medusa's own cart workflows, so the cart's lock, taxes, promotions and payment collection are
 * Medusa's, and the refresh hook (workflows/hooks/refresh-cart-items-rush.ts) prices the line in
 * the same run.
 */
import type { MedusaContainer } from "@medusajs/framework/types"
import { MedusaError } from "@medusajs/framework/utils"
import { addToCartWorkflow, deleteLineItemsWorkflow } from "@medusajs/medusa/core-flows"
import { isRushKind, RUSH_QUANTITY, rushOffer, rushRefusalMessage } from "../../lib/rules/rush-charge"
import { currencyDigits, findRushVariant, loadRushCart, rushPercentage, type RushCart } from "./rush-cart"
import { repriceRushWorkflow } from "./rush-workflows"

async function cartOrNotFound(container: MedusaContainer, cartId: string): Promise<RushCart> {
  const cart = await loadRushCart(container, cartId)
  if (!cart) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, `Cart id not found: ${cartId}`)
  }
  return cart
}

/**
 * Adds the rush line, or leaves it (priced again) when the cart has it. Refused with HTTP 404 for
 * an unknown cart, 500 naming the key or the product when `rush_percentage` is missing or invalid
 * or the rush product is missing, and 400 `not_allowed` when the cart has no garment line or the
 * percentage is 0. A completed cart is refused by Medusa's own cart check (400).
 */
export async function addRush(container: MedusaContainer, cartId: string): Promise<void> {
  const cart = await cartOrNotFound(container, cartId)
  const { variantId } = await findRushVariant(container)
  const percentage = await rushPercentage(container)
  const offer = rushOffer(cart.lines, percentage, await currencyDigits(container, cart.currencyCode))
  if (!offer.available) {
    throw new MedusaError(MedusaError.Types.NOT_ALLOWED, rushRefusalMessage(offer.reason))
  }
  if (cart.lines.some((line) => isRushKind(line.kind))) {
    // Already there: nothing to add (idempotent), but the price is made right on the way.
    await repriceRushWorkflow(container).run({ input: { cart_id: cartId } })
    return
  }
  // Added at the variant's placeholder price (0, seeded); the refresh hook that Medusa runs in the
  // same workflow, inside the cart's lock, sets the charge on the garments as they are then, with
  // their discounts, and removes a second line if two adds raced. Not a custom price: see
  // lib/rules/rush-charge.ts (RushCartLine.isCustomPrice).
  await addToCartWorkflow(container).run({
    input: {
      cart_id: cartId,
      items: [{ variant_id: variantId, quantity: RUSH_QUANTITY, is_discountable: false } as never],
    },
  })
}

/** Removes every rush line, or does nothing when there is none. HTTP 404 for an unknown cart. */
export async function removeRush(container: MedusaContainer, cartId: string): Promise<void> {
  const cart = await cartOrNotFound(container, cartId)
  const ids = cart.lines.filter((line) => isRushKind(line.kind)).map((line) => line.id)
  if (ids.length === 0) {
    return
  }
  await deleteLineItemsWorkflow(container).run({ input: { cart_id: cartId, ids } })
}
