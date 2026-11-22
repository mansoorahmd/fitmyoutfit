import { teamOrderContent } from "@content/team-order"
import BackLink from "@modules/account/components/back-link"

/**
 * A team order that is not this customer's, or that the backend does not know: the same words for both, so the page
 * never tells whether an order exists. The way back to the list.
 */
export default function TeamOrderNotFound() {
  const words = teamOrderContent.order.notFound
  return (
    <section
      className="content-container flex min-h-[50vh] flex-col items-start justify-center gap-6 py-12 md:py-24"
      data-testid="team-order-not-found"
    >
      <h1 className="type-h1 text-brand-ink">{words.title}</h1>
      <p className="type-body-lg max-w-xl text-brand-ink-muted">{words.text}</p>
      <BackLink href="/account/team-orders" label={words.back} />
    </section>
  )
}
