import { HttpTypes } from "@medusajs/types"

import { isListed } from "@lib/util/product-kind"

/** A garment as the header and menu link to it. */
export type GarmentLink = {
  id: string
  title: string
  /** Path without the country code. */
  href: string
  thumbnail: string | null
}

/**
 * Links for the garments collection's products, in the backend's order.
 * Products without a handle cannot be linked to, so they are left out, and
 * so is a kind that is never listed (the rush add-on, lib/util/product-kind).
 */
export const toGarmentLinks = (
  products: Pick<
    HttpTypes.StoreProduct,
    "id" | "handle" | "title" | "thumbnail" | "metadata"
  >[]
): GarmentLink[] =>
  products
    .filter((product) => !!product.handle && isListed(product))
    .map((product) => ({
      id: product.id,
      title: product.title ?? product.handle!,
      href: `/products/${product.handle}`,
      thumbnail: product.thumbnail ?? null,
    }))
