// Which sizes are youth and which are adult, and the order they are shown in.
// This is the only place that knows; the size selector asks here instead of
// testing values itself. See docs/design/03-direction.md, "Size selector".

export const YOUTH_SIZES = ["YS", "YM", "YL", "YXL"] as const
export const ADULT_SIZES = ["XS", "S", "M", "L", "XL", "2XL", "3XL"] as const

export type OptionValueGroup = {
  key: "youth" | "adult" | "other" | "all"
  /** Shown above the group; null for an option that is not grouped. */
  label: string | null
  values: string[]
}

const normalize = (value: string) => value.trim().toUpperCase()

const indexIn = (list: readonly string[], value: string) =>
  list.indexOf(normalize(value))

/** True for the product option that holds garment sizes. */
export const isSizeOption = (title: string | null | undefined): boolean =>
  normalize(title ?? "") === "SIZE"

export const isYouthSize = (value: string): boolean =>
  indexIn(YOUTH_SIZES, value) !== -1

export const isAdultSize = (value: string): boolean =>
  indexIn(ADULT_SIZES, value) !== -1

/**
 * Groups and orders an option's values for display.
 *
 * - A size option gives Youth (YS to YXL) then Adult (XS to 3XL), each in
 *   size order, whatever order the backend returns. A value that is neither
 *   goes in a last "Other sizes" group, so nothing is ever hidden. Empty
 *   groups are left out.
 * - Any other option gives one unlabelled group in the backend's order.
 */
export const groupOptionValues = (
  title: string | null | undefined,
  values: string[]
): OptionValueGroup[] => {
  const unique = Array.from(new Set(values))

  if (!isSizeOption(title)) {
    return unique.length ? [{ key: "all", label: null, values: unique }] : []
  }

  const byOrder = (list: readonly string[]) => (a: string, b: string) =>
    indexIn(list, a) - indexIn(list, b)

  const groups: OptionValueGroup[] = [
    {
      key: "youth",
      label: "Youth",
      values: unique.filter(isYouthSize).sort(byOrder(YOUTH_SIZES)),
    },
    {
      key: "adult",
      label: "Adult",
      values: unique.filter(isAdultSize).sort(byOrder(ADULT_SIZES)),
    },
    {
      key: "other",
      label: "Other sizes",
      values: unique.filter((v) => !isYouthSize(v) && !isAdultSize(v)),
    },
  ]

  return groups.filter((group) => group.values.length > 0)
}
