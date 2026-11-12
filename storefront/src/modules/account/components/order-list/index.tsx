"use client"

import { useRouter } from "next/navigation"
import { useTransition } from "react"

import { accountContent } from "@content/account"
import { homeContent } from "@content/home"
import { OrderCardView } from "@lib/util/account-orders"
import { Button, ButtonLink } from "@modules/common/components/button"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import { buttonClasses } from "@modules/common/components/button/button-styles"

import OrderCard from "../order-card"

const words = accountContent.orders

/**
 * A list of order cards, newest first (docs/design/05-m1-pages.md, 9.3),
 * then "Show more orders" when there are more: a link to the same page
 * listing 10 more, not infinite scroll, so the footer stays reachable and
 * Back works. The page keeps its scroll position.
 */
export const OrderList = ({
  cards,
  moreHref,
  "data-testid": dataTestId,
}: {
  cards: OrderCardView[]
  /** The link for "Show more orders", or null when all are listed. */
  moreHref?: string | null
  "data-testid"?: string
}) => (
  <div className="flex flex-col gap-4">
    <ul className="flex flex-col gap-4" data-testid={dataTestId ?? "order-list"}>
      {cards.map((card) => (
        <li key={card.id}>
          <OrderCard view={card} />
        </li>
      ))}
    </ul>
    {moreHref && (
      <LocalizedClientLink
        href={moreHref}
        scroll={false}
        className={`${buttonClasses({ variant: "secondary", fullWidth: true })} md:w-auto md:self-start`}
        data-testid="orders-show-more"
      >
        {words.showMore}
      </LocalizedClientLink>
    )}
  </div>
)

/** No orders yet (05, 9.3, "Empty"): the heading and the home page's main button. */
export const NoOrders = ({ headingLevel = 2 }: { headingLevel?: 2 | 3 }) => {
  const Heading = headingLevel === 2 ? "h2" : "h3"
  return (
    <div className="flex flex-col items-start gap-4 rounded-card bg-brand-surface-alt p-6" data-testid="orders-empty">
      <Heading className="type-h2 text-brand-ink">{words.empty}</Heading>
      <ButtonLink href={homeContent.button.href} fullWidth className="md:w-auto">
        {homeContent.button.label}
      </ButtonLink>
    </div>
  )
}

/** The orders couldn't load (05, 9.3, "Error"): W-U20 and "Try again". */
export const OrdersFailed = () => {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  return (
    <div className="flex flex-col items-start gap-4" data-testid="orders-failed">
      <p className="type-body font-semibold text-brand-ink">{words.failed}</p>
      <Button
        variant="secondary"
        isLoading={pending}
        onClick={() => startTransition(() => router.refresh())}
      >
        {words.tryAgain}
      </Button>
    </div>
  )
}

/** Three card skeletons at the cards' size (05, 9.3, "Loading"). */
export const OrderCardSkeletons = () => (
  <ul className="flex flex-col gap-4" aria-hidden="true" data-testid="order-skeletons">
    {[0, 1, 2].map((i) => (
      <li key={i} className="flex flex-col gap-3 rounded-card border border-brand-border p-4">
        <span className="flex justify-between gap-4">
          <span className="h-6 w-32 animate-pulse rounded-control bg-brand-border" />
          <span className="h-5 w-24 animate-pulse rounded-control bg-brand-border" />
        </span>
        <span className="h-5 w-3/4 animate-pulse rounded-control bg-brand-border" />
        <span className="flex gap-2">
          {[0, 1, 2].map((j) => (
            <span key={j} className="h-[60px] w-12 animate-pulse rounded-control bg-brand-border" />
          ))}
        </span>
      </li>
    ))}
  </ul>
)
