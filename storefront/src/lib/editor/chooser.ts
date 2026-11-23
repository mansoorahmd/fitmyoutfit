// The garment chooser's data (/design): which of the store's products the 3D designer knows, and one card per
// garment of them, in the order of lib/editor/products.ts. Plain functions; the page fetches the products.

import type { HttpTypes } from "@medusajs/types"

import { editorAssetUrl } from "./asset-path"
import { designPath } from "./paths"
import { editorHandles, editorProductFor, type EditorGarment } from "./products"

type ProductLike = Pick<HttpTypes.StoreProduct, "handle">

/** The products that have a designer, in the designer's own order. Nothing else is listed, whatever the collection holds. */
export function designableProducts<T extends ProductLike>(products: readonly T[] | null | undefined): T[] {
  const byHandle = new Map((products ?? []).filter((p) => !!p.handle).map((p) => [p.handle as string, p]))
  return editorHandles().flatMap((handle) => {
    const product = byHandle.get(handle)
    return product ? [product] : []
  })
}

/**
 * Where a chooser card leads, without the country code. A product with several garments (the jersey's two necks) names
 * the garment, so the designer opens on it; a product with one needs no name.
 */
export function chooserCardHref(handle: string, garmentId?: string): string {
  const entry = editorProductFor(handle)
  return garmentId && entry && entry.garments.length > 1 && entry.garments.some((g) => g.definition === garmentId)
    ? designPath(handle, garmentId)
    : designPath(handle)
}

/** One chooser card: a garment of a store product. */
export type ChooserCard<T extends ProductLike> = {
  /** The editor product id of the garment (the key of a saved design). */
  garmentId: string
  /** The garment's name ("Jersey, V-neck"): the card's title. */
  name: string
  /** The garment's own front picture, served by the store; undefined: the card shows the Medusa product's thumbnail. */
  picture?: string
  /** Where the card leads, without the country code. */
  href: string
  /** The store product: its "from" price, and its thumbnail when the garment has no picture of its own. */
  product: T
}

/** One card per garment of the products that have a designer: the products in the designer's order, each one's garments in theirs. */
export function chooserCards<T extends ProductLike>(products: readonly T[] | null | undefined): ChooserCard<T>[] {
  return designableProducts(products).flatMap((product) => {
    const entry = editorProductFor(product.handle)
    return (entry?.garments ?? []).map((garment: EditorGarment) => ({
      garmentId: garment.definition,
      name: garment.name,
      ...(garment.productPicture ? { picture: editorAssetUrl(garment.productPicture) } : {}),
      href: chooserCardHref(product.handle as string, garment.definition),
      product,
    }))
  })
}

/** The chooser's address, without the country code. */
export const CHOOSER_PATH = "/design"
