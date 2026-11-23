import { HttpTypes } from "@medusajs/types"
import { clx } from "@medusajs/ui"
import Image from "next/image"

import { listingContent } from "@content/listing"
import { cardImages } from "@lib/util/card-images"
import { getProductPrice } from "@lib/util/get-product-price"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import GarmentOutline from "@modules/common/icons/garment-outline"

type HeadingLevel = 2 | 3

/** The card's frame, shared with its loading skeleton so both are the same size. */
export const cardFrameClasses =
  "flex h-full flex-col overflow-hidden rounded-card border border-brand-border-strong bg-brand-surface"

/** The 4:5 image box on surface-alt. */
export const cardImageBoxClasses = "relative aspect-[4/5] w-full bg-brand-surface-alt"

/**
 * The product card (docs/design/03-direction.md, "Product listing"), used on
 * the home page, the listing and "Complete the kit":
 * - the image at 4:5 on surface-alt with object-fit contain, so sleeves are
 *   never cropped; with a pointer, hovering swaps to the product's next
 *   image; without an image, a garment outline;
 * - the name as a heading (h3 by default; h2 where the page has no h2
 *   above the grid) and "from PKR 3,500 per piece";
 * - the whole card is one link with one focus ring. No badges.
 *
 * The photo multiplies onto the grey, so a photo shot on white blends in
 * instead of showing as a white square.
 */
export default function ProductPreview({
  product,
  headingLevel = 3,
  imageSizes = "(min-width: 1280px) 400px, (min-width: 768px) 33vw, 100vw",
  priority = false,
  href,
  footer,
  title,
  image,
}: {
  product: HttpTypes.StoreProduct
  /** Kept for the starter's call sites; the card needs only the product. */
  region?: HttpTypes.StoreRegion
  isFeatured?: boolean
  headingLevel?: HeadingLevel
  imageSizes?: string
  priority?: boolean
  /** Where the card leads, without the country code. The product's page when left out; the designer's chooser sets it. */
  href?: string
  /** A line under the price (the chooser's "Design your kit"). */
  footer?: React.ReactNode
  /** The card's name when it is not the product's (the chooser's "Jersey, V-neck"). */
  title?: string
  /** The card's picture when it is not the product's (a garment's own front picture: one address, no hover picture). */
  image?: string
}) {
  const { cheapestPrice } = getProductPrice({ product })
  const images = cardImages(product)
  const primary = image ?? images.primary
  const secondary = image ? null : images.secondary
  const Heading = `h${headingLevel}` as const
  const { pricePrefix, priceSuffix } = listingContent.card

  return (
    <LocalizedClientLink
      href={href ?? `/products/${product.handle}`}
      className={clx(
        cardFrameClasses,
        "group transition-colors duration-150 ease-out hover:border-brand-ink"
      )}
      data-testid="product-wrapper"
    >
      <div className={cardImageBoxClasses} data-testid="product-card-image">
        {primary ? (
          <div className="absolute inset-4">
            <Image
              src={primary}
              alt=""
              fill
              sizes={imageSizes}
              priority={priority}
              draggable={false}
              className={clx(
                "object-contain mix-blend-multiply transition-opacity duration-200 ease-out",
                secondary && "[@media(hover:hover)]:group-hover:opacity-0"
              )}
            />
            {secondary && (
              <Image
                src={secondary}
                alt=""
                fill
                sizes={imageSizes}
                draggable={false}
                className="hidden object-contain opacity-0 mix-blend-multiply transition-opacity duration-200 ease-out [@media(hover:hover)]:block [@media(hover:hover)]:group-hover:opacity-100"
                data-testid="product-card-hover-image"
              />
            )}
          </div>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <GarmentOutline className="w-2/5 text-brand-border-strong" />
          </div>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1 p-4">
        <Heading className="type-h3 text-brand-ink" data-testid="product-title">
          {title ?? product.title}
        </Heading>
        {cheapestPrice && (
          <p className="type-body text-brand-ink" data-testid="product-card-price">
            {/* "from PKR 3,500" and "per piece" each stay on one line */}
            <span className="whitespace-nowrap">
              {pricePrefix}{" "}
              <span className="font-semibold" data-testid="price">
                {cheapestPrice.calculated_price}
              </span>
            </span>{" "}
            <span className="whitespace-nowrap text-brand-ink-muted">{priceSuffix}</span>
          </p>
        )}
        {footer}
      </div>
    </LocalizedClientLink>
  )
}
