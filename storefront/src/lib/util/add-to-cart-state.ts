import { HttpTypes } from "@medusajs/types"

export type AddToCartState = {
  label: "Out of stock" | "Add to cart"
  /** Shown as inactive, with the reason as its label; presses do nothing. */
  disabled: boolean
  /**
   * No size chosen yet. The button looks and works as usual, but a press
   * shows "Choose a size" at the size selector instead of adding.
   */
  asksForSize: boolean
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

const OUT_OF_STOCK: AddToCartState = {
  label: "Out of stock",
  disabled: true,
  asksForSize: false,
}

/**
 * Decides the label and state of the main add-to-cart button. Used by both
 * the main button and the phone's sticky bar so they cannot drift. The
 * caller still adds its own disabling (busy state, `disabled` prop).
 *
 * With no size chosen the button is not disabled: a disabled button that
 * does nothing leaves the customer guessing (docs/design/03-direction.md,
 * "Size selector", Error).
 */
export const getAddToCartState = ({
  variant,
  isValidVariant,
  needsSelection,
}: AddToCartStateInput): AddToCartState => {
  if (needsSelection) {
    return { label: "Add to cart", disabled: false, asksForSize: true }
  }
  if (!variant || !isValidVariant || !isVariantPurchasable(variant)) {
    return OUT_OF_STOCK
  }
  return { label: "Add to cart", disabled: false, asksForSize: false }
}

/**
 * Values of a product's only option that cannot be bought: no variant has
 * the value, or its variant is out of stock. The size selector shows these
 * as unavailable (still visible and still selectable, so the button can say
 * "Out of stock"). With several options availability depends on the other
 * choices, so nothing is marked.
 */
export const getUnavailableOptionValues = (
  product: Pick<HttpTypes.StoreProduct, "variants" | "options">
): string[] => {
  const options = product.options ?? []
  if (options.length !== 1) {
    return []
  }
  const [option] = options

  return (option.values ?? [])
    .map((v) => v.value)
    .filter((value) => {
      const variant = product.variants?.find((candidate) =>
        candidate.options?.some(
          (o) => o.option_id === option.id && o.value === value
        )
      )
      return !variant || !isVariantPurchasable(variant)
    })
}
