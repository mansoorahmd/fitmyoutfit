"use client"

import { useCallback, useId, useRef, useState } from "react"

import { cartContent } from "@content/cart"
import { CartPageView } from "@lib/util/cart-page"
import { blocksCheckout } from "@lib/util/checkout-rules"
import { countWords, fill } from "@lib/util/wording"
import Alert from "@modules/common/components/alert"
import LocalizedClientLink from "@modules/common/components/localized-client-link"

import CartLine from "../components/cart-line"
import CartSummary from "../components/cart-summary"
import CheckoutAction from "../components/checkout-action"
import MinimumProgress from "../components/minimum-progress"
import StickyCheckoutBar, {
  useStickyCheckoutBar,
} from "../components/sticky-checkout-bar"
import { useReportBottomBar } from "../components/undo-toast/provider"
import { cartLayout } from "./layout"

/**
 * The cart page with items (docs/design/05-m1-pages.md, 4.2): the title,
 * the minimum alert in export regions, the lines, the summary, the checkout
 * button and, for guests, the sign-in line; and the sticky checkout bar on
 * phones. It keeps which lines are being saved, so the totals and the
 * button can show that a change is on its way.
 */
const CartView = ({
  lines,
  exportRegion,
  checkoutHref,
  isGuest,
  minimum,
  rulesFailed,
  ...summary
}: CartPageView) => {
  const alertRef = useRef<HTMLDivElement>(null)
  const buttonBoxRef = useRef<HTMLDivElement>(null)
  const missingId = useId()
  const [saving, setSaving] = useState<Set<string>>(() => new Set())

  const onSaving = useCallback((lineId: string, isSaving: boolean) => {
    setSaving((current) => {
      const next = new Set(current)
      if (isSaving) next.add(lineId)
      else next.delete(lineId)
      return next
    })
  }, [])

  const updating = saving.size > 0
  // The rules didn't load: no minimum anywhere, and checkout stays usable.
  const shownMinimum = rulesFailed ? null : minimum
  const blocked = blocksCheckout(shownMinimum)
  const showBar = useStickyCheckoutBar(buttonBoxRef)
  useReportBottomBar(showBar)

  const goToMinimum = () => {
    const alert = alertRef.current
    if (!alert) return
    alert.scrollIntoView?.({ block: "center" })
    alert.focus({ preventScroll: true })
  }

  return (
    <div className={cartLayout.page} data-testid="cart-container">
      <div className={cartLayout.columns}>
        <div className={cartLayout.main}>
          <h1 className="flex flex-wrap items-baseline gap-x-3 type-h1 text-brand-ink">
            {cartContent.title}
            <span
              className="font-sans type-body font-normal normal-case text-brand-ink-muted"
              data-testid="cart-piece-count"
            >
              {countWords(summary.pieces, cartContent.pieces)}
            </span>
          </h1>

          {blocked && shownMinimum && (
            <Alert
              ref={alertRef}
              focusable
              variant="info"
              icon="team"
              title={fill(cartContent.minimum.progress, {
                counted: shownMinimum.counted,
                required: shownMinimum.required,
              })}
              data-testid="cart-minimum-alert"
            >
              <MinimumProgress
                minimum={shownMinimum}
                showTitle={false}
                missingId={missingId}
                className="pt-1"
              />
            </Alert>
          )}

          <ul
            className="flex flex-col divide-y divide-brand-border border-y border-brand-border"
            data-testid="cart-lines"
          >
            {lines.map((line) => (
              <CartLine
                key={line.id}
                line={line}
                exportRegion={exportRegion}
                onSaving={onSaving}
              />
            ))}
          </ul>
        </div>

        <div className={cartLayout.aside}>
          <div className={cartLayout.summaryBox}>
            <CartSummary
              {...summary}
              minimum={shownMinimum}
              rulesFailed={rulesFailed}
              updating={updating}
            />
          </div>
          <div ref={buttonBoxRef}>
            <CheckoutAction
              href={checkoutHref}
              label={cartContent.checkout}
              blocked={blocked}
              reasonId={blocked ? missingId : undefined}
              updating={updating}
              onBlockedPress={goToMinimum}
              data-testid="checkout-button"
            />
          </div>
          {isGuest && (
            <p className="type-body text-brand-ink" data-testid="cart-sign-in">
              {cartContent.signIn.prompt}{" "}
              <LocalizedClientLink
                href={cartContent.signIn.href}
                className="inline-flex min-h-[44px] items-center font-semibold underline underline-offset-4 hover:decoration-2"
              >
                {cartContent.signIn.link}
              </LocalizedClientLink>
            </p>
          )}
        </div>
      </div>

      <StickyCheckoutBar
        show={showBar}
        total={summary.total}
        minimum={shownMinimum}
        href={checkoutHref}
        updating={updating}
        reasonId={blocked ? missingId : undefined}
        onBlockedPress={goToMinimum}
      />
    </div>
  )
}

export default CartView
