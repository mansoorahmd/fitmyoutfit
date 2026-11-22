/**
 * The default limits, as data (decision 012, point 7). Nothing else in the package holds a copy of
 * these numbers: every function takes the limits as an argument and falls back to these.
 */
import { DEFAULT_JERSEY_NUMBER_RULES } from "./jersey-number-rules.js";
import type { RosterLimits } from "./types.js";

export const DEFAULT_LIMITS: Readonly<RosterLimits> = Object.freeze({
  maxLines: 100,
  minCount: 1,
  maxCount: 10,
  maxNameLength: 18,
  numberRules: DEFAULT_JERSEY_NUMBER_RULES,
});

/** The defaults with `overrides` on top. Throws a RangeError for a limit that cannot work. */
export function resolveLimits(overrides?: Partial<RosterLimits>): RosterLimits {
  const limits: RosterLimits = { ...DEFAULT_LIMITS, ...stripUndefined(overrides) };
  for (const key of ["maxLines", "minCount", "maxCount", "maxNameLength"] as const) {
    const value = limits[key];
    if (!Number.isSafeInteger(value) || value < 1) {
      throw new RangeError(`Roster limit "${key}" must be a whole number of 1 or more, got ${String(value)}`);
    }
  }
  if (limits.minCount > limits.maxCount) {
    throw new RangeError(`Roster limit "minCount" (${limits.minCount}) is above "maxCount" (${limits.maxCount})`);
  }
  return limits;
}

function stripUndefined<T extends object>(value: T | undefined): Partial<T> {
  if (!value) return {};
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as Partial<T>;
}
