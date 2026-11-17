import { Metadata } from "next"
import { redirect } from "next/navigation"

import { checkoutContent } from "@content/checkout"
import { listRegionPaymentProviders, retrieveCheckoutCart } from "@lib/data/checkout"
import { getCheckoutRules } from "@lib/data/checkout-rules"
import { retrieveCustomer } from "@lib/data/customer"
import { listCartShippingMethods } from "@lib/data/fulfillment"
import { getRegion } from "@lib/data/regions"
import { dropStaleRush } from "@lib/data/rush"
import { cartInOtherRegion, checkoutView } from "@lib/util/checkout-view"
import { rushIsStale } from "@lib/util/rush"
import MoveCartToRegion from "@modules/cart/components/move-cart-to-region"
import CompletedCartRecovery from "@modules/checkout/components/completed-cart"
import CheckoutPage from "@modules/checkout/templates/checkout-page"
import CheckoutSkeleton from "@modules/checkout/templates/checkout-skeleton"
import ServerError from "@modules/common/components/server-error"

export const metadata: Metadata = {
  title: checkoutContent.pageTitle,
}

/**
 * The checkout (docs/design/05-m1-pages.md, section 6). The cart is read
 * fresh on every render; with no cart or an empty one, the visitor goes to
 * the cart page, which says what there is to say. A cart that is already
 * an order opens that order's confirmation (QA S1-4, D1). A cart from
 * another region is moved to the URL's region first.
 */
export default async function Checkout(props: { params: Promise<{ countryCode: string }> }) {
  const { countryCode } = await props.params
  const { cart: read, failed } = await retrieveCheckoutCart()
  let cart = read

  if (failed) {
    return <ServerError />
  }
  if (cart?.completed_at) {
    return <CompletedCartRecovery countryCode={countryCode} cartId={cart.id} />
  }
  if (!cart?.items?.length) {
    redirect(`/${countryCode}/cart`)
  }

  const region = await getRegion(countryCode)
  if (cartInOtherRegion(cart, region?.id)) {
    return (
      <MoveCartToRegion
        countryCode={countryCode}
        fallback={<CheckoutSkeleton />}
        then={`/${countryCode}/checkout?step=address`}
      />
    )
  }

  const [customer, firstRules, shippingOptions, providerIds] = await Promise.all([
    retrieveCustomer().catch(() => null),
    getCheckoutRules(cart.id),
    listCartShippingMethods(cart.id),
    cart.region_id ? listRegionPaymentProviders(cart.region_id) : Promise.resolve(null),
  ])

  // A rush line the store no longer offers is taken off first, as on the
  // cart page (contract 9): what is placed is what is shown.
  let rules = firstRules
  let rushDropped = false
  if (rushIsStale(rules) && (await dropStaleRush())) {
    const fresh = await retrieveCheckoutCart({ again: true })
    if (fresh.cart && !fresh.cart.completed_at && fresh.cart.items?.length) {
      cart = fresh.cart
      rules = await getCheckoutRules(cart.id, { again: true })
      rushDropped = true
    }
  }

  const view = checkoutView({
    cart,
    rules,
    shippingOptions,
    providerIds,
    customer,
    countryCode,
    rushDropped,
  })

  return <CheckoutPage view={view} />
}
