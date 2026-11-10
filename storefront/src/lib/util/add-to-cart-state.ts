import { HttpTypes } from "@medusajs/types"

export type AddToCartState = {
  label: "Select a size" | "Out of stock" | "Add to cart"
  disabled: boolean
}

type AddToCartStateInput = {
  /** The variant the current selection resolves to, if any. */
  variant: HttpTypes.StoreProductVariant | undefined
  /** Whether the selected options match one of the product's variants. */
  isValidVariant: boolean | undefined
  /** True while the customer still has to choose before a variant can exist. */
  needsSelection: boolean
}

/** Can this variant be bought? Made-to-order variants do not manage inventory. */
export const isVariantPurchasable = (
  variant: HttpTypes.StoreProductVariant
): boolean =>
  !variant.manage_inventory ||
  !!variant.allow_backorder ||
  (variant.inventory_quantity || 0) > 0

/**
 * True when the product has several variants and the customer has not yet
 * chosen a value for every option. A single-variant product never needs a
 * selection (it is preselected).
 */
export const needsVariantSelection = (
  product: Pick<HttpTypes.StoreProduct, "variants" | "options">,
  selected: Record<string, string | undefined>
): boolean => {
  if ((product.variants?.length ?? 0) <= 1) {
    return false
  }
  return (product.options ?? []).some((option) => !selected[option.id])
}

/**
 * Decides the label and enabled state of the main add-to-cart button. Used by
 * both the desktop button and the mobile actions bar so they cannot drift.
 * The caller still adds its own disabling (busy state, `disabled` prop).
 */
export const getAddToCartState = ({
  variant,
  isValidVariant,
  needsSelection,
}: AddToCartStateInput): AddToCartState => {
  if (!variant) {
    return needsSelection
      ? { label: "Select a size", disabled: true }
      : { label: "Out of stock", disabled: true }
  }
  if (!isValidVariant || !isVariantPurchasable(variant)) {
    return { label: "Out of stock", disabled: true }
  }
  return { label: "Add to cart", disabled: false }
}
