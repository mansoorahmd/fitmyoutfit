/**
 * The cash-on-delivery limit: the largest cart total, in PKR and in major units (20000 means
 * Rs 20,000), that can be paid by cash on delivery. Read from the Store's `metadata`.
 * Plain TypeScript, no Medusa imports. The rule that uses it is in lib/rules/cash-on-delivery.ts.
 */
import { readNumberSetting, type SettingResult } from "./read-number-setting"

/** Key of the setting in the Store's metadata. */
export const COD_MAX_TOTAL_KEY = "cod_max_total"

/** The currency the limit is written in. */
export const COD_LIMIT_CURRENCY_CODE = "pkr"

/** Returns the limit (0 or more), or a readable error when it is missing or not a number. */
export function readCodMaxTotal(
  settings: Readonly<Record<string, unknown>> | null | undefined
): SettingResult<number> {
  return readNumberSetting(settings, {
    key: COD_MAX_TOTAL_KEY,
    where: "the store's metadata",
    min: 0,
  })
}
