/**
 * The jersey number rules, as DATA (founders' decision, S0-3c).
 *
 * Change the numbers here, or pass a different rules object to the functions
 * in jersey-number.ts, and the behaviour follows. No other code holds a copy
 * of the maximum or of the digit ranges.
 *
 * Plain data only: no imports, so this file is safe for any consumer.
 */

/** A script's digits 0 to 9, which are consecutive code points starting at `zero`. */
export interface DigitSystem {
  /** Stable id, used in results and messages. */
  readonly id: string;
  /** Readable name, used in messages. */
  readonly name: string;
  /** Code point of the digit zero. The digits are `zero` to `zero + 9`. */
  readonly zero: number;
}

export interface JerseyNumberRules {
  /**
   * The largest allowed number. The smallest is always 0. The longest allowed
   * written form follows from it: its number of digits (two for 99), counting
   * leading zeros.
   */
  readonly maxValue: number;
  /** The digit systems a number may be written in. One number may not mix them. */
  readonly digitSystems: readonly DigitSystem[];
}

/** Western digits 0-9 (U+0030 to U+0039). */
export const WESTERN_DIGITS: DigitSystem = { id: "western", name: "Western (0-9)", zero: 0x0030 };
/** Arabic-Indic digits ٠-٩ (U+0660 to U+0669). */
export const ARABIC_INDIC_DIGITS: DigitSystem = { id: "arabic-indic", name: "Arabic-Indic (٠-٩)", zero: 0x0660 };
/** Extended Arabic-Indic digits ۰-۹ (U+06F0 to U+06F9): the Urdu and Persian forms. */
export const EXTENDED_ARABIC_INDIC_DIGITS: DigitSystem = {
  id: "extended-arabic-indic",
  name: "Extended Arabic-Indic (۰-۹)",
  zero: 0x06f0,
};

/** The rules the store uses unless a caller passes others. */
export const DEFAULT_JERSEY_NUMBER_RULES: JerseyNumberRules = Object.freeze({
  maxValue: 99,
  digitSystems: Object.freeze([WESTERN_DIGITS, ARABIC_INDIC_DIGITS, EXTENDED_ARABIC_INDIC_DIGITS]),
});
