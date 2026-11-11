/**
 * Minimum quantity per region. Plain TypeScript, no Medusa imports.
 *
 * Counts the pieces of every product across the whole cart, except the fit kit
 * (`metadata.kind` `fit_kit`) and the rush add-on (`rush_add_on`). A missing or unknown kind counts
 * as a garment, so a garment an admin adds without a kind (the admin's product form has no such
 * field) cannot escape the minimum (QA defect D1; decided in docs/contracts/m1-checkout.md,
 * section 5). A cart with nothing that counts passes, so a fit kit can be bought alone in any
 * region. The minimum itself is region data (`min_garment_quantity`, read by
 * lib/settings/min-garment-quantity.ts).
 */

/** The `metadata.kind` the seed gives to garments. What counts is decided by NOT_COUNTED_KINDS. */
export const GARMENT_KIND = "garment"

/**
 * The only kinds that do not count towards the minimum. Compared exactly: a kind written any other
 * way (`Fit_Kit`, `fit kit`) is unknown and so counts, which errs on the side of the minimum.
 */
export const NOT_COUNTED_KINDS: readonly string[] = ["fit_kit", "rush_add_on"]

/** One cart line: how many pieces, and the `metadata.kind` of its product (if any). */
export type QuantityLine = {
  quantity: number
  /** Whatever the product's `metadata.kind` holds; anything but a not-counted kind counts. */
  kind?: unknown
}

export type MinimumQuantityResult = {
  /** The region's minimum. */
  required: number
  /** Garment pieces in the cart. */
  counted: number
  /** True when the cart has no garment, or at least `required` garment pieces. */
  ok: boolean
}

/** True when a product of this kind counts towards the minimum: every kind but the not-counted ones. */
export function countsTowardMinimum(kind: unknown): boolean {
  return !(typeof kind === "string" && NOT_COUNTED_KINDS.includes(kind))
}

/** Garment pieces in the cart. A line with a quantity that is not a positive number counts 0. */
export function countGarmentPieces(lines: readonly QuantityLine[]): number {
  let count = 0
  for (const line of lines) {
    if (!countsTowardMinimum(line.kind)) {
      continue
    }
    const quantity = Number(line.quantity)
    if (Number.isFinite(quantity) && quantity > 0) {
      count += quantity
    }
  }
  return count
}

export function checkMinimumQuantity(
  lines: readonly QuantityLine[],
  required: number
): MinimumQuantityResult {
  const counted = countGarmentPieces(lines)
  return { required, counted, ok: counted === 0 || counted >= required }
}
