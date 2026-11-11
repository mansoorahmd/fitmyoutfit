"use client"

import { useEffect, useRef } from "react"

import AddedToCart from "@modules/cart/components/added-to-cart"
import { useAddedToCart } from "@modules/cart/components/added-to-cart/context"
import CartLink from "@modules/layout/components/cart-link"

/**
 * The header's cart (docs/design/05-m1-pages.md, 4.7): a link to the cart
 * at every width, and from 1024 px the "Added to your cart" popover under
 * it, only after an add. It replaces the starter's hover dropdown. The
 * popover is not modal and leaves focus on the add button; it closes on
 * Esc, a click outside, "Keep shopping", its close button or a page change,
 * and has no timer.
 */
const CartPanel = ({ count }: { count: number }) => {
  const { added, dismiss } = useAddedToCart()
  const panelRef = useRef<HTMLDivElement>(null)
  const open = added?.placement === "popover"

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") dismiss()
    }
    const onPointer = (event: PointerEvent) => {
      const panel = panelRef.current
      if (panel && !panel.contains(event.target as Node)) dismiss()
    }
    document.addEventListener("keydown", onKey)
    document.addEventListener("pointerdown", onPointer)
    return () => {
      document.removeEventListener("keydown", onKey)
      document.removeEventListener("pointerdown", onPointer)
    }
  }, [open, dismiss])

  return (
    <div className="relative">
      <CartLink count={count} />
      {open && added && (
        <div
          ref={panelRef}
          className="absolute right-0 top-[calc(100%+18px)] z-50 hidden w-[400px] lg:block xl:top-[calc(100%+22px)]"
        >
          <AddedToCart key={added.view.key} view={added.view} variant="popover" onClose={dismiss} />
        </div>
      )}
    </div>
  )
}

export default CartPanel
