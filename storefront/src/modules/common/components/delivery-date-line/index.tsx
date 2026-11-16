import { clx } from "@medusajs/ui"

import { checkoutContent } from "@content/checkout"
import { formatDeliveryDate } from "@lib/util/calendar-date"
import { fill } from "@lib/util/wording"
import LineIcon from "@modules/home/components/line-icon"

/**
 * "Delivered by Thursday 26 November" with its note (docs/design/
 * 05-m1-pages.md, 2.6). The date is the backend's (checkout-rules), as
 * "YYYY-MM-DD". Without a readable date the line is left out, never
 * replaced by a guess. `loading` shows a 220 × 20 grey bar for the date.
 *
 * `note` false: a placed order's kept date (the confirmation and order
 * history). The note W-D2 says the date counts from today, which is only
 * true before the order is placed (QA S1-4, D2); the cart and checkout
 * keep it.
 */
const DeliveryDateLine = ({
  date,
  loading = false,
  note = true,
  className,
}: {
  date: string | null | undefined
  loading?: boolean
  note?: boolean
  className?: string
}) => {
  const shown = date ? formatDeliveryDate(date) : null
  if (!loading && !shown) {
    return null
  }

  return (
    <div className={clx("flex gap-3", className)} data-testid="delivery-date-line">
      <LineIcon name="delivery" className="h-6 w-6 shrink-0 text-brand-ink" />
      <div className="flex min-w-0 flex-col gap-0.5">
        {loading ? (
          <span
            className="block h-5 w-[220px] max-w-full animate-pulse rounded-control bg-brand-border"
            data-testid="delivery-date-loading"
          />
        ) : (
          <p className="type-body font-semibold text-brand-ink">
            {fill(checkoutContent.delivery.deliveredBy, { date: shown! })}
          </p>
        )}
        {note && (
          <p className="type-small text-brand-ink-muted" data-testid="delivery-date-note">
            {checkoutContent.delivery.note}
          </p>
        )}
      </div>
    </div>
  )
}

export default DeliveryDateLine
