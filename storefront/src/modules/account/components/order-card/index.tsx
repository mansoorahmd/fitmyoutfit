import Image from "next/image"

import { accountContent } from "@content/account"
import { checkoutContent } from "@content/checkout"
import { OrderCardView } from "@lib/util/account-orders"
import { formatDeliveryDate } from "@lib/util/calendar-date"
import { fill } from "@lib/util/wording"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import LineIcon from "@modules/home/components/line-icon"

import OrderStatus from "../order-status"

const words = accountContent.orders.card

/**
 * One order in the history and on the overview (docs/design/05-m1-pages.md,
 * 9.3): a 1 px `border-strong` box, the card radius, 16 px padding. The
 * whole card is one link to the order (one focus ring), named "Order
 * #1042, placed 11 November 2026".
 * - Row 1: "Order #1042" and the status.
 * - Row 2: "Placed on … · 5 pieces · PKR 21,250".
 * - Row 3: up to 3 thumbnails (48 × 60), then "+2".
 * - Row 4: the promised date, compact (no note), while it isn't delivered.
 */
const OrderCard = ({ view, headingLevel = 3 }: { view: OrderCardView; headingLevel?: 2 | 3 }) => {
  const Heading = headingLevel === 2 ? "h2" : "h3"
  const date = view.deliveryDate ? formatDeliveryDate(view.deliveryDate) : null
  return (
    <LocalizedClientLink
      href={`/account/orders/details/${view.id}`}
      aria-label={view.linkLabel}
      className="flex flex-col gap-3 rounded-card border border-brand-border-strong bg-white p-4 text-brand-ink transition-colors duration-150 ease-out hover:border-brand-ink focus-visible:[outline-style:solid] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-focus"
      data-testid="order-card"
    >
      <span className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
        <Heading className="type-h3 tabular-nums" data-testid="order-card-number">
          {fill(words.number, { number: view.number ?? "" })}
        </Heading>
        <OrderStatus status={view.status} />
      </span>
      <span className="type-small text-brand-ink-muted" data-testid="order-card-meta">
        {view.meta.map((part, i) => (
          <span key={i} className={i === view.meta.length - 1 ? "whitespace-nowrap" : undefined} dir={i === view.meta.length - 1 ? "ltr" : undefined}>
            {i > 0 && " · "}
            {part}
          </span>
        ))}
      </span>
      {view.thumbnails.length > 0 && (
        <span className="flex items-center gap-2" aria-hidden="true">
          {view.thumbnails.map((thumb, i) => (
            <span key={i} className="relative block h-[60px] w-12 shrink-0 overflow-hidden rounded-control bg-brand-surface-alt">
              <Image src={thumb.src} alt="" fill sizes="48px" quality={50} className="object-contain" />
            </span>
          ))}
          {view.moreLines > 0 && (
            <span className="type-small text-brand-ink-muted">{fill(words.more, { n: view.moreLines })}</span>
          )}
        </span>
      )}
      {date && (
        <span className="flex items-center gap-2 type-small font-semibold" data-testid="order-card-date">
          <LineIcon name="delivery" className="h-5 w-5 shrink-0" />
          <span>{fill(checkoutContent.delivery.deliveredBy, { date })}</span>
        </span>
      )}
    </LocalizedClientLink>
  )
}

export default OrderCard
