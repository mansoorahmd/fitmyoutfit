"use client"

import { useParams } from "next/navigation"
import React, { Fragment, createContext, useContext, useState } from "react"

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

/** Lets a cart line report a removal, for the "Removed … Undo" toast. */
export const useAnnounceRemoved = () => useContext(RemovedContext)

/**
 * Holds the "Removed … Undo" toast for the cart page. It sits around both
 * the cart and the empty cart, so the toast stays (and Undo still works)
 * when the last line is removed and the page turns into the empty cart.
 * Undo adds the same variant and quantity back.
 */
export const UndoToastProvider = ({ children }: { children: React.ReactNode }) => {
  const countryCode = useParams().countryCode as string
  const [removed, setRemoved] = useState<(RemovedLine & { key: string }) | null>(null)

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
      {children}
      {removed && (
        <UndoToast
          key={removed.key}
          messageKey={removed.key}
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
