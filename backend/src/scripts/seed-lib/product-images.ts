/**
 * Product pictures: which products get which pictures, and what to set.
 * Plain TypeScript, no Medusa imports (files are read and uploaded by seed-store.ts and
 * product-picture-files.ts). A product with `files` in the seed data gets our own pictures; one
 * without keeps its stand-in web URLs.
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

export type ExistingProduct = {
  id: string
  handle: string
  thumbnail?: string | null
  images?: readonly ({ url?: string | null } | null)[] | null
}

/**
 * What a product shows now, compared with the seed:
 * - `none`: no thumbnail and no images;
 * - `stand-in`: exactly the seed's stand-in URLs (the same set of images, the first as thumbnail),
 *   what an older seed wrote;
 * - `ours`: every one of the seed's own picture files is among its images (the uploaded URL ends
 *   with the file name);
 * - `other`: anything else, for example a photo an admin uploaded or changed. Never touched.
 */
export type PictureState = "none" | "stand-in" | "ours" | "other"

function imageUrls(product: ExistingProduct): string[] {
  return (product.images ?? [])
    .map((image) => image?.url)
    .filter((url): url is string => typeof url === "string" && url !== "")
}

/** The file name at the end of a URL's path (query and fragment dropped, decoded). */
function lastSegment(url: string): string {
  const path = url.split(/[?#]/)[0]
  const segment = path.slice(path.lastIndexOf("/") + 1)
  try {
    return decodeURIComponent(segment)
  } catch {
    return segment
  }
}

/**
 * True when `url` is the upload of picture file `file`: the file storage keeps the name and puts a
 * prefix (a timestamp, an id) before it, so the last path segment is the name or ends with `-name`.
 */
export function isUploadOf(url: string, file: string): boolean {
  const segment = lastSegment(url)
  return segment === file || segment.endsWith(`-${file}`)
}

export function classifyPictures(product: ExistingProduct, seed: ProductSeed): PictureState {
  const urls = imageUrls(product)
  const thumbnail = typeof product.thumbnail === "string" ? product.thumbnail : ""
  if (thumbnail.trim() === "" && urls.length === 0) {
    return "none"
  }
  const files = seed.images.files ?? []
  if (files.length > 0 && files.every((file) => urls.some((url) => isUploadOf(url, file)))) {
    return "ours"
  }
  const standIns = seed.images.urls
  if (
    thumbnail === standIns[0] &&
    urls.length === standIns.length &&
    standIns.every((url) => urls.includes(url))
  ) {
    return "stand-in"
  }
  return "other"
}

export type PicturePlanEntry = {
  productId: string
  handle: string
  /** `fresh`: the product had no picture; `replace`: it shows exactly the old stand-ins. */
  kind: "fresh" | "replace"
  /** The seed's stand-in URLs, in order. */
  urls: string[]
  /** Our own picture files, in order; empty for a product that only has stand-ins. */
  files: string[]
}

/**
 * For every seeded product that exists, the pictures to set: our files, or the stand-in URLs.
 * A product with no picture gets them (`fresh`); one that still shows exactly the old stand-ins
 * and has files in the seed gets the files instead (`replace`). A product that already shows our
 * pictures, or anything else, is not in the plan, so a second run changes nothing. In seed-data
 * order; products in the database that are not in the seed data are ignored.
 */
export function planProductPictures(
  existing: readonly ExistingProduct[],
  seeds: readonly ProductSeed[]
): PicturePlanEntry[] {
  const existingByHandle = new Map(existing.map((p) => [p.handle, p]))
  const plan: PicturePlanEntry[] = []
  for (const seed of seeds) {
    const product = existingByHandle.get(seed.handle)
    const urls = seed.images.urls
    const files = seed.images.files ?? []
    if (!product || urls.length === 0) {
      continue
    }
    const state = classifyPictures(product, seed)
    if (state === "none") {
      plan.push({ productId: product.id, handle: product.handle, kind: "fresh", urls, files })
    } else if (state === "stand-in" && files.length > 0) {
      plan.push({ productId: product.id, handle: product.handle, kind: "replace", urls, files })
    }
  }
  return plan
}

export type PictureStep =
  | { entry: PicturePlanEntry; set: "files" }
  | { entry: PicturePlanEntry; set: "urls" }

/**
 * Settles the plan once it is known which files could not be read. An entry whose files are all
 * readable sets the files. When one is not: a `fresh` product gets its stand-in URLs (as before
 * there were our own pictures), a `replace` product is left as it is.
 */
export function settlePicturePlan(
  plan: readonly PicturePlanEntry[],
  unreadable: ReadonlySet<string>
): PictureStep[] {
  const steps: PictureStep[] = []
  for (const entry of plan) {
    if (entry.files.length > 0 && !entry.files.some((file) => unreadable.has(file))) {
      steps.push({ entry, set: "files" })
    } else if (entry.kind === "fresh") {
      steps.push({ entry, set: "urls" })
    }
  }
  return steps
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
