/**
 * Text clean-up and the allowed characters of a name (08-team-list.md, 4.1 and 6.1).
 */

/**
 * Characters that show nothing and only steer text direction or spacing: zero-width space, the
 * left-to-right and right-to-left marks, the embedding and isolate controls, and the byte-order
 * mark. They arrive with text copied from WhatsApp or a web page and are removed, never reported.
 * The zero-width non-joiner (U+200C) is not here: Urdu and Persian typing uses it inside names.
 */
const INVISIBLE_MARKS = /[\u200B\u200E\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/gu;

/** Unicode NFC, direction marks removed, runs of white space made one space, ends trimmed. */
export function cleanText(input: string): string {
  return input.normalize("NFC").replace(INVISIBLE_MARKS, "").replace(/\s+/gu, " ").trim();
}

const IS_LETTER = /\p{L}/u;
const IS_MARK = /\p{M}/u;
const LATIN_LETTER = /\p{Script=Latin}/u;
const ARABIC_LETTER = /\p{Script=Arabic}/u;
const DIGIT = /\p{Nd}/u;

/** The marks a name may hold besides letters: space, hyphen, apostrophes, full stop, ZWNJ. */
const ALLOWED_PUNCTUATION = new Set([" ", "-", "'", "\u2019", ".", "\u200C"]);

export interface NameCharacterReport {
  /** The characters that cannot be printed, each once, in order of appearance. */
  characters: string[];
  hasDigit: boolean;
}

/**
 * The characters of a name that are not allowed: anything but letters of the Latin alphabet and
 * the Arabic script (Urdu included, with their marks), the space, the hyphen, the apostrophe
 * (' and a curly one), the full stop and the zero-width non-joiner. Returns null when the name is
 * fine.
 */
export function disallowedNameCharacters(name: string): NameCharacterReport | null {
  const found: string[] = [];
  let hasDigit = false;
  for (const char of name) {
    if (ALLOWED_PUNCTUATION.has(char)) continue;
    if (IS_MARK.test(char)) continue;
    if (IS_LETTER.test(char) && (LATIN_LETTER.test(char) || ARABIC_LETTER.test(char))) continue;
    if (DIGIT.test(char)) hasDigit = true;
    if (!found.includes(char)) found.push(char);
  }
  return found.length > 0 ? { characters: found, hasDigit } : null;
}

/** The length of a name in characters: marks and the zero-width non-joiner do not count. */
export function nameLength(name: string): number {
  let length = 0;
  for (const char of name) {
    if (char === "\u200C" || IS_MARK.test(char)) continue;
    length += 1;
  }
  return length;
}

/** True when the name has both Latin and Arabic-script letters (a note, not a problem). */
export function mixesScripts(name: string): boolean {
  let latin = false;
  let arabic = false;
  for (const char of name) {
    if (!IS_LETTER.test(char)) continue;
    if (LATIN_LETTER.test(char)) latin = true;
    if (ARABIC_LETTER.test(char)) arabic = true;
    if (latin && arabic) return true;
  }
  return false;
}
