// The minimum order line on the product page (docs/design/05-m1-pages.md,
// 5.2): export regions, garments only, behind a content switch that is on
// in development only until the founders confirm the number (decision 008, 4).

import { regionMinimum } from "./checkout-rules"
import { isExportRegion } from "./cart-view"
import { productKind } from "./product-kind"

export type ProductMinimumLine = {
  /** The region's minimum: "Minimum order: {n} garment pieces." */
  required: number
  /** Garment pieces already in the cart, when there are any: "You have {counted}". */
  counted: number | null
}

export const productMinimumLine = ({
  show,
  countryCode,
  product,
  region,
  counted,
}: {
  /** productContent.minimum.show */
  show: boolean
  countryCode: string | undefined
  product: { metadata?: Record<string, unknown> | null }
  region: { metadata?: Record<string, unknown> | null } | null | undefined
  /** checkout-rules.minimum_quantity.counted, or null without a cart or rules. */
  counted: number | null | undefined
}): ProductMinimumLine | null => {
  if (!show || !isExportRegion(countryCode) || productKind(product) !== "garment") {
    return null
  }
  const required = regionMinimum(region)
  if (required === null) {
    return null
  }
  return {
    required,
    counted: typeof counted === "number" && counted > 0 ? counted : null,
  }
}
