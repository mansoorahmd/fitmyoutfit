import { cartPageView } from "@lib/util/cart-page"

import CartView from "./cart-view"

/** The cart page with items: the view worked out on the server, laid out by CartView. */
const CartTemplate = (props: Parameters<typeof cartPageView>[0]) => (
  <CartView {...cartPageView(props)} />
)

export default CartTemplate
