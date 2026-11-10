/**
 * Placeholder product images: which products get them, and what to set.
 * Plain TypeScript, no Medusa imports. The images are web URLs in the seed data; nothing is
 * uploaded or generated.
 */
import type { ProductSeed } from "../seed-data/types"

/** The parts of an existing product this decision looks at. */
export type ProductPictureState = {
  thumbnail?: string | null
  images?: readonly unknown[] | null
}

/**
 * True when the product has no picture at all: no thumbnail and no images.
 * A product with a thumbnail, or with images an admin uploaded (even without choosing a
 * thumbnail), is left alone, so a real photo is never replaced by a placeholder.
 */
export function needsPlaceholderImage(product: ProductPictureState): boolean {
  const hasThumbnail = typeof product.thumbnail === "string" && product.thumbnail.trim() !== ""
  const hasImages = (product.images ?? []).length > 0
  return !hasThumbnail && !hasImages
}

export type ExistingProduct = ProductPictureState & { id: string; handle: string }

export type ImagePlanEntry = {
  productId: string
  handle: string
  /** The first URL of the seed list. */
  thumbnail: string
  /** Every URL of the seed list, in order. */
  images: { url: string }[]
}

/**
 * For every seeded product that exists and has no picture, the thumbnail and images to set.
 * In seed-data order. Products in the database that are not in the seed data are ignored.
 */
export function planPlaceholderImages(
  existing: readonly ExistingProduct[],
  seeds: readonly ProductSeed[]
): ImagePlanEntry[] {
  const existingByHandle = new Map(existing.map((p) => [p.handle, p]))
  const plan: ImagePlanEntry[] = []
  for (const seed of seeds) {
    const product = existingByHandle.get(seed.handle)
    const urls = seed.images.urls
    if (product && urls.length > 0 && needsPlaceholderImage(product)) {
      plan.push({
        productId: product.id,
        handle: product.handle,
        thumbnail: urls[0],
        images: urls.map((url) => ({ url })),
      })
    }
  }
  return plan
}

/** True for an absolute `https://` URL with a host. */
export function isHttpsUrl(value: unknown): boolean {
  if (typeof value !== "string" || value !== value.trim()) {
    return false
  }
  try {
    const url = new URL(value)
    return url.protocol === "https:" && url.hostname !== ""
  } catch {
    return false
  }
}
