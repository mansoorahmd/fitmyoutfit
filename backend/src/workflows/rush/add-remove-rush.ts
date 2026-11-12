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

/**
 * Medusa's cart workflows wait at most 2 seconds for the cart's lock (in-memory in M1, one per
 * server) and then fail with a plain error, which Medusa answers as HTTP 500 "unknown_error". That
 * happens only when several changes to one cart arrive at once; the rush routes answer it as what
 * it is, a conflict (HTTP 409, Medusa's `conflict` body): nothing was changed, try again.
 */
export function isCartLockTimeout(error: unknown): boolean {
  return /^Failed to acquire lock for key /.test(String((error as Error | undefined)?.message ?? ""))
}

async function asConflictOnLockTimeout(cartId: string, run: () => Promise<unknown>): Promise<void> {
  try {
    await run()
  } catch (error) {
    if (isCartLockTimeout(error)) {
      throw new MedusaError(
        MedusaError.Types.CONFLICT,
        `Cart ${cartId} is being changed by another request at the same moment. Try again.`
      )
    }
    throw error
  }
}

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
 * percentage is 0. A completed cart is refused by Medusa's own cart check (400). HTTP 409 when
 * other changes to the cart hold its lock for longer than Medusa waits (isCartLockTimeout).
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
    await asConflictOnLockTimeout(cartId, () =>
      repriceRushWorkflow(container).run({ input: { cart_id: cartId } })
    )
    return
  }
  // Added at the variant's placeholder price (0, seeded); the refresh hook that Medusa runs in the
  // same workflow, inside the cart's lock, sets the charge on the garments as they are then, with
  // their discounts, and removes a second line if two adds raced. Not a custom price: see
  // lib/rules/rush-charge.ts (RushCartLine.isCustomPrice).
  await asConflictOnLockTimeout(cartId, () =>
    addToCartWorkflow(container).run({
      input: {
        cart_id: cartId,
        items: [{ variant_id: variantId, quantity: RUSH_QUANTITY, is_discountable: false } as never],
      },
    })
  )
}

/** Removes every rush line, or does nothing when there is none. HTTP 404 for an unknown cart. */
export async function removeRush(container: MedusaContainer, cartId: string): Promise<void> {
  const cart = await cartOrNotFound(container, cartId)
  const ids = cart.lines.filter((line) => isRushKind(line.kind)).map((line) => line.id)
  if (ids.length === 0) {
    return
  }
  await asConflictOnLockTimeout(cartId, () =>
    deleteLineItemsWorkflow(container).run({ input: { cart_id: cartId, ids } })
  )
}
