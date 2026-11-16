/**
 * The rush production setting: a percentage, read from a plain settings object (in the running
 * store, the Store's `metadata`). Plain TypeScript, no Medusa imports.
 *
 * This only reads and validates the setting. The charge itself is lib/rules/rush-charge.ts; a
 * percentage of 0 means rush is not offered.
 */

/** Key of the setting in the Store's metadata. */
export const RUSH_PERCENTAGE_KEY = "rush_percentage"

export type SettingResult<T> = { ok: true; value: T } | { ok: false; error: string }

/** Plain decimal number, as the Medusa admin's metadata editor writes it ("20", "12.5"). */
const NUMERIC_STRING_RE = /^-?\d*\.?\d+$/

/**
 * Returns the rush percentage (0 to 100), or a readable error when the setting is missing, not a
 * number, negative or above 100. A number written as a string ("20") is accepted, because the
 * metadata API stores whatever it is sent.
 */
export function readRushPercentage(
  settings: Readonly<Record<string, unknown>> | null | undefined
): SettingResult<number> {
  const raw = settings?.[RUSH_PERCENTAGE_KEY]
  if (raw === undefined || raw === null || (typeof raw === "string" && raw.trim() === "")) {
    return {
      ok: false,
      error: `${RUSH_PERCENTAGE_KEY} is not set. Add it to the store's metadata (a number from 0 to 100).`,
    }
  }

  let value: number
  if (typeof raw === "number") {
    value = raw
  } else if (typeof raw === "string" && NUMERIC_STRING_RE.test(raw.trim())) {
    value = Number(raw.trim())
  } else {
    return {
      ok: false,
      error: `${RUSH_PERCENTAGE_KEY} must be a number from 0 to 100, got ${JSON.stringify(raw)}.`,
    }
  }

  if (!Number.isFinite(value)) {
    return { ok: false, error: `${RUSH_PERCENTAGE_KEY} must be a finite number, got ${String(raw)}.` }
  }
  if (value < 0) {
    return { ok: false, error: `${RUSH_PERCENTAGE_KEY} must not be negative, got ${value}.` }
  }
  if (value > 100) {
    return { ok: false, error: `${RUSH_PERCENTAGE_KEY} must not be above 100, got ${value}.` }
  }
  return { ok: true, value }
}
