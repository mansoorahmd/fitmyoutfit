import { HttpTypes } from "@medusajs/types"

/**
 * Label for the phone bar's button that opens the option picker:
 * "Size: M" once a size is chosen, "Choose size" before. With several
 * options it lists the chosen values ("M / Navy") or says "Choose options".
 */
export const optionSummaryLabel = (
  options: HttpTypes.StoreProductOption[] | null | undefined,
  selected: Record<string, string | undefined>
): string => {
  const list = options ?? []

  if (list.length === 1) {
    const [option] = list
    const title = option.title?.trim() || "Option"
    const value = selected[option.id]
    return value ? `${title}: ${value}` : `Choose ${title.toLowerCase()}`
  }

  const chosen = list
    .map((option) => selected[option.id])
    .filter((value): value is string => !!value)

  return chosen.length === list.length && chosen.length > 0
    ? chosen.join(" / ")
    : "Choose options"
}
