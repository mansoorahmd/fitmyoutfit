import { clx } from "@medusajs/ui"

import { checkoutContent } from "@content/checkout"
import { AddressSummaryView, CheckoutView } from "@lib/util/checkout-view"
import Amount from "@modules/common/components/amount"

const words = checkoutContent

/**
 * What step 1 holds, as a summary (docs/design/05-m1-pages.md, 6.1 and
 * 6.5 c): the email, the phone, the address in its lines (each `dir="auto"`,
 * so Arabic and Urdu read right to left) and, when given, the delivery line.
 */
const AddressSummary = ({
  summary,
  delivery,
  className,
}: {
  summary: AddressSummaryView
  /** The summary rows: the delivery line is shown when it is known. */
  delivery?: Pick<CheckoutView["summary"], "delivery" | "deliveryAmount">
  className?: string
}) => {
  const row = delivery?.delivery
  return (
    <div className={clx("flex min-w-0 flex-col gap-3 type-body text-brand-ink wrap-anywhere", className)} data-testid="address-summary">
      <div>
        <p className="type-small font-semibold text-brand-ink-muted">{words.check.contact}</p>
        <p dir="ltr" className="text-start break-all">{summary.email}</p>
        {summary.phone && <p dir="ltr" className="text-start">{summary.phone}</p>}
      </div>
      <div>
        <p className="type-small font-semibold text-brand-ink-muted">{words.check.deliverTo}</p>
        {summary.lines.map((line, i) => (
          <p key={i} data-testid="address-line">
            <bdi>{line}</bdi>
          </p>
        ))}
      </div>
      {!summary.billingSame && summary.billingLines.length > 0 && (
        <div>
          <p className="type-small font-semibold text-brand-ink-muted">{words.address.billingTitle}</p>
          {summary.billingLines.map((line, i) => (
            <p key={i} data-testid="address-line">
            <bdi>{line}</bdi>
          </p>
          ))}
        </div>
      )}
      {row && row.kind !== "at_checkout" && (
        <p className="flex items-baseline justify-between gap-4" data-testid="address-summary-delivery">
          <bdi>{row.label}</bdi>
          {row.kind === "included" ? (
            <span>{words.deliveryBlock.included}</span>
          ) : (
            <Amount>{delivery?.deliveryAmount}</Amount>
          )}
        </p>
      )}
    </div>
  )
}

export default AddressSummary
