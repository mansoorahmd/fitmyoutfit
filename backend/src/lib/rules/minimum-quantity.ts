/**
 * Minimum quantity per region. Plain TypeScript, no Medusa imports.
 *
 * Counts the pieces of products whose `metadata.kind` is `garment`, across the whole cart. The
 * fit kit and the rush add-on do not count. A cart with no garment passes, so a fit kit can be
 * bought alone in any region. The minimum itself is region data (`min_garment_quantity`, read by
 * lib/settings/min-garment-quantity.ts).
 */

/** The `metadata.kind` of the products that count towards the minimum. */
export const GARMENT_KIND = "garment"

/** One cart line: how many pieces, and the `metadata.kind` of its product (if known). */
export type QuantityLine = {
  quantity: number
  kind?: string | null
}

export type MinimumQuantityResult = {
  /** The region's minimum. */
  required: number
  /** Garment pieces in the cart. */
  counted: number
  /** True when the cart has no garment, or at least `required` garment pieces. */
  ok: boolean
}

/** Garment pieces in the cart. A line with a quantity that is not a positive number counts 0. */
export function countGarmentPieces(lines: readonly QuantityLine[]): number {
  let count = 0
  for (const line of lines) {
    if (line.kind !== GARMENT_KIND) {
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
