// The garment chooser's data (/design): which of the store's products the 3D designer knows, in
// the order of lib/editor/products.ts. Plain functions; the page fetches the products.

import type { HttpTypes } from "@medusajs/types"

import { editorHandles } from "./products"
import { designPath } from "./paths"

type ProductLike = Pick<HttpTypes.StoreProduct, "handle">

/** The products that have a designer, in the designer's own order. Nothing else is listed, whatever the collection holds. */
export function designableProducts<T extends ProductLike>(products: readonly T[] | null | undefined): T[] {
  const byHandle = new Map((products ?? []).filter((p) => !!p.handle).map((p) => [p.handle as string, p]))
  return editorHandles().flatMap((handle) => {
    const product = byHandle.get(handle)
    return product ? [product] : []
  })
}

/** Where a chooser card leads, without the country code. */
export const chooserCardHref = (handle: string): string => designPath(handle)

/** The chooser's address, without the country code. */
export const CHOOSER_PATH = "/design"
