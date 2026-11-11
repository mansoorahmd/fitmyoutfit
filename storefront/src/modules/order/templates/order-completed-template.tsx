import { Fragment } from "react"

import { orderContent } from "@content/order"
import { OrderConfirmationView } from "@lib/util/order-confirmation"
import { fill, fillParts } from "@lib/util/wording"
import SummaryLines from "@modules/checkout/components/summary-lines"
import Amount from "@modules/common/components/amount"
import { ButtonLink } from "@modules/common/components/button"
import DeliveryDateLine from "@modules/common/components/delivery-date-line"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import LineIcon, { LineIconName } from "@modules/home/components/line-icon"
import { formatDeliveryDate } from "@lib/util/calendar-date"

const words = orderContent

/**
 * The order confirmation (docs/design/05-m1-pages.md, section 7): the band
 * with the order number, the promised date (only when the order kept one),
 * how to pay, what happens next, the order with its totals, the delivery
 * address, the payment method and what to do next. No "Tax not final": the
 * total is what the customer pays (decision 008, 6). No email is sent in
 * M1, so nothing here says one was.
 */
const OrderCompletedTemplate = ({
  view,
  signedIn,
}: {
  view: OrderConfirmationView
  signedIn: boolean
}) => {
  const deliveredBy = view.deliveryDate ? formatDeliveryDate(view.deliveryDate) : null
  const steps: { icon: LineIconName; text: string }[] = [
    { icon: "package", text: words.next.make },
    { icon: "check", text: words.next.check },
    {
      icon: "delivery",
      text: deliveredBy ? fill(words.next.deliveredBy, { date: deliveredBy }) : words.next.deliverToAddress,
    },
  ]

  return (
    <div className="content-container pt-6 pb-12 md:pt-8 xl:pb-24" data-testid="order-complete-container">
      <div className="mx-auto flex max-w-[640px] flex-col gap-8 lg:max-w-none">
        {/* 1. The confirmation band */}
        <section className="flex flex-col gap-2 rounded-card bg-brand-surface-alt p-6" data-testid="order-band">
          <LineIcon name="check" className="h-8 w-8 text-brand-success" />
          <h1 className="type-h1 text-brand-ink" data-testid="order-thank-you">
            {view.firstName
              ? fillParts(words.band.thankYouName, { name: <bdi>{view.firstName}</bdi> }).map(
                  (part, i) => <Fragment key={i}>{part}</Fragment>
                )
              : words.band.thankYou}
          </h1>
          <p className="type-body-lg text-brand-ink">{words.band.placed}</p>
          {view.orderNumber && (
            <div className="mt-2">
              <p className="type-small text-brand-ink-muted">{words.band.orderNumber}</p>
              <p className="type-h2 tabular-nums text-brand-ink" data-testid="order-number">
                {view.orderNumber}
              </p>
            </div>
          )}
          {view.placedOn && (
            <p className="type-body text-brand-ink" data-testid="order-placed-on">
              {fill(words.band.placedOn, { date: view.placedOn })}
            </p>
          )}
          <p className="type-body text-brand-ink-muted">{words.band.keepNumber}</p>
        </section>

        <div className="flex flex-col gap-8 lg:grid lg:grid-cols-12 lg:items-start lg:gap-x-12">
          <div className="flex flex-col gap-8 lg:col-span-7 lg:row-start-1">
            {/* 2. The promised date, only when the order kept one */}
            {view.deliveryDate && (
              <div className="rounded-card border border-brand-border p-4" data-testid="order-delivery-date">
                <DeliveryDateLine date={view.deliveryDate} />
              </div>
            )}

            {/* 3. How it is paid */}
            {view.payment === "cod" && (
              <p className="flex items-start gap-2 type-body text-brand-ink" data-testid="order-payment-line">
                <LineIcon name="payment" className="h-6 w-6 shrink-0" />
                <span>
                  {fillParts(words.payment.codLine, {
                    total: <Amount className="font-semibold">{view.total}</Amount>,
                  }).map((part, i) => (
                    <Fragment key={i}>{part}</Fragment>
                  ))}
                </span>
              </p>
            )}
            {view.payment === "test" && (
              <p className="flex items-start gap-2 type-body text-brand-ink" data-testid="order-payment-line">
                <LineIcon name="payment" className="h-6 w-6 shrink-0" />
                <span>{words.payment.testLine}</span>
              </p>
            )}

            {/* 4. What happens next */}
            <section aria-labelledby="order-next-title" className="flex flex-col gap-4">
              <h2 id="order-next-title" className="type-h2 text-brand-ink">
                {words.next.title}
              </h2>
              <ol className="flex flex-col gap-3" data-testid="order-next-steps">
                {steps.map((step) => (
                  <li key={step.icon} className="flex items-start gap-3 type-body text-brand-ink">
                    <LineIcon name={step.icon} className="h-6 w-6 shrink-0" />
                    <span>{step.text}</span>
                  </li>
                ))}
              </ol>
            </section>
          </div>

          {/* 5. Your order */}
          <section
            aria-labelledby="order-summary-title"
            className="flex flex-col gap-4 rounded-card border border-brand-border-strong p-4 md:p-6 lg:col-span-5 lg:col-start-8 lg:row-span-2 lg:row-start-1"
            data-testid="order-summary"
          >
            <h2 id="order-summary-title" className="type-h3 text-brand-ink">
              {words.summary.title}
            </h2>
            <SummaryLines lines={view.lines} words={{ size: words.summary.size, times: words.summary.times }} />
            <dl className="flex flex-col gap-3 border-t border-brand-border pt-4">
              <div className="flex items-baseline justify-between gap-4" data-testid="order-items">
                <dt className="type-body text-brand-ink">{fill(words.summary.items, { n: view.pieces })}</dt>
                <dd className="type-body text-brand-ink">
                  <Amount>{view.itemSubtotal}</Amount>
                </dd>
              </div>
              {view.delivery && (
                <div className="flex items-baseline justify-between gap-4" data-testid="order-delivery">
                  <dt className="min-w-0 type-body text-brand-ink">
                    <bdi>{view.delivery.label}</bdi>
                  </dt>
                  <dd className="type-body text-brand-ink">
                    {view.delivery.kind === "included" ? (
                      words.summary.deliveryIncluded
                    ) : (
                      <Amount>{view.delivery.amount}</Amount>
                    )}
                  </dd>
                </div>
              )}
              <div
                className="flex items-baseline justify-between gap-4 border-t border-brand-border pt-3"
                data-testid="order-total"
              >
                <dt className="type-h3">{words.summary.total}</dt>
                <dd className="type-h3">
                  <Amount>{view.total}</Amount>
                </dd>
              </div>
            </dl>
          </section>

          <div className="flex flex-col gap-8 lg:col-span-7 lg:col-start-1 lg:row-start-2">
            {/* 6. Delivery address */}
            {view.addressLines.length > 0 && (
              <section aria-labelledby="order-address-title" className="flex flex-col gap-2" data-testid="order-address">
                <h2 id="order-address-title" className="type-h3 text-brand-ink">
                  {words.address.title}
                </h2>
                <div className="type-body text-brand-ink">
                  {view.addressLines.map((line, i) => (
                    <p key={i} data-testid="address-line">
            <bdi>{line}</bdi>
          </p>
                  ))}
                  {view.phone && (
                    <p dir="ltr" className="text-start">
                      {view.phone}
                    </p>
                  )}
                </div>
              </section>
            )}

            {/* 7. Payment method */}
            {view.payment !== "other" && (
              <section aria-labelledby="order-payment-title" className="flex flex-col gap-2" data-testid="order-payment-method">
                <h2 id="order-payment-title" className="type-h3 text-brand-ink">
                  {words.payment.title}
                </h2>
                <p className="type-body text-brand-ink">
                  {view.payment === "cod" ? words.payment.codName : words.payment.testName}
                </p>
              </section>
            )}

            {/* 9. What to do next */}
            <div className="flex flex-col gap-4 print:hidden" data-testid="order-next-action">
              {signedIn ? (
                <LocalizedClientLink
                  href={words.account.allOrdersHref}
                  className="inline-flex min-h-[44px] items-center self-start px-1 type-body font-semibold text-brand-ink underline underline-offset-4 hover:decoration-2"
                >
                  {words.account.allOrders}
                </LocalizedClientLink>
              ) : (
                <div className="flex flex-col gap-3 rounded-card border border-brand-border p-4" data-testid="order-create-account">
                  <p className="type-body font-semibold text-brand-ink">{words.account.saveTitle}</p>
                  <ButtonLink
                    href={fill(words.account.createHref, { email: encodeURIComponent(view.email ?? "") })}
                    variant="secondary"
                    className="self-start"
                  >
                    {words.account.create}
                  </ButtonLink>
                </div>
              )}
              <ButtonLink href="/" fullWidth className="md:w-auto md:min-w-[240px] md:self-start" data-testid="back-to-store">
                {words.backToStore}
              </ButtonLink>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default OrderCompletedTemplate
