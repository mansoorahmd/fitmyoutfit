import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import StickyBuyBar from "@modules/products/components/product-actions/sticky-buy-bar"

const bar = (show: boolean, onPress = vi.fn()) =>
  render(
    <StickyBuyBar
      show={show}
      summary="M · PKR 3,500"
      label="Add to cart"
      loadingLabel="Adding…"
      disabled={false}
      isLoading={false}
      onPress={onPress}
    />
  )

describe("sticky buy bar", () => {
  it("is phone-only, fixed to the bottom on surface with a top border and the safe-area inset", () => {
    bar(true)
    const root = screen.getByTestId("mobile-actions")
    expect(root).toHaveClass(
      "fixed",
      "bottom-0",
      "lg:hidden",
      "bg-brand-surface",
      "border-t",
      "pb-[env(safe-area-inset-bottom)]"
    )
    // 63 px row plus the 1 px border
    expect(root.firstElementChild).toHaveClass("h-[63px]")
  })

  it("shows the summary on the left and a button at least 160 px wide, not full width", () => {
    const onPress = vi.fn()
    bar(true, onPress)
    expect(screen.getByTestId("mobile-summary")).toHaveTextContent("M · PKR 3,500")
    const button = screen.getByTestId("mobile-cart-button")
    expect(button).toHaveClass("min-w-[160px]")
    expect(button).not.toHaveClass("w-full")
    fireEvent.click(button)
    expect(onPress).toHaveBeenCalledTimes(1)
  })

  it("when hidden is slid away, invisible and inert, so it can't be seen or tabbed to", () => {
    bar(false)
    const root = screen.getByTestId("mobile-actions")
    expect(root).toHaveAttribute("data-visible", "false")
    expect(root).toHaveClass("invisible", "translate-y-full", "pointer-events-none")
    expect(root).toHaveAttribute("inert")
  })

  it("when shown is visible and not inert", () => {
    bar(true)
    const root = screen.getByTestId("mobile-actions")
    expect(root).toHaveAttribute("data-visible", "true")
    expect(root).toHaveClass("visible", "translate-y-0")
    expect(root).not.toHaveAttribute("inert")
  })
})
