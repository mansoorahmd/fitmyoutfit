"use client"

import { useState } from "react"

import { checkoutContent } from "@content/checkout"
import { CheckoutView, linesShownFirst } from "@lib/util/checkout-view"
import { fill } from "@lib/util/wording"
import CartSummary from "@modules/cart/components/cart-summary"

import AddressSummary from "../address-summary"
import SummaryLines from "../summary-lines"

const words = checkoutContent

/**
 * "Check your order" (docs/design/05-m1-pages.md, 6.5 c), the review
 * before paying: step 1's summary with "Change", the lines (over 6, the
 * first 5 and "Show all 9"), the summary rows with the real delivery
 * amount, and the delivery date.
 */
const OrderCheck = ({ view, onChange }: { view: CheckoutView; onChange: () => void }) => {
  const [all, setAll] = useState(false)
  const first = linesShownFirst(view.lines.length)
  const lines = all ? view.lines : view.lines.slice(0, first)

  return (
    <section aria-labelledby="checkout-check-title" className="flex flex-col gap-4" data-testid="order-check">
      <h3 id="checkout-check-title" className="type-h3 text-brand-ink">
        {words.check.title}
      </h3>
      {view.address.summary && (
        <div className="flex items-start justify-between gap-3">
          <AddressSummary summary={view.address.summary} className="min-w-0 flex-1" />
          <button
            type="button"
            onClick={onChange}
            aria-label={words.address.changeLabel}
            className="min-h-[44px] min-w-[44px] px-1 type-body font-semibold text-brand-ink underline underline-offset-4 hover:decoration-2"
          >
            {words.address.change}
          </button>
        </div>
      )}
      <div className="flex flex-col gap-2 border-t border-brand-border pt-4">
        <SummaryLines
          lines={lines}
          words={{ size: words.check.size, times: words.check.times }}
          compact
          data-testid="order-check-lines"
        />
        {!all && view.lines.length > first && (
          <button
            type="button"
            onClick={() => setAll(true)}
            className="min-h-[44px] self-start px-1 type-body font-semibold text-brand-ink underline underline-offset-4"
            data-testid="show-all-lines"
          >
            {fill(words.check.showAll, { n: view.lines.length })}
          </button>
        )}
      </div>
      <div className="border-t border-brand-border pt-4">
        <CartSummary {...view.summary} codLimit={null} minimum={null} updating={false} />
      </div>
    </section>
  )
}

export default OrderCheck
