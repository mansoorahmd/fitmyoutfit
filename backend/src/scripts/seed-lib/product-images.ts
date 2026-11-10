/**
 * Placeholder product images: which products need one, and the MIME type of an image file.
 * Plain TypeScript, no Medusa imports. The seed asks Medusa for the products, passes them in
 * here, and uploads and links only what this returns.
 */
import type { ProductSeed } from "../seed-data/types"

/** Image file extensions the seed accepts, with their MIME types (all work in `next/image`). */
const MIME_TYPES: Record<string, string> = {
  png: "image/png",
  webp: "image/webp",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
}

/** MIME type for an image file name, or undefined when the extension is not supported. */
export function imageMimeType(fileName: string): string | undefined {
  const match = /\.([a-z0-9]+)$/i.exec(fileName)
  return match ? MIME_TYPES[match[1].toLowerCase()] : undefined
}

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
  /** File name in the seed images folder. */
  image: string
}

/**
 * For every seeded product that exists and has no picture, the image to upload for it.
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
    if (product && needsPlaceholderImage(product)) {
      plan.push({ productId: product.id, handle: product.handle, image: seed.image })
    }
  }
  return plan
}
