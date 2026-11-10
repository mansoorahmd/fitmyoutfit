"use client"

import { clx } from "@medusajs/ui"
import { RefObject, useEffect, useState } from "react"

import { showStickyBuyBar } from "@lib/util/sticky-buy-bar"
import { Button } from "@modules/common/components/button"

/**
 * Whether the phone's sticky buy bar should show: once the main button has
 * scrolled up out of view, and not while the footer is on screen. The rule
 * is in lib/util/sticky-buy-bar.ts; this only measures, at most once a frame.
 * Measuring on scroll (not only on intersection changes) keeps it right
 * after a jump, such as tapping the phone's status bar to go to the top.
 */
export const useStickyBuyBar = (
  mainButtonRef: RefObject<HTMLElement | null>
): boolean => {
  const [show, setShow] = useState(false)

  useEffect(() => {
    let frame = 0

    const update = () => {
      frame = 0
      const button = mainButtonRef.current
      const footer = document.querySelector("footer")
      const header = document.querySelector("header")
      setShow(
        showStickyBuyBar({
          mainButton: button ? button.getBoundingClientRect() : null,
          footerTop: footer ? footer.getBoundingClientRect().top : null,
          headerBottom: header
            ? Math.max(0, header.getBoundingClientRect().bottom)
            : 0,
          viewportHeight: window.innerHeight,
        })
      )
    }
    const schedule = () => {
      if (!frame) {
        frame = window.requestAnimationFrame(update)
      }
    }

    update()
    window.addEventListener("scroll", schedule, { passive: true })
    window.addEventListener("resize", schedule)
    return () => {
      window.removeEventListener("scroll", schedule)
      window.removeEventListener("resize", schedule)
      if (frame) {
        window.cancelAnimationFrame(frame)
      }
    }
  }, [mainButtonRef])

  return show
}

type StickyBuyBarProps = {
  show: boolean
  /** "M · PKR 3,500", or just the price before a size is chosen. */
  summary: string
  label: string
  disabled: boolean
  isLoading: boolean
  onPress: () => void
}

/**
 * The phone's sticky buy bar (below 1024 px; docs/design/03-direction.md,
 * "Sticky buy bar"): 64 px plus the safe-area inset, on `surface` with a top
 * border. The chosen size and the price on the left, the main button on the
 * right, at least 160 px wide but not full width. While hidden it slides
 * below the screen and is inert, so it can't be tabbed to.
 */
const StickyBuyBar = ({
  show,
  summary,
  label,
  disabled,
  isLoading,
  onPress,
}: StickyBuyBarProps) => (
  <div
    className={clx(
      "fixed inset-x-0 bottom-0 z-40 border-t border-brand-border bg-brand-surface pb-[env(safe-area-inset-bottom)] lg:hidden",
      "transition-transform duration-200 ease-out",
      show ? "translate-y-0" : "pointer-events-none translate-y-full"
    )}
    inert={!show}
    data-visible={show ? "true" : "false"}
    data-testid="mobile-actions"
  >
    <div className="content-container flex h-16 items-center justify-between gap-4">
      <p
        className="min-w-0 truncate type-body font-semibold text-brand-ink"
        data-testid="mobile-summary"
      >
        {summary}
      </p>
      <Button
        onClick={onPress}
        disabled={disabled}
        isLoading={isLoading}
        loadingText="Adding…"
        className="min-w-[160px] shrink-0"
        data-testid="mobile-cart-button"
      >
        {label}
      </Button>
    </div>
  </div>
)

export default StickyBuyBar
