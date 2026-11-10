import { HttpTypes } from "@medusajs/types"

import { FIT_KIT_HANDLE, ProductFact } from "@content/product"
import { forRegion } from "@lib/util/home-regions"

// Plain decisions for the product page, kept out of the components so they
// can be unit tested.

type ProductLike = Pick<HttpTypes.StoreProduct, "handle" | "metadata">

/** The product's `kind` metadata (docs/contracts/sprint-0-dev-setup.md). */
const kindOf = (product: ProductLike): string | undefined => {
  const kind = product.metadata?.kind
  return typeof kind === "string" ? kind : undefined
}

/**
 * Whether "Complete the kit" can have anything to show: related products
 * are found by collection or tags, so a product with neither (the fit kit,
 * the rush add-on) has none, and the page leaves the block out entirely.
 */
export const hasRelatedProducts = (
  product: Pick<HttpTypes.StoreProduct, "collection_id" | "tags">
): boolean => !!product.collection_id || !!product.tags?.length

/** The fit kit, found by its `kind` metadata, or by its handle without it. */
export const isFitKit = (product: ProductLike): boolean =>
  kindOf(product) === "fit_kit" || product.handle === FIT_KIT_HANDLE

/**
 * "per piece" belongs to garments. The fit kit (a refundable deposit for a
 * set) and the rush add-on are not sold per piece.
 */
export const showsPerPiece = (product: ProductLike): boolean => {
  const kind = kindOf(product)
  return kind !== "fit_kit" && kind !== "rush_add_on"
}

/**
 * The facts boxes a visitor sees: by region (export regions add the
 * shipping box), and without the fit-kit box on the fit kit's own page.
 */
export const factsFor = (
  facts: ProductFact[],
  countryCode: string | undefined,
  product: ProductLike
): ProductFact[] =>
  forRegion(facts, countryCode).filter(
    (fact) => !(fact.hideOnFitKit && isFitKit(product))
  )

/**
 * The "tax not final" note shows until the region's metadata says its tax is
 * final (`tax_final: true`). Every region starts with `tax_final: false`.
 */
export const showsTaxNote = (
  region: Pick<HttpTypes.StoreRegion, "metadata"> | null | undefined
): boolean => region?.metadata?.tax_final !== true

/**
 * True when the variants do not all cost the same. Only then does the price
 * read "from …" before a size is chosen.
 */
export const hasPriceRange = (
  product: Pick<HttpTypes.StoreProduct, "variants">
): boolean => {
  const amounts = new Set(
    (product.variants ?? [])
      .map((v) => v.calculated_price?.calculated_amount)
      .filter((amount): amount is number => typeof amount === "number")
  )
  return amounts.size > 1
}

/** The product's description, or null when it is empty. */
export const descriptionOf = (
  product: Pick<HttpTypes.StoreProduct, "description">
): string | null => {
  const text = product.description?.trim()
  return text ? text : null
}

export type DetailRow = { label: string; value: string }

/**
 * Rows for "Fabric and decoration": only those the product has data for,
 * never a placeholder such as "-". No rows means no section.
 */
export const fabricRows = (
  product: Pick<HttpTypes.StoreProduct, "material">,
  labels: { material: string }
): DetailRow[] => {
  const rows: DetailRow[] = []
  const material = product.material?.trim()
  if (material) {
    rows.push({ label: labels.material, value: material })
  }
  return rows
}
