"use client"

import { useRouter } from "next/navigation"
import React, { useEffect, useRef, useState, useTransition } from "react"

import { moveCartToRegion } from "@lib/data/cart"
import ServerError from "@modules/common/components/server-error"

/**
 * Shown instead of a cart page or checkout whose cart belongs to another
 * region than the URL's (the visitor typed /pk/cart with a UK cart). The
 * cart page's spec has no answer for this (05, 4.6, "Region changed with
 * items in the cart": out of scope), so the cart is moved to the URL's
 * region, with the same cart update the region selector makes, and the
 * page is read again: one region's cart never shows under another
 * region's URL. Meanwhile the page's own skeleton shows; if the move
 * fails, the server-error block.
 */
const MoveCartToRegion = ({
  countryCode,
  fallback,
}: {
  countryCode: string
  /** The page's loading skeleton, shown while the cart moves. */
  fallback: React.ReactNode
}) => {
  const router = useRouter()
  const [failed, setFailed] = useState(false)
  const [moved, setMoved] = useState(false)
  const [refreshing, startTransition] = useTransition()
  const started = useRef(false)

  useEffect(() => {
    if (started.current) return
    started.current = true
    moveCartToRegion(countryCode)
      .then((ok) => {
        if (!ok) {
          setFailed(true)
          return
        }
        setMoved(true)
        startTransition(() => router.refresh())
      })
      .catch(() => setFailed(true))
  }, [countryCode, router])

  // Moved and read again, yet still shown: the cart didn't follow. Say so
  // instead of moving it again in a loop.
  useEffect(() => {
    if (moved && !refreshing) setFailed(true)
  }, [moved, refreshing])

  return failed ? <ServerError /> : <div data-testid="moving-cart">{fallback}</div>
}

export default MoveCartToRegion
