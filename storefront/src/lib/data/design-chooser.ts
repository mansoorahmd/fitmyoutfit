import type { HttpTypes } from "@medusajs/types"

import { designableProducts } from "@lib/editor/chooser"
import { listedOnly } from "@lib/util/product-kind"

import { getGarmentsCollection } from "./collections"
import { listProducts } from "./products"

export type ChooserState =
  | { kind: "ok"; products: HttpTypes.StoreProduct[] }
  | { kind: "empty" }
  | { kind: "failed" }

/**
 * The garments the 3D designer can open in this region: the garments collection's products that have a
 * model (lib/editor/products.ts), priced for the region. `empty` is a store with none to design;
 * `failed` is a store that did not answer (the page says so and offers to try again).
 */
export async function loadChooser(region: HttpTypes.StoreRegion): Promise<ChooserState> {
  try {
    const collection = await getGarmentsCollection()
    if (!collection) return { kind: "empty" }
    const {
      response: { products },
    } = await listProducts({
      regionId: region.id,
      queryParams: { collection_id: collection.id, fields: "*variants.calculated_price,+metadata" },
    })
    const designable = designableProducts(listedOnly(products ?? []))
    return designable.length > 0 ? { kind: "ok", products: designable } : { kind: "empty" }
  } catch {
    return { kind: "failed" }
  }
}
