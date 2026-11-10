/**
 * Jersey numbers: one rule, plain functions on plain strings.
 *
 * Used by the design document (number layers) and, later, by the backend's
 * roster checks, so both apply exactly the same rule. No design-document
 * types, no React, no Three.js.
 *
 * The rule (limits are in jersey-number-rules.ts, as data):
 * - A number is a string of digits with a value from 0 to `maxValue` (99).
 *   The longest allowed string is as long as `maxValue` ("007" is too long).
 * - Digits come from the allowed digit systems (Western, Arabic-Indic,
 *   Extended Arabic-Indic). One number may not mix systems.
 * - Leading zeros are allowed and do not change the value: "07" is 7. The
 *   string is kept as typed; only the comparison uses the value.
 * - Two numbers are "the same number" when their values are equal, in any
 *   digit system: "7", "07", "٧" and "۷".
 * - Nothing else is allowed: no signs, spaces, points, full-width digits.
 *   Nothing is trimmed or normalised: " 7" is invalid.
 */
import { DEFAULT_JERSEY_NUMBER_RULES, type DigitSystem, type JerseyNumberRules } from "./jersey-number-rules.js";

export type JerseyNumberCheck =
  | {
      ok: true;
      /** The numeric value: "07" and "٧" both give 7. */
      value: number;
      /** `id` of the digit system the number is written in. */
      digitSystem: string;
    }
  | {
      ok: false;
      /** Readable, for example `"1٢" mixes two digit systems (Western (0-9) and Arabic-Indic (٠-٩)); use one system only`. */
      error: string;
    };

export interface DuplicateJerseyNumbers {
  /** The shared numeric value. */
  value: number;
  /** Positions in the input list of the entries that clash, ascending. At least two. */
  indexes: number[];
  /** Those entries as given, in the same order as `indexes`. */
  numbers: string[];
}

export interface InvalidJerseyNumberEntry {
  /** Position in the input list. */
  index: number;
  /** The entry as given (it may not even be a string). */
  entry: unknown;
  /** Why it is not a valid number. */
  error: string;
}

export interface DuplicateReport {
  /** One item per value that two or more valid entries share, sorted by value. */
  duplicates: DuplicateJerseyNumbers[];
  /**
   * Entries that are not valid numbers, in list order. They are never counted
   * as duplicates (not even of an identical invalid string): they are reported
   * here so the caller can show both kinds of problem.
   */
  invalid: InvalidJerseyNumberEntry[];
}

/** Returns a description of what is wrong with a rules object, or null when it is usable. */
export function checkJerseyNumberRules(rules: unknown): string | null {
  if (typeof rules !== "object" || rules === null) return "the jersey number rules must be an object";
  const { maxValue, digitSystems } = rules as { maxValue?: unknown; digitSystems?: unknown };
  if (typeof maxValue !== "number" || !Number.isSafeInteger(maxValue) || maxValue < 0) {
    return "the jersey number rules need 'maxValue' to be a whole number of 0 or more";
  }
  if (!Array.isArray(digitSystems) || digitSystems.length === 0) {
    return "the jersey number rules need 'digitSystems' to be a list with at least one digit system";
  }
  const ids = new Set<string>();
  const taken: Array<[number, number]> = [];
  for (const system of digitSystems as unknown[]) {
    const s = system as Partial<DigitSystem> | null;
    if (
      typeof s !== "object" ||
      s === null ||
      typeof s.id !== "string" ||
      s.id === "" ||
      typeof s.name !== "string" ||
      typeof s.zero !== "number" ||
      !Number.isInteger(s.zero) ||
      s.zero < 0 ||
      s.zero + 9 > 0x10ffff
    ) {
      return "each digit system in the jersey number rules needs an 'id', a 'name' and a 'zero' code point";
    }
    if (ids.has(s.id)) return `the jersey number rules list the digit system "${s.id}" twice`;
    ids.add(s.id);
    const zero = s.zero;
    if (taken.some(([from, to]) => zero <= to && zero + 9 >= from)) {
      return `the digit system "${s.id}" overlaps another digit system in the jersey number rules`;
    }
    taken.push([zero, zero + 9]);
  }
  return null;
}

function usableRules(rules: JerseyNumberRules): JerseyNumberRules {
  const problem = checkJerseyNumberRules(rules);
  if (problem) throw new RangeError(`Invalid jersey number rules: ${problem}`);
  return rules;
}

/** The longest allowed number, in digits (two for a maximum of 99). */
export function jerseyNumberMaxLength(rules: JerseyNumberRules = DEFAULT_JERSEY_NUMBER_RULES): number {
  return String(usableRules(rules).maxValue).length;
}

function show(input: string): string {
  return JSON.stringify(input.length > 24 ? `${input.slice(0, 24)}...` : input);
}

function listNames(systems: readonly DigitSystem[]): string {
  return systems.map((s) => s.name).join(", ");
}

/** The system a code point belongs to, if it is a digit of one of `systems`. */
function systemOf(code: number, systems: readonly DigitSystem[]): { system: DigitSystem; digit: number } | undefined {
  for (const system of systems) {
    if (code >= system.zero && code <= system.zero + 9) return { system, digit: code - system.zero };
  }
  return undefined;
}

/**
 * Checks one jersey number. Never throws for a bad number (any input type is
 * accepted and gives `ok: false`). Throws a `RangeError` only when `rules`
 * itself is unusable (see `checkJerseyNumberRules`).
 */
export function checkJerseyNumber(
  input: unknown,
  rules: JerseyNumberRules = DEFAULT_JERSEY_NUMBER_RULES,
): JerseyNumberCheck {
  const { maxValue, digitSystems } = usableRules(rules);
  if (typeof input !== "string") {
    const got =
      input === null || input === undefined
        ? String(input)
        : Array.isArray(input)
          ? "an array"
          : typeof input === "object"
            ? "an object"
            : `a ${typeof input}`;
    return { ok: false, error: `must be a string of digits, got ${got}` };
  }
  if (input === "") return { ok: false, error: "is empty; a jersey number needs at least one digit" };

  // Digit systems that exist but are not allowed here are recognised too, so the message can say so.
  const known = [
    ...digitSystems,
    ...DEFAULT_JERSEY_NUMBER_RULES.digitSystems.filter((d) => !digitSystems.some((s) => s.id === d.id)),
  ];
  const used: DigitSystem[] = [];
  const digits: number[] = [];
  for (const char of input) {
    const found = systemOf(char.codePointAt(0)!, known);
    if (!found) {
      const spaces = /\s/u.test(input) ? " (spaces are not allowed and are not trimmed)" : "";
      return {
        ok: false,
        error: `${show(input)} contains characters that are not digits${spaces}; use only digits from: ${listNames(digitSystems)}`,
      };
    }
    if (!used.includes(found.system)) used.push(found.system);
    digits.push(found.digit);
  }

  // Every character is a digit from here on, so `used` has at least one system.
  const [first, second] = used;
  if (first && second) {
    return { ok: false, error: `${show(input)} mixes two digit systems (${first.name} and ${second.name}); use one system only` };
  }
  const system = first!;
  if (!digitSystems.some((s) => s.id === system.id)) {
    return {
      ok: false,
      error: `${show(input)} uses ${system.name} digits, which are not allowed; allowed: ${listNames(digitSystems)}`,
    };
  }
  const maxLength = String(maxValue).length;
  if (digits.length > maxLength) {
    return {
      ok: false,
      error: `${show(input)} has more than ${maxLength} digit${maxLength === 1 ? "" : "s"} (the largest jersey number is ${maxValue}; leading zeros count)`,
    };
  }
  const value = digits.reduce((total, digit) => total * 10 + digit, 0);
  if (value > maxValue) {
    return { ok: false, error: `${show(input)} is larger than ${maxValue}, the largest jersey number` };
  }
  return { ok: true, value, digitSystem: system.id };
}

/** True when `input` is a valid jersey number under `rules`. */
export function isValidJerseyNumber(input: unknown, rules: JerseyNumberRules = DEFAULT_JERSEY_NUMBER_RULES): boolean {
  return checkJerseyNumber(input, rules).ok;
}

/**
 * The numeric value of a jersey number ("07", "٧" and "۷" are all 7), or
 * `null` when it is not a valid number. Use `checkJerseyNumber` for the reason.
 */
export function jerseyNumberValue(input: unknown, rules: JerseyNumberRules = DEFAULT_JERSEY_NUMBER_RULES): number | null {
  const result = checkJerseyNumber(input, rules);
  return result.ok ? result.value : null;
}

/**
 * True when both are valid jersey numbers with equal values, whatever the
 * digit system or leading zeros. An invalid entry is never "the same" as
 * anything, not even an identical invalid string.
 */
export function isSameJerseyNumber(
  a: unknown,
  b: unknown,
  rules: JerseyNumberRules = DEFAULT_JERSEY_NUMBER_RULES,
): boolean {
  const first = jerseyNumberValue(a, rules);
  return first !== null && first === jerseyNumberValue(b, rules);
}

/**
 * Finds numbers in a list (for example a team) that are the same number.
 * Invalid entries do not crash it and are not matched with anything: they are
 * listed in `invalid`, so the caller can report both kinds of problem.
 */
export function findDuplicateJerseyNumbers(
  list: readonly unknown[],
  rules: JerseyNumberRules = DEFAULT_JERSEY_NUMBER_RULES,
): DuplicateReport {
  usableRules(rules);
  if (!Array.isArray(list)) throw new TypeError("findDuplicateJerseyNumbers needs a list");
  const byValue = new Map<number, number[]>();
  const invalid: InvalidJerseyNumberEntry[] = [];
  list.forEach((entry, index) => {
    const result = checkJerseyNumber(entry, rules);
    if (!result.ok) {
      invalid.push({ index, entry, error: result.error });
      return;
    }
    const seen = byValue.get(result.value);
    if (seen) seen.push(index);
    else byValue.set(result.value, [index]);
  });
  const duplicates = [...byValue.entries()]
    .filter(([, indexes]) => indexes.length > 1)
    .sort(([a], [b]) => a - b)
    .map(([value, indexes]) => ({ value, indexes, numbers: indexes.map((i) => list[i] as string) }));
  return { duplicates, invalid };
}
