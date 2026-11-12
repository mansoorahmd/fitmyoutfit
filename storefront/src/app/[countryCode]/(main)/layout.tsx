import { Metadata } from "next"

import { listCartOptions, retrieveCart } from "@lib/data/cart"
import { retrieveCustomer } from "@lib/data/customer"
import { getBaseURL } from "@lib/util/env"
import { StoreCartShippingOption } from "@medusajs/types"
import { AddedToCartProvider } from "@modules/cart/components/added-to-cart/context"
import CartMismatchBanner from "@modules/layout/components/cart-mismatch-banner"
import Footer from "@modules/layout/templates/footer"
import Nav from "@modules/layout/templates/nav"
import FreeShippingPriceNudge from "@modules/shipping/components/free-shipping-price-nudge"

export const metadata: Metadata = {
  metadataBase: new URL(getBaseURL()),
}

export default async function PageLayout(props: {
  children: React.ReactNode
  params: Promise<{ countryCode: string }>
}) {
  const { countryCode } = await props.params
  const customer = await retrieveCustomer()
  // A cart that is already an order is no cart here (QA S1-4, D1); the
  // header's cart opens its order.
  const read = await retrieveCart()
  const cart = read?.completed_at ? null : read
  let shippingOptions: StoreCartShippingOption[] = []

  if (cart) {
    const { shipping_options } = await listCartOptions()

    shippingOptions = shipping_options
  }

  // The provider shares the last add between the product page and the
  // header's "Added to your cart" popover (docs/design/05-m1-pages.md, 4.7).
  return (
    <AddedToCartProvider>
      <Nav countryCode={countryCode} />
      {customer && cart && (
        <CartMismatchBanner customer={customer} cart={cart} />
      )}

      {cart && (
        <FreeShippingPriceNudge
          variant="popup"
          cart={cart}
          shippingOptions={shippingOptions}
        />
      )}
      {props.children}
      <Footer countryCode={countryCode} signedIn={!!customer} />
    </AddedToCartProvider>
  )
}
