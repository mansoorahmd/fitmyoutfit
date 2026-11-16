import { accountContent } from "@content/account"
import { orderContent } from "@content/order"
import BackLink from "@modules/account/components/back-link"

/**
 * An order that isn't this customer's, or that the backend doesn't know
 * (docs/design/05-m1-pages.md, 9.4 and 7.3): "We can't find that order",
 * and the way back to the order history.
 */
export default function AccountOrderNotFound() {
  return (
    <section
      className="content-container flex min-h-[50vh] flex-col items-start justify-center gap-6 py-12 md:py-24"
      data-testid="order-not-found"
    >
      <h1 className="type-h1 text-brand-ink">{orderContent.notFound.title}</h1>
      <BackLink href="/account/orders" label={accountContent.order.back} />
    </section>
  )
}
