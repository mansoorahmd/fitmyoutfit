import { HttpTypes } from "@medusajs/types"

// What each kind of product gets in the store, in one place. Every product
// carries `metadata.kind` (docs/contracts/sprint-0-dev-setup.md): "garment"
// for the jersey, T-shirt and jacket, "fit_kit" and "rush_add_on" for the
// extras. Decide by kind here, never by handle, and keep `kind` checks out of
// the components and pages.

export type ProductKind = "garment" | "fit_kit" | "rush_add_on"

type ProductLike = Pick<HttpTypes.StoreProduct, "metadata">

export type KindRules = {
  /** Has a product page of its own. Without one its URL is not found (404). */
  page: boolean
  /**
   * May be shown in the listings, "Complete the kit" and the header and
   * footer links. Which products those show is still decided by the garments
   * collection; this only keeps out a kind that must never be listed,
   * wherever it is filed. A listed kind always has a page.
   */
  listed: boolean
  /** Shows the facts boxes (delivery, replacement, sizes) under the main button. */
  facts: boolean
  /** Its price reads "per piece". */
  perPiece: boolean
}

const RULES: Record<ProductKind, KindRules> = {
  garment: { page: true, listed: true, facts: true, perPiece: true },
  // A refundable deposit for a set of sizes: a page, but no garment facts.
  fit_kit: { page: true, listed: true, facts: false, perPiece: false },
  // Priced as a percentage of an order and never bought alone: no page.
  rush_add_on: { page: false, listed: false, facts: false, perPiece: false },
}

/** A product with no kind, or one this store does not know: a page, no facts. */
const NO_KIND: KindRules = { page: true, listed: true, facts: false, perPiece: true }

const isKind = (value: unknown): value is ProductKind =>
  typeof value === "string" && Object.prototype.hasOwnProperty.call(RULES, value)

/** The product's `kind` metadata, or undefined when it has none this store knows. */
export const productKind = (
  product: ProductLike | null | undefined
): ProductKind | undefined => {
  const kind = product?.metadata?.kind
  return isKind(kind) ? kind : undefined
}

/** The rules for the product's kind. */
export const kindRules = (product: ProductLike | null | undefined): KindRules => {
  const kind = productKind(product)
  return kind ? RULES[kind] : NO_KIND
}

/** Whether the product has a page of its own (the rush add-on has none). */
export const hasProductPage = (product: ProductLike | null | undefined): boolean =>
  kindRules(product).page

/** Whether the product may appear in a list of products or links. */
export const isListed = (product: ProductLike | null | undefined): boolean =>
  kindRules(product).listed

/** The products that may be listed, in their order. */
export const listedOnly = <P extends ProductLike>(products: P[]): P[] =>
  products.filter(isListed)
