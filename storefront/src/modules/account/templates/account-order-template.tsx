import { Fragment } from "react"

import { accountContent } from "@content/account"
import { orderContent } from "@content/order"
import { AccountOrderView } from "@lib/util/account-orders"
import { fill, fillParts } from "@lib/util/wording"
import SummaryLines from "@modules/checkout/components/summary-lines"
import Amount from "@modules/common/components/amount"
import DeliveryDateLine from "@modules/common/components/delivery-date-line"
import LineIcon from "@modules/home/components/line-icon"

import OrderStatus from "../components/order-status"

const words = orderContent
const own = accountContent.order

/**
 * One order in the account (docs/design/05-m1-pages.md, 9.4): the
 * confirmation's blocks without the thank-you band and "What happens
 * next". Under the frame's "‹ Your orders" link: the number, status and date; the promised date
 * while it isn't delivered; how it is paid; the lines and totals (the
 * export delivery line reads "Included"); the address; the method. No
 * "Tax not final" (decision 008): the total is what the customer pays.
 * Help stays hidden until a help page exists.
 *
 * Inside the account frame, so the two columns of 7.2 start at 1280 px.
 */
const AccountOrderTemplate = ({ view }: { view: AccountOrderView }) => (
  <div className="flex flex-col gap-8" data-testid="account-order">
    <header className="flex flex-col gap-2">
      <h1 className="type-h1 tabular-nums text-brand-ink" data-testid="order-number">
        {fill(own.title, { number: view.orderNumber ?? "" })}
      </h1>
      <OrderStatus status={view.status} className="type-body" />
      {view.placedOn && (
        <p className="type-body text-brand-ink" data-testid="order-placed-on">
          {fill(words.band.placedOn, { date: view.placedOn })}
        </p>
      )}
    </header>

    <div className="flex flex-col gap-8 xl:grid xl:grid-cols-12 xl:items-start xl:gap-x-12">
      <div className="flex flex-col gap-8 xl:col-span-7 xl:row-start-1">
        {view.deliveryDate && (
          <div className="rounded-card border border-brand-border p-4" data-testid="order-delivery-date">
            <DeliveryDateLine date={view.deliveryDate} note={false} />
          </div>
        )}

        {view.paymentLine && (
          <p className="flex items-start gap-2 type-body text-brand-ink" data-testid="order-payment-line">
            <LineIcon name="payment" className="h-6 w-6 shrink-0" />
            <span>
              {view.paymentLine === "cod_due"
                ? fillParts(words.payment.codLine, {
                    total: <Amount className="font-semibold">{view.total}</Amount>,
                  }).map((part, i) => <Fragment key={i}>{part}</Fragment>)
                : view.paymentLine === "cod_paid"
                  ? own.codPaid
                  : words.payment.testLine}
            </span>
          </p>
        )}

      </div>

      <section
        aria-labelledby="order-summary-title"
        className="flex flex-col gap-4 rounded-card border border-brand-border-strong p-4 md:p-6 xl:col-span-5 xl:col-start-8 xl:row-span-2 xl:row-start-1"
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

      <div className="flex flex-col gap-8 xl:col-span-7 xl:col-start-1 xl:row-start-2">
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
                <p dir="ltr" className="text-start wrap-anywhere">
                  {view.phone}
                </p>
              )}
            </div>
          </section>
        )}

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
      </div>
    </div>
  </div>
)

export default AccountOrderTemplate
