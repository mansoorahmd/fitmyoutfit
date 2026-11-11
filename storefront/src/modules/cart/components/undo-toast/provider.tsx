"use client"

import { useParams } from "next/navigation"
import React, {
  Fragment,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react"

import { cartContent } from "@content/cart"
import { addToCart } from "@lib/data/cart"
import { fillParts } from "@lib/util/wording"

import UndoToast from "."

export type RemovedLine = {
  title: string
  size: string | null
  quantity: number
  variantId: string | null
}

const RemovedContext = createContext<(removed: RemovedLine) => void>(() => {})
const BottomBarContext = createContext<(shown: boolean) => void>(() => {})

/** Lets a cart line report a removal, for the "Removed … Undo" toast. */
export const useAnnounceRemoved = () => useContext(RemovedContext)

/**
 * Tells the toast whether the sticky checkout bar is showing at the foot of
 * the screen, so the toast sits above the bar, or at the foot when there is
 * none (the empty cart, or from 1024 px).
 */
export const useReportBottomBar = (shown: boolean) => {
  const report = useContext(BottomBarContext)
  useEffect(() => {
    report(shown)
    return () => report(false)
  }, [report, shown])
}

/**
 * Holds the "Removed … Undo" toast for the cart page. It sits around both
 * the cart and the empty cart, so the toast stays (and Undo still works)
 * when the last line is removed and the page turns into the empty cart.
 * Undo adds the same variant and quantity back.
 */
export const UndoToastProvider = ({ children }: { children: React.ReactNode }) => {
  const countryCode = useParams().countryCode as string
  const [removed, setRemoved] = useState<(RemovedLine & { key: string }) | null>(null)
  const [barShown, setBarShown] = useState(false)
  const reportBar = useCallback((shown: boolean) => setBarShown(shown), [])

  const undo = async () => {
    if (!removed?.variantId) return false
    try {
      await addToCart({
        variantId: removed.variantId,
        quantity: removed.quantity,
        countryCode,
      })
      return true
    } catch {
      return false
    }
  }

  const message = removed
    ? fillParts(removed.size ? cartContent.removed.text : cartContent.removed.textNoSize, {
        title: <bdi>{removed.title}</bdi>,
        size: removed.size ?? "",
        quantity: removed.quantity,
      }).map((part, index) => <Fragment key={index}>{part}</Fragment>)
    : null

  return (
    <RemovedContext.Provider
      value={(line) => setRemoved({ ...line, key: `${line.variantId}:${Date.now()}` })}
    >
      <BottomBarContext.Provider value={reportBar}>{children}</BottomBarContext.Provider>
      {removed && (
        <UndoToast
          key={removed.key}
          messageKey={removed.key}
          aboveBar={barShown}
          message={message}
          actionLabel={cartContent.removed.undo}
          closeLabel={cartContent.removed.close}
          errorText={cartContent.removed.undoError}
          onAction={undo}
          onClose={() => setRemoved(null)}
        />
      )}
    </RemovedContext.Provider>
  )
}
