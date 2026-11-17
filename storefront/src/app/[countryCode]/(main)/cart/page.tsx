import { Metadata } from "next"

import { cartContent } from "@content/cart"
import { listCartOptions, retrieveCartForPage } from "@lib/data/cart"
import { getCheckoutRules } from "@lib/data/checkout-rules"
import { getGarmentsCollection } from "@lib/data/collections"
import { retrieveCustomer } from "@lib/data/customer"
import { getRegion } from "@lib/data/regions"
import { dropStaleRush, repriceRush } from "@lib/data/rush"
import { cartInOtherRegion } from "@lib/util/checkout-view"
import { rushIsStale, rushOutOfLine } from "@lib/util/rush"
import EmptyCartMessage from "@modules/cart/components/empty-cart-message"
import MoveCartToRegion from "@modules/cart/components/move-cart-to-region"
import RegionMovedNotice from "@modules/cart/components/region-moved-notice"
import { UndoToastProvider } from "@modules/cart/components/undo-toast/provider"
import CartTemplate from "@modules/cart/templates"
import CompletedCartRecovery from "@modules/checkout/components/completed-cart"
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
  const [{ cart: read, failed }, customer] = await Promise.all([
    retrieveCartForPage(),
    retrieveCustomer().catch(() => null),
  ])

  if (failed) {
    return <ServerError />
  }
  let cart = read

  // Already an order (the answer to "Place order" was lost): its
  // confirmation, never the ordered cart as a live one (QA S1-4, D1).
  if (cart?.completed_at) {
    return <CompletedCartRecovery countryCode={countryCode} cartId={cart.id} />
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
  const region = await getRegion(countryCode)
  if (cartInOtherRegion(cart, region?.id)) {
    return <MoveCartToRegion countryCode={countryCode} fallback={<SkeletonCartPage />} />
  }

  const [firstRules, options] = await Promise.all([
    getCheckoutRules(cart.id),
    listCartOptions()
      .then(({ shipping_options }) => shipping_options)
      .catch(() => null),
  ])

  // A rush line the store no longer offers (the percentage became 0) is
  // taken off before the cart is shown, and a quiet line says so; the
  // customer never sees a charge for something not on offer (contract 9).
  let rules = firstRules
  let rushDropped = false
  if (rushIsStale(rules) && (await dropStaleRush())) {
    const fresh = await retrieveCartForPage({ again: true })
    if (fresh.cart && !fresh.cart.completed_at && fresh.cart.items?.length) {
      cart = fresh.cart
      rules = await getCheckoutRules(cart.id, { again: true })
      rushDropped = true
    }
  } else if (rushOutOfLine(rules, cart.items) && (await repriceRush())) {
    // The line kept an older figure after staff changed the percentage:
    // the backend prices it again, and the page shows that cart, so one
    // screen never has two rush amounts. If it can't, the card shows the
    // line's own amount (rushControlView).
    const fresh = await retrieveCartForPage({ again: true })
    if (fresh.cart && !fresh.cart.completed_at && fresh.cart.items?.length) {
      cart = fresh.cart
      rules = await getCheckoutRules(cart.id, { again: true })
    }
  }

  const countryName =
    region?.countries?.find((c) => c.iso_2?.toLowerCase() === countryCode)?.display_name ??
    countryCode.toUpperCase()

  return (
    <UndoToastProvider>
      <div className="content-container pt-4 empty:hidden">
        <RegionMovedNotice
          countryCode={countryCode}
          countryName={countryName}
          currencyCode={cart.currency_code}
        />
      </div>
      <CartTemplate
        cart={cart}
        rules={rules}
        shippingOptions={options}
        countryCode={countryCode}
        isGuest={!customer}
        rushDropped={rushDropped}
      />
    </UndoToastProvider>
  )
}
