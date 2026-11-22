/**
 * The roster limits kept as data (decision 012, point 7), read from the Store's `metadata`. Plain
 * TypeScript, no Medusa imports. Every key is optional: a key that is not set means the default
 * of @fitmyoutfit/team-rules (100 lines, 1 to 10 of a shirt, 18 characters in a name). A key that is
 * set but wrong is an error naming the key.
 */
import { DEFAULT_LIMITS, type RosterLimits } from "@fitmyoutfit/team-rules"
import { readNumberSetting, type SettingResult } from "./read-number-setting"

export const ROSTER_MAX_LINES_KEY = "roster_max_lines"
export const ROSTER_MAX_COUNT_KEY = "roster_max_count"
export const ROSTER_MAX_NAME_LENGTH_KEY = "roster_max_name_length"

const KEYS: { key: string; field: "maxLines" | "maxCount" | "maxNameLength"; max: number }[] = [
  { key: ROSTER_MAX_LINES_KEY, field: "maxLines", max: 1000 },
  { key: ROSTER_MAX_COUNT_KEY, field: "maxCount", max: 1000 },
  { key: ROSTER_MAX_NAME_LENGTH_KEY, field: "maxNameLength", max: 200 },
]

/** The limits the store's settings change, on top of the package defaults. */
export function readRosterLimits(
  storeMetadata: Readonly<Record<string, unknown>> | null | undefined
): SettingResult<Partial<RosterLimits>> {
  const limits: Partial<RosterLimits> = {}
  for (const { key, field, max } of KEYS) {
    const raw = storeMetadata?.[key]
    if (raw === undefined || raw === null || (typeof raw === "string" && raw.trim() === "")) {
      continue
    }
    const result = readNumberSetting(storeMetadata, {
      key,
      where: "the store's metadata",
      min: 1,
      max,
      integer: true,
    })
    if (!result.ok) return result
    limits[field] = result.value
  }
  if ((limits.maxCount ?? DEFAULT_LIMITS.maxCount) < DEFAULT_LIMITS.minCount) {
    return { ok: false, error: `${ROSTER_MAX_COUNT_KEY} must be at least ${DEFAULT_LIMITS.minCount}.` }
  }
  return { ok: true, value: limits }
}
