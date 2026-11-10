import { HttpTypes } from "@medusajs/types"

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
 * Products without a handle cannot be linked to, so they are left out.
 */
export const toGarmentLinks = (
  products: Pick<HttpTypes.StoreProduct, "id" | "handle" | "title" | "thumbnail">[]
): GarmentLink[] =>
  products
    .filter((product) => !!product.handle)
    .map((product) => ({
      id: product.id,
      title: product.title ?? product.handle!,
      href: `/products/${product.handle}`,
      thumbnail: product.thumbnail ?? null,
    }))
