import { orderContent } from "@content/order"
import { ButtonLink } from "@modules/common/components/button"

/** An order the backend doesn't know (docs/design/05-m1-pages.md, 7.3): W-O16 and a link home. */
export default function OrderNotFound() {
  return (
    <section
      className="content-container flex min-h-[60vh] flex-col items-start justify-center gap-6 py-12 md:py-24"
      data-testid="order-not-found"
    >
      <h1 className="type-h1 text-brand-ink">{orderContent.notFound.title}</h1>
      <ButtonLink href="/" fullWidth className="md:w-auto">
        {orderContent.notFound.home}
      </ButtonLink>
    </section>
  )
}
