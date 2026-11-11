import { retrieveCart } from "@lib/data/cart"
import { pieceCount } from "@lib/util/cart-view"
import CartPanel from "@modules/layout/components/cart-panel"

/** The header's cart: the piece count from the server, the panel in the browser. */
export default async function CartButton() {
  const cart = await retrieveCart().catch(() => null)

  return <CartPanel count={pieceCount(cart?.items)} />
}
