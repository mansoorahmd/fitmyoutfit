"use client"

import { clx } from "@medusajs/ui"
import { useId, useState } from "react"

import { checkoutContent } from "@content/checkout"
import { CheckoutView } from "@lib/util/checkout-view"
import { countWords, fill } from "@lib/util/wording"
import CartSummary from "@modules/cart/components/cart-summary"
import Amount from "@modules/common/components/amount"
import ChevronDown from "@modules/common/icons/chevron-down"

import SummaryLines from "../summary-lines"

const lineWords = { size: checkoutContent.check.size, times: checkoutContent.check.times }

/** The lines and the summary rows (05, 4.4): items, delivery, total, tax note, date. */
export const OrderSummaryContent = ({ view }: { view: CheckoutView }) => (
  <div className="flex flex-col gap-4">
    <SummaryLines lines={view.lines} words={lineWords} />
    <div className="border-t border-brand-border pt-4">
      <CartSummary
        {...view.summary}
        codLimit={null}
        minimum={null}
        updating={false}
      />
    </div>
  </div>
)

/**
 * From 1024 px, the summary box on the right (05, 6.3): "Your order", the
 * lines, the summary rows and the delivery date. Sticky under the header.
 */
export const OrderSummaryBox = ({ view }: { view: CheckoutView }) => (
  <section
    aria-labelledby="checkout-summary-title"
    className="flex flex-col gap-4 rounded-card border border-brand-border-strong p-6"
    data-testid="checkout-summary-box"
  >
    <h2 id="checkout-summary-title" className="type-h3 text-brand-ink">
      {checkoutContent.yourOrder}
    </h2>
    <OrderSummaryContent view={view} />
  </section>
)

/**
 * Below 1024 px, the order summary bar (05, 6.3, `OrderSummaryDisclosure`),
 * closed by default: "Show order summary (5 pieces)", a chevron and the
 * total; open, the lines and the summary rows.
 */
export const OrderSummaryDisclosure = ({ view }: { view: CheckoutView }) => {
  const [open, setOpen] = useState(false)
  const panelId = useId()
  const { summaryBar } = checkoutContent

  return (
    <div className="-mx-4 bg-brand-surface-alt md:mx-0 md:rounded-card" data-testid="order-summary-disclosure">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
        className="flex min-h-[56px] w-full items-center gap-2 px-4 text-start type-body font-semibold text-brand-ink"
        data-testid="order-summary-toggle"
      >
        <span className="min-w-0 flex-1">
          {open
            ? summaryBar.hide
            : fill(summaryBar.show, { pieces: countWords(view.pieces, summaryBar.pieces) })}
        </span>
        <ChevronDown
          size={20}
          aria-hidden="true"
          className={clx("shrink-0 transition-transform duration-150", open && "rotate-180")}
        />
        <Amount className="type-body font-semibold">{view.summary.total}</Amount>
      </button>
      <div id={panelId} hidden={!open} className="px-4 pb-4">
        <OrderSummaryContent view={view} />
      </div>
    </div>
  )
}
