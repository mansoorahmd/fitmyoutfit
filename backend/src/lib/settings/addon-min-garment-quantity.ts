/**
 * The minimum of a late joiner's add-on order: the fewest garment pieces its team list must reach.
 * Read from the Region's `metadata`, next to `min_garment_quantity` (the region's ordinary minimum,
 * which would refuse one late player). PLACEHOLDER: 1 in every region until the founders decide.
 * Plain TypeScript, no Medusa imports.
 */
import { readNumberSetting, type SettingResult } from "./read-number-setting"

/** Key of the setting in the Region's metadata. */
export const ADDON_MIN_GARMENT_QUANTITY_KEY = "addon_min_garment_quantity"

/** Returns the add-on minimum (a whole number, 1 or more), or a readable error. */
export function readAddOnMinGarmentQuantity(
  regionMetadata: Readonly<Record<string, unknown>> | null | undefined,
  regionName?: string | null
): SettingResult<number> {
  return readNumberSetting(regionMetadata, {
    key: ADDON_MIN_GARMENT_QUANTITY_KEY,
    where: regionName ? `the metadata of the region "${regionName}"` : "the region's metadata",
    min: 1,
    integer: true,
  })
}
