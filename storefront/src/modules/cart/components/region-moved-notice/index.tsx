"use client"

import { useEffect, useState } from "react"

import { checkoutContent } from "@content/checkout"
import { REGION_MOVED_KEY, showsRegionMoved } from "@lib/util/region-moved"
import { fill } from "@lib/util/wording"
import Alert from "@modules/common/components/alert"

const words = checkoutContent.regionMoved

/**
 * "Your cart is now for Pakistan" (QA S1-4, D10): shown once, on the page
 * the customer lands on after the cart moved to this page's region
 * (MoveCartToRegion keeps the note). Nothing shows otherwise.
 */
const RegionMovedNotice = ({
  countryCode,
  countryName,
  currencyCode,
}: {
  countryCode: string
  countryName: string
  currencyCode: string
}) => {
  const [shown, setShown] = useState(false)

  useEffect(() => {
    try {
      const stored = sessionStorage.getItem(REGION_MOVED_KEY)
      if (stored === null) return
      sessionStorage.removeItem(REGION_MOVED_KEY)
      if (showsRegionMoved(stored, countryCode, Date.now())) setShown(true)
    } catch {
      // private mode: no note was kept, nothing to show
    }
  }, [countryCode])

  if (!shown) return null

  return (
    <Alert
      variant="info"
      icon="alert"
      announce
      title={fill(words.title, { country: countryName })}
      data-testid="region-moved-notice"
    >
      {fill(words.text, { currency: currencyCode.toUpperCase() })}
    </Alert>
  )
}

export default RegionMovedNotice
