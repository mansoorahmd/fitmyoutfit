/**
 * Sizes: the product's sizes and the common spellings of each (08-team-list.md, 4.5).
 *
 * The words are data built from the product's size list: a size brings its own code, the
 * spellings below for the usual codes, and any `words` the host adds. A size that is not in the
 * product's list is never made up from a partial word: "x" alone is not "XL".
 */
import type { SizeSpec } from "./types.js";

/** How a size is compared: lower case, without spaces, hyphens, dots and underscores. */
export function sizeKey(text: string): string {
  return text
    .normalize("NFC")
    .toLowerCase()
    .replace(/[\s\-._‐-―]+/gu, "");
}

/** Common spellings of the usual size codes, as written (compared with `sizeKey`). */
const USUAL_WORDS: Readonly<Record<string, readonly string[]>> = {
  YS: ["ys", "y s", "y-s", "youth s", "youth small", "yth s"],
  YM: ["ym", "y m", "y-m", "youth m", "youth medium", "yth m"],
  YL: ["yl", "y l", "y-l", "youth l", "youth large", "yth l"],
  YXL: ["yxl", "y xl", "y-xl", "youth xl", "yth xl"],
  XS: ["xs", "x-small", "extra small"],
  S: ["s", "sm", "small"],
  M: ["m", "med", "medium"],
  L: ["l", "lg", "large"],
  XL: ["xl", "x-large", "extra large"],
  "2XL": ["2xl", "xxl", "2x", "xx-large", "2 x large"],
  "3XL": ["3xl", "xxxl", "3x", "xxx-large", "3 x large"],
};

/** The words for a code, including `Nxl` and `xx...xl` forms for the larger sizes. */
function usualWordsFor(code: string): readonly string[] {
  const upper = code.toUpperCase();
  const known = USUAL_WORDS[upper];
  if (known) return known;
  const bigger = /^(\d)XL$/.exec(upper);
  if (bigger) {
    const n = Number(bigger[1]);
    if (n >= 2) return [`${n}x`, "x".repeat(n) + "l", `${"x".repeat(n)}-large`];
  }
  return [];
}

/** What a size word means: the product's size code. */
export interface SizeTable {
  /** Product codes in the product's order. */
  codes: string[];
  /** sizeKey of every spelling to the code. */
  byKey: Map<string, string>;
}

/** Builds the table from the product's sizes. The first size to claim a spelling keeps it. */
export function buildSizeTable(sizes: readonly (string | SizeSpec)[]): SizeTable {
  const codes: string[] = [];
  const byKey = new Map<string, string>();
  const claim = (word: string, code: string) => {
    const key = sizeKey(word);
    if (key !== "" && !byKey.has(key)) byKey.set(key, code);
  };
  // The product's own codes first, so a code always means itself.
  for (const size of sizes) {
    const code = typeof size === "string" ? size : size.code;
    codes.push(code);
    claim(code, code);
  }
  for (const size of sizes) {
    const code = typeof size === "string" ? size : size.code;
    for (const word of typeof size === "string" ? [] : (size.words ?? [])) claim(word, code);
    for (const word of usualWordsFor(code)) claim(word, code);
  }
  return { codes, byKey };
}

/** The product's size for typed text, or null when the text is none of its sizes. */
export function readSize(text: string, table: SizeTable): string | null {
  return table.byKey.get(sizeKey(text)) ?? null;
}

/**
 * True when the text has the shape of a size even if this product does not make it ("4XL",
 * "XXS"): used by the pasted-list reader to tell a size from a name. A size this product lacks is
 * then kept as written and flagged by the normal checks.
 */
const SIZE_SHAPE =
  /^(?:(?:y|yth|youth)(?:xs|s|m|l|xl|small|medium|large)|x{1,4}[sl]|\d{1,2}x[sl]?|\d{1,2}xl|xsmall|xlarge|xxsmall|xxlarge|extra(?:small|large)|xtra(?:small|large)|s|m|l|sm|med|lg|small|medium|large)$/u;

export function looksLikeSize(text: string, table?: SizeTable): boolean {
  const key = sizeKey(text);
  if (key === "") return false;
  if (table?.byKey.has(key)) return true;
  return SIZE_SHAPE.test(key);
}

/** The text of the sizes, to normalise a size field: the product's spelling, or as typed (cleaned). */
export function normalizeSize(text: string, table: SizeTable): string {
  const trimmed = text.normalize("NFC").replace(/\s+/gu, " ").trim();
  return readSize(trimmed, table) ?? trimmed;
}
