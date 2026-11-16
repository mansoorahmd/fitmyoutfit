"use client"

import { useRouter } from "next/navigation"
import React, { useEffect, useRef, useState, useTransition } from "react"

import { moveCartToRegion } from "@lib/data/cart"
import { REGION_MOVED_KEY, regionMovedNote } from "@lib/util/region-moved"
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
 *
 * After the move the page the customer lands on says once that the cart is
 * now for this country (RegionMovedNotice, QA S1-4, D10). `then`: where to
 * go instead of reading the page again; the checkout passes its step 1,
 * since the address and delivery belong to the old region and the URL
 * must show the step that is open.
 */
const MoveCartToRegion = ({
  countryCode,
  fallback,
  then,
}: {
  countryCode: string
  /** The page's loading skeleton, shown while the cart moves. */
  fallback: React.ReactNode
  /** The page to open once the cart has moved; by default this one, read again. */
  then?: string
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
        try {
          sessionStorage.setItem(REGION_MOVED_KEY, regionMovedNote(countryCode, Date.now()))
        } catch {
          // private mode: the notice is left out
        }
        setMoved(true)
        startTransition(() => (then ? router.replace(then) : router.refresh()))
      })
      .catch(() => setFailed(true))
  }, [countryCode, router, then])

  // Moved and read again, yet still shown: the cart didn't follow. Say so
  // instead of moving it again in a loop.
  useEffect(() => {
    if (moved && !refreshing) setFailed(true)
  }, [moved, refreshing])

  return failed ? <ServerError /> : <div data-testid="moving-cart">{fallback}</div>
}

export default MoveCartToRegion
