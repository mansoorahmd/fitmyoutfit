/**
 * Shared reader for a numeric setting held in a plain metadata object (the Store's or a Region's
 * `metadata`). Plain TypeScript, no Medusa imports.
 *
 * The admin's metadata editor stores whatever it is sent, so a number written as a string ("20")
 * is accepted. Everything else (missing, blank, not a number, out of range, a fraction where a
 * whole number is needed) gives a readable error that names the key and where to set it.
 */
import type { SettingResult } from "./rush-percentage"

export type { SettingResult } from "./rush-percentage"

export type NumberSettingRule = {
  /** Metadata key, for example `cod_max_total`. */
  key: string
  /** Where an admin sets it, for the error message, for example "the store's metadata". */
  where: string
  /** Smallest allowed value (inclusive). */
  min: number
  /** Largest allowed value (inclusive). No upper limit when left out. */
  max?: number
  /** True when only whole numbers are allowed. */
  integer?: boolean
}

/** Plain decimal number, as the Medusa admin's metadata editor writes it ("20", "12.5"). */
const NUMERIC_STRING_RE = /^-?\d*\.?\d+$/

function describeAllowed(rule: NumberSettingRule): string {
  const kind = rule.integer ? "a whole number" : "a number"
  if (rule.max !== undefined) {
    return `${kind} from ${rule.min} to ${rule.max}`
  }
  return `${kind}, ${rule.min} or more`
}

export function readNumberSetting(
  settings: Readonly<Record<string, unknown>> | null | undefined,
  rule: NumberSettingRule
): SettingResult<number> {
  const { key } = rule
  const raw = settings?.[key]
  if (raw === undefined || raw === null || (typeof raw === "string" && raw.trim() === "")) {
    return {
      ok: false,
      error: `${key} is not set. Add it to ${rule.where} (${describeAllowed(rule)}).`,
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
      error: `${key} in ${rule.where} must be ${describeAllowed(rule)}, got ${JSON.stringify(raw)}.`,
    }
  }

  if (!Number.isFinite(value)) {
    return {
      ok: false,
      error: `${key} in ${rule.where} must be a finite number, got ${String(raw)}.`,
    }
  }
  if (rule.integer && !Number.isInteger(value)) {
    return { ok: false, error: `${key} in ${rule.where} must be a whole number, got ${value}.` }
  }
  if (value < rule.min) {
    return {
      ok: false,
      error: `${key} in ${rule.where} must not be below ${rule.min}, got ${value}.`,
    }
  }
  if (rule.max !== undefined && value > rule.max) {
    return {
      ok: false,
      error: `${key} in ${rule.where} must not be above ${rule.max}, got ${value}.`,
    }
  }
  return { ok: true, value }
}
