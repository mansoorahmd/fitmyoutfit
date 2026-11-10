import { HttpTypes } from "@medusajs/types"

import { productContent } from "@content/product"
import { getProductPrice } from "@lib/util/get-product-price"
import { isPakistan } from "@lib/util/home-regions"
import {
  hasPriceRange,
  showsPerPiece,
  showsTaxNote,
} from "@lib/util/product-page"

/**
 * The price block (docs/design/03-direction.md, "Product page" 4): the price
 * in the region's currency ("PKR 3,500") and "per piece", styled like the
 * product card's price; "Tax not final" while the region's tax is not final;
 * and in export regions "Shipping and duties included". No minimum is shown
 * until the founders set it (decision 007).
 */
export default function ProductPrice({
  product,
  variant,
  region,
  countryCode,
}: {
  product: HttpTypes.StoreProduct
  variant?: HttpTypes.StoreProductVariant
  region?: Pick<HttpTypes.StoreRegion, "metadata"> | null
  countryCode?: string
}) {
  const { cheapestPrice, variantPrice } = getProductPrice({
    product,
    variantId: variant?.id,
  })
  const { fromPrefix, perPiece, originalPrice, taxNote, exportNote } =
    productContent.price

  const selectedPrice = variant ? variantPrice : cheapestPrice

  if (!selectedPrice) {
    // A grey bar the width of a price, so nothing moves when it arrives.
    return (
      <div
        className="h-8 w-40 animate-pulse rounded-control bg-brand-surface-alt"
        data-testid="price-skeleton"
      />
    )
  }

  const showFrom = !variant && hasPriceRange(product)

  return (
    <div className="flex flex-col gap-1" data-testid="price-block">
      <p className="flex flex-wrap items-baseline gap-x-2 text-brand-ink">
        {selectedPrice.price_type === "sale" && (
          <span className="type-body text-brand-ink-muted">
            <span className="sr-only">{originalPrice} </span>
            <span
              className="line-through"
              data-testid="original-product-price"
              data-value={selectedPrice.original_price_number}
            >
              {selectedPrice.original_price}
            </span>
          </span>
        )}
        <span className="whitespace-nowrap font-sans text-[24px] font-semibold leading-8">
          {showFrom && (
            <span className="type-body font-normal">{fromPrefix} </span>
          )}
          <span
            data-testid="product-price"
            data-value={selectedPrice.calculated_price_number}
          >
            {selectedPrice.calculated_price}
          </span>
        </span>
        {showsPerPiece(product) && (
          <span className="whitespace-nowrap type-body text-brand-ink-muted">
            {perPiece}
          </span>
        )}
      </p>
      {showsTaxNote(region) && (
        <p className="type-small text-brand-ink-muted" data-testid="tax-note">
          {taxNote}
        </p>
      )}
      {!!countryCode && !isPakistan(countryCode) && (
        <p
          className="type-small font-semibold text-brand-ink"
          data-testid="export-note"
        >
          {exportNote}
        </p>
      )}
    </div>
  )
}
