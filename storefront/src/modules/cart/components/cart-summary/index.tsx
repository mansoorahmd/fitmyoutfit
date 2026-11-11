import { clx } from "@medusajs/ui"

import { cartContent } from "@content/cart"
import { productContent } from "@content/product"
import { DeliveryRow, totalIsBeforeDelivery } from "@lib/util/cart-view"
import { MinimumView } from "@lib/util/checkout-rules"
import { fill } from "@lib/util/wording"
import Amount from "@modules/common/components/amount"
import DeliveryDateLine from "@modules/common/components/delivery-date-line"
import LineIcon from "@modules/home/components/line-icon"

import MinimumProgress from "../minimum-progress"

export type CartSummaryProps = {
  pieces: number
  /** Formatted amounts. */
  itemSubtotal: string
  total: string
  /** The delivery row; `amount` is formatted by the caller as `deliveryAmount`. */
  delivery: DeliveryRow | null
  deliveryAmount?: string
  showTaxNote: boolean
  /** "YYYY-MM-DD" from the rules, or null. */
  deliveryDate: string | null
  /** Formatted cash on delivery limit when the cart is over it (Pakistan). */
  codLimit: string | null
  minimum: MinimumView | null
  rulesFailed: boolean
  /** A change is being saved: the amounts show grey bars. */
  updating: boolean
  className?: string
}

const Row = ({
  label,
  children,
  testId,
}: {
  label: React.ReactNode
  children: React.ReactNode
  testId: string
}) => (
  <div className="flex items-baseline justify-between gap-4" data-testid={testId}>
    <dt className="min-w-0 type-body text-brand-ink">{label}</dt>
    <dd className="type-body text-brand-ink">{children}</dd>
  </div>
)

/**
 * The cart's summary (docs/design/05-m1-pages.md, 4.4): items, the delivery
 * line, the total, the tax note, the delivery date, the cash on delivery
 * note in Pakistan and the minimum in export regions. No "Taxes" row while
 * the tax isn't final, and no amount for delivery before it is chosen.
 * When the backend's rules didn't load, the date and the minimum are left
 * out and a quiet line says so.
 */
const CartSummary = ({
  pieces,
  itemSubtotal,
  total,
  delivery,
  deliveryAmount,
  showTaxNote,
  deliveryDate,
  codLimit,
  minimum,
  rulesFailed,
  updating,
  className,
}: CartSummaryProps) => {
  const { summary } = cartContent

  return (
    <div className={clx("flex flex-col gap-4", className)} data-testid="cart-summary">
      <dl className="flex flex-col gap-3">
        <Row label={fill(summary.items, { n: pieces })} testId="summary-items">
          <Amount loading={updating}>{itemSubtotal}</Amount>
        </Row>
        {delivery && (
          <Row label={<bdi>{delivery.label}</bdi>} testId="summary-delivery">
            {delivery.kind === "included" && summary.deliveryIncluded}
            {delivery.kind === "at_checkout" && (
              <span className="text-brand-ink-muted">{summary.deliveryAtCheckout}</span>
            )}
            {delivery.kind === "amount" && (
              <Amount loading={updating}>{deliveryAmount}</Amount>
            )}
          </Row>
        )}
        <div
          className="flex items-baseline justify-between gap-4 border-t border-brand-border pt-3"
          data-testid="summary-total"
        >
          <dt className="type-h3">
            {totalIsBeforeDelivery(delivery) ? summary.totalBeforeDelivery : summary.total}
          </dt>
          <dd className="type-h3">
            <Amount loading={updating}>{total}</Amount>
          </dd>
        </div>
      </dl>

      {showTaxNote && (
        <p className="-mt-3 type-small text-brand-ink-muted" data-testid="summary-tax-note">
          {productContent.price.taxNote}
        </p>
      )}

      {!rulesFailed && <DeliveryDateLine date={deliveryDate} />}

      {codLimit && (
        <p className="flex gap-2 type-small text-brand-ink" data-testid="summary-cod-note">
          <LineIcon name="payment" className="h-5 w-5 shrink-0" />
          {fill(summary.codOverLimit, { limit: codLimit })}
        </p>
      )}

      {!rulesFailed && minimum && <MinimumProgress minimum={minimum} compact />}

      {rulesFailed && (
        <p className="type-small text-brand-ink-muted" data-testid="summary-rules-failed">
          {summary.rulesFailed}
        </p>
      )}
    </div>
  )
}

export default CartSummary
