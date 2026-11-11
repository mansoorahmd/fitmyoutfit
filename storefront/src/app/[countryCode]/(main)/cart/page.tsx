import { Metadata } from "next"

import { cartContent } from "@content/cart"
import { listCartOptions, retrieveCartForPage } from "@lib/data/cart"
import { getCheckoutRules } from "@lib/data/checkout-rules"
import { getGarmentsCollection } from "@lib/data/collections"
import { retrieveCustomer } from "@lib/data/customer"
import { getRegion } from "@lib/data/regions"
import { cartInOtherRegion } from "@lib/util/checkout-view"
import EmptyCartMessage from "@modules/cart/components/empty-cart-message"
import MoveCartToRegion from "@modules/cart/components/move-cart-to-region"
import { UndoToastProvider } from "@modules/cart/components/undo-toast/provider"
import CartTemplate from "@modules/cart/templates"
import ServerError from "@modules/common/components/server-error"
import SkeletonCartPage from "@modules/skeletons/templates/skeleton-cart-page"
import ProductRail, {
  GarmentsSection,
} from "@modules/home/components/featured-products/product-rail"

export const metadata: Metadata = {
  title: cartContent.title,
}

/**
 * The cart page (docs/design/05-m1-pages.md, section 4). The cart and the
 * backend's checkout rules are read on the server; a change to the cart
 * refreshes the page, so both are read again. When the rules don't load,
 * the cart still works (05, 4.4).
 */
export default async function Cart(props: {
  params: Promise<{ countryCode: string }>
}) {
  const { countryCode } = await props.params
  const [{ cart, failed }, customer] = await Promise.all([
    retrieveCartForPage(),
    retrieveCustomer().catch(() => null),
  ])

  if (failed) {
    return <ServerError />
  }

  if (!cart?.items?.length) {
    const [region, garments] = await Promise.all([
      getRegion(countryCode),
      getGarmentsCollection().catch(() => undefined),
    ])
    return (
      <UndoToastProvider>
        <EmptyCartMessage />
        {region && garments && (
          <GarmentsSection>
            <ProductRail collection={garments} region={region} />
          </GarmentsSection>
        )}
      </UndoToastProvider>
    )
  }

  // A cart from another region (the visitor typed /pk/cart with a UK cart)
  // is moved to the URL's region before it is shown.
  if (cartInOtherRegion(cart, (await getRegion(countryCode))?.id)) {
    return <MoveCartToRegion countryCode={countryCode} fallback={<SkeletonCartPage />} />
  }

  const [rules, options] = await Promise.all([
    getCheckoutRules(cart.id),
    listCartOptions()
      .then(({ shipping_options }) => shipping_options)
      .catch(() => null),
  ])

  return (
    <UndoToastProvider>
      <CartTemplate
        cart={cart}
        rules={rules}
        shippingOptions={options}
        countryCode={countryCode}
        isGuest={!customer}
      />
    </UndoToastProvider>
  )
}
