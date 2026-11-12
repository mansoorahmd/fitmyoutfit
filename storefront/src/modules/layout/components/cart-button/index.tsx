import { retrieveCart } from "@lib/data/cart"
import { pieceCount } from "@lib/util/cart-view"
import CompletedCartRecovery from "@modules/checkout/components/completed-cart"
import CartPanel from "@modules/layout/components/cart-panel"

/**
 * The header's cart: the piece count from the server, the panel in the
 * browser. A cart that is already an order counts as empty, and its order
 * opens (QA S1-4, D1): the ordered cart is never shown as a live one.
 */
export default async function CartButton({ countryCode }: { countryCode: string }) {
  const cart = await retrieveCart().catch(() => null)

  if (cart?.completed_at) {
    return (
      <>
        <CartPanel count={0} />
        <CompletedCartRecovery countryCode={countryCode} quiet />
      </>
    )
  }

  return <CartPanel count={pieceCount(cart?.items)} />
}
