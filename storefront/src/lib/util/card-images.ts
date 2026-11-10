import { HttpTypes } from "@medusajs/types"

export type CardImages = {
  /** The image the card shows; null shows the placeholder. */
  primary: string | null
  /** Shown on hover with a pointer: the product's next image (often the back view). */
  secondary: string | null
}

/**
 * The card's images: the thumbnail (or the first image when there is no
 * thumbnail), then the first other image. The seed's first image is usually
 * the thumbnail itself, so the same photo is never used twice.
 */
export const cardImages = (
  product: Pick<HttpTypes.StoreProduct, "thumbnail" | "images">
): CardImages => {
  const urls = (product.images ?? [])
    .map((image) => image?.url)
    .filter((url): url is string => !!url)
  const primary = product.thumbnail || urls[0] || null
  const secondary = urls.find((url) => url !== primary) ?? null

  return { primary, secondary: primary ? secondary : null }
}
