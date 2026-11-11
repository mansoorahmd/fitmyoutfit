"use client"

import { clx } from "@medusajs/ui"
import { RefObject, useEffect, useState } from "react"

import { cartContent } from "@content/cart"
import { MinimumView } from "@lib/util/checkout-rules"
import { showStickyCheckoutBar } from "@lib/util/sticky-buy-bar"
import { fill } from "@lib/util/wording"
import Amount from "@modules/common/components/amount"

import CheckoutAction from "../checkout-action"

/**
 * Whether the cart's sticky bar shows: while the summary's checkout button
 * is not wholly on screen and the footer is not showing. The rule is in
 * lib/util/sticky-buy-bar.ts; this only measures, at most once a frame.
 */
export const useStickyCheckoutBar = (
  buttonRef: RefObject<HTMLElement | null>
): boolean => {
  const [show, setShow] = useState(false)

  useEffect(() => {
    let frame = 0
    const update = () => {
      frame = 0
      const button = buttonRef.current
      const footer = document.querySelector("footer")
      const header = document.querySelector("header")
      setShow(
        showStickyCheckoutBar({
          checkoutButton: button ? button.getBoundingClientRect() : null,
          footerTop: footer ? footer.getBoundingClientRect().top : null,
          headerBottom: header ? Math.max(0, header.getBoundingClientRect().bottom) : 0,
          viewportHeight: window.innerHeight,
        })
      )
    }
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(update)
    }
    update()
    window.addEventListener("scroll", schedule, { passive: true })
    window.addEventListener("resize", schedule)
    return () => {
      window.removeEventListener("scroll", schedule)
      window.removeEventListener("resize", schedule)
      if (frame) window.cancelAnimationFrame(frame)
    }
  }, [buttonRef])

  return show
}

/**
 * The cart's sticky checkout bar below 1024 px (docs/design/05-m1-pages.md,
 * 4.2): 64 px plus the safe-area inset. "Total" over the amount on the
 * left, or "7 of 10 pieces" below the minimum; "Checkout" on the right, at
 * least 160 px wide, inactive below the minimum. Hidden, it is inert.
 */
const StickyCheckoutBar = ({
  show,
  total,
  minimum,
  href,
  updating,
  reasonId,
  onBlockedPress,
}: {
  show: boolean
  total: string
  minimum: MinimumView | null
  href: string
  updating: boolean
  reasonId?: string
  onBlockedPress: () => void
}) => {
  const blocked = !!minimum && !minimum.reached

  return (
    <div
      className={clx(
        "fixed inset-x-0 bottom-0 z-40 border-t border-brand-border bg-brand-surface pb-[env(safe-area-inset-bottom)] lg:hidden",
        "transition-[transform,visibility] duration-200 ease-out",
        show ? "visible translate-y-0" : "pointer-events-none invisible translate-y-full"
      )}
      inert={!show}
      data-visible={show ? "true" : "false"}
      data-testid="sticky-checkout-bar"
    >
      <div className="content-container flex h-[63px] items-center justify-between gap-4">
        {blocked ? (
          <p className="min-w-0 type-body font-semibold text-brand-ink">
            {fill(cartContent.minimum.progress, {
              counted: minimum.counted,
              required: minimum.required,
            })}
          </p>
        ) : (
          <p className="flex min-w-0 flex-col">
            <span className="type-caption text-brand-ink-muted">
              {cartContent.summary.total}
            </span>
            <Amount loading={updating} className="type-body font-semibold text-brand-ink">
              {total}
            </Amount>
          </p>
        )}
        <CheckoutAction
          href={href}
          label={cartContent.checkoutShort}
          blocked={blocked}
          reasonId={reasonId}
          updating={updating}
          onBlockedPress={onBlockedPress}
          fullWidth={false}
          className="min-w-[160px] shrink-0"
          data-testid="sticky-checkout-button"
        />
      </div>
    </div>
  )
}

export default StickyCheckoutBar
