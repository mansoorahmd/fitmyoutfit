// The quantity stepper's rules (docs/design/05-m1-pages.md, 2.7), as plain
// functions: the range, what a typed value becomes, and which buttons work.

export const MIN_QUANTITY = 1
/** "999 for now, or stock if a variant ever manages stock." */
export const MAX_QUANTITY = 999

/**
 * The largest quantity for a variant: 999, or its stock when it manages
 * inventory without backorders (never below 1).
 */
export const maxQuantityFor = (
  variant:
    | {
        manage_inventory?: boolean | null
        allow_backorder?: boolean | null
        inventory_quantity?: number | null
      }
    | null
    | undefined
): number => {
  if (variant?.manage_inventory && !variant.allow_backorder) {
    const stock = variant.inventory_quantity ?? 0
    return Math.max(MIN_QUANTITY, Math.min(MAX_QUANTITY, stock))
  }
  return MAX_QUANTITY
}

export type TypedQuantity =
  /** A whole number in range: use it. */
  | { kind: "valid"; value: number }
  /** Empty or still being typed: wait for more. */
  | { kind: "incomplete" }
  /** Out of range or not a number: on blur, snap back and say why. */
  | { kind: "invalid" }

/** What a typed value is, for a stepper from `min` to `max`. */
export const readTypedQuantity = (
  text: string,
  min: number = MIN_QUANTITY,
  max: number = MAX_QUANTITY
): TypedQuantity => {
  const trimmed = text.trim()
  if (trimmed === "") {
    return { kind: "incomplete" }
  }
  if (!/^\d+$/.test(trimmed)) {
    return { kind: "invalid" }
  }
  const value = Number(trimmed)
  return value >= min && value <= max ? { kind: "valid", value } : { kind: "invalid" }
}

/**
 * What a typed number becomes when the visitor leaves the field or presses
 * Enter. Nothing typed is used before then: "1000" passes through "100" on
 * the way, and that must never be taken (QA, task S1-3b, D3).
 * - A whole number in range is taken (`changed` when it differs).
 * - Anything else (empty, out of range, not a whole number) puts back the
 *   number from before typing and shows the range message; nothing changes.
 */
export const commitTypedQuantity = (
  text: string,
  previous: number,
  min: number = MIN_QUANTITY,
  max: number = MAX_QUANTITY
): { value: number; changed: boolean; rangeError: boolean } => {
  const read = readTypedQuantity(text, min, max)
  if (read.kind === "valid") {
    return { value: read.value, changed: read.value !== previous, rangeError: false }
  }
  return { value: previous, changed: false, rangeError: true }
}

/** Whether − and + can be pressed. */
export const stepperButtons = (
  value: number,
  min: number = MIN_QUANTITY,
  max: number = MAX_QUANTITY
): { canDecrease: boolean; canIncrease: boolean } => ({
  canDecrease: value > min,
  canIncrease: value < max,
})

/** A value forced into range, as a whole number. */
export const clampQuantity = (
  value: number,
  min: number = MIN_QUANTITY,
  max: number = MAX_QUANTITY
): number => {
  if (!Number.isFinite(value)) {
    return min
  }
  return Math.min(max, Math.max(min, Math.round(value)))
}
