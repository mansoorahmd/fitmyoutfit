/**
 * The minimum quantity of a region: the fewest garment pieces in one order. Read from the
 * Region's `metadata` (next to `tax_final`). Plain TypeScript, no Medusa imports.
 * The rule that uses it is in lib/rules/minimum-quantity.ts.
 */
import { readNumberSetting, type SettingResult } from "./read-number-setting"

/** Key of the setting in the Region's metadata. */
export const MIN_GARMENT_QUANTITY_KEY = "min_garment_quantity"

/** Returns the minimum (a whole number, 1 or more), or a readable error. */
export function readMinGarmentQuantity(
  regionMetadata: Readonly<Record<string, unknown>> | null | undefined,
  regionName?: string | null
): SettingResult<number> {
  return readNumberSetting(regionMetadata, {
    key: MIN_GARMENT_QUANTITY_KEY,
    where: regionName ? `the metadata of the region "${regionName}"` : "the region's metadata",
    min: 1,
    integer: true,
  })
}
