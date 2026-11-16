"use client"

import { clx } from "@medusajs/ui"
import { useState } from "react"

import { checkoutContent } from "@content/checkout"
import { CheckoutView, linesShownFirst } from "@lib/util/checkout-view"
import { fill } from "@lib/util/wording"
import CartSummary from "@modules/cart/components/cart-summary"

import { checkoutLayout } from "../../templates/checkout-page/layout"
import SummaryLines from "../summary-lines"

const words = checkoutContent

/**
 * "Check your order", the review before paying: the lines (over 6, the
 * first 5 and "Show all 9") and the summary rows with the real delivery
 * amount and the total.
 *
 * This departs from the specification (docs/design/05-m1-pages.md, 6.5 c)
 * by the coordinator's decision of 12 Nov (defect D8 of the ninth QA
 * review), so that step 2 says each thing once:
 * - no contact, no delivery address and no "Change": step 1's summary,
 *   directly above, has them;
 * - no "Delivered by …" line: step 2's delivery block has it;
 * - shown only where the order summary is collapsed behind "Show order
 *   summary" (`checkoutLayout.summaryCollapsed`, below 1024 px). Where the
 *   "Your order" box stands beside the steps, the box is the check and this
 *   block, heading included, is not displayed.
 */
const OrderCheck = ({ view }: { view: CheckoutView }) => {
  const [all, setAll] = useState(false)
  const first = linesShownFirst(view.lines.length)
  const lines = all ? view.lines : view.lines.slice(0, first)

  return (
    <section
      aria-labelledby="checkout-check-title"
      className={clx("flex flex-col gap-4", checkoutLayout.summaryCollapsed)}
      data-testid="order-check"
    >
      <h3 id="checkout-check-title" className="type-h3 text-brand-ink">
        {words.check.title}
      </h3>
      <div className="flex flex-col gap-2">
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
        <CartSummary {...view.summary} deliveryDate={null} codLimit={null} minimum={null} updating={false} />
      </div>
    </section>
  )
}

export default OrderCheck
