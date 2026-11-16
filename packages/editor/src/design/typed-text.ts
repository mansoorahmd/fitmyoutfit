/**
 * Text as a coach types or pastes it (E3c, S5 and the pasted-text minor), as
 * plain functions shared by every text field:
 * - a tab or a line break (pasted from a message or a spreadsheet) becomes a
 *   single space: names and free text are one line, and nothing typed is
 *   silently dropped;
 * - emoji and other pictographs are refused: they cannot be printed in a kit
 *   colour (a device draws them from its own colour emoji font, differently
 *   on every phone). A design that already holds them (an older saved one)
 *   is told so, with "Remove them" (`stripPictographs`).
 *
 * ©, ® and ™ are letters of the fonts, not pictures: allowed, unless written
 * with the emoji presentation selector (U+FE0F).
 */
import { normalizeText } from "./text.js";

/** Line breaks, tabs and the other separators a paste can bring: each run becomes one space. */
const BREAK_CHARS = String.fromCharCode(9, 10, 11, 12, 13, 0x85, 0x2028, 0x2029);
const SPACES = " " + String.fromCharCode(0xa0);
const BREAKS = new RegExp(`[${SPACES}]*[${BREAK_CHARS}][${BREAK_CHARS}${SPACES}]*`, "g");
/** Other control characters (never typed on purpose): dropped. Built from code points (no control characters in the source). */
const CONTROL_RANGES: Array<[number, number]> = [[0x00, 0x08], [0x0e, 0x1f], [0x7f, 0x84], [0x86, 0x9f]];
const CONTROLS = new RegExp(`[${CONTROL_RANGES.map(([a, b]) => `${String.fromCharCode(a)}-${String.fromCharCode(b)}`).join("")}]`, "g");

/** One line: tabs and line breaks become single spaces, other control characters go. NFC. */
export function singleLine(text: string): string {
  return normalizeText(text.replace(BREAKS, " ").replace(CONTROLS, ""));
}

/** Symbols that are letters in the fonts, though Unicode lists them as possible emoji. */
const TEXT_SYMBOLS = new Set([0x00a9, 0x00ae, 0x2122]);
const EXTENDED_PICTOGRAPHIC = /\p{Extended_Pictographic}/u;
const REGIONAL_INDICATOR = /\p{Regional_Indicator}/u;

function isPictograph(cp: number, next: number | undefined): boolean {
  if (cp === 0xfe0f || cp === 0x20e3) return true; // emoji presentation, keycap
  if (cp >= 0x1f3fb && cp <= 0x1f3ff) return true; // skin tones
  const ch = String.fromCodePoint(cp);
  if (REGIONAL_INDICATOR.test(ch)) return true; // flags
  if (!EXTENDED_PICTOGRAPHIC.test(ch)) return false;
  return !TEXT_SYMBOLS.has(cp) || next === 0xfe0f;
}

/** True when the text holds emoji or other pictographs (which cannot be printed in a kit colour). */
export function hasPictographs(text: string): boolean {
  const cps = [...text].map((c) => c.codePointAt(0)!);
  return cps.some((cp, k) => isPictograph(cp, cps[k + 1]));
}

/**
 * The text without its emoji and pictographs ("Remove them"): also the joiners and selectors that held them
 * together; spaces left doubled are made single, and the ends trimmed. A joiner between letters (Arabic and
 * Urdu use it) is kept.
 */
export function stripPictographs(text: string): string {
  const cps = [...text].map((c) => c.codePointAt(0)!);
  const drop = cps.map((cp, k) => isPictograph(cp, cps[k + 1]));
  const out: number[] = [];
  cps.forEach((cp, k) => {
    if (drop[k]) return;
    // A zero-width joiner next to a removed pictograph joined emoji, not letters.
    if (cp === 0x200d && (drop[k - 1] || drop[k + 1])) return;
    out.push(cp);
  });
  return normalizeText(String.fromCodePoint(...out).replace(/ {2,}/g, " ").trim());
}

/** What is wrong with typed text, for the field's message; null when it can go on the kit. */
export type TypedTextProblem = "pictographs" | "blank";

/**
 * Text as typed or pasted, ready for the design: one line, NFC; and whether it may be used. `allowEmpty`:
 * names may be empty (the team name, the sample player); a line of free text may not.
 */
export function checkTypedText(raw: string, options: { allowEmpty?: boolean } = {}): { value: string; problem: TypedTextProblem | null } {
  const value = singleLine(raw);
  if (hasPictographs(value)) return { value, problem: "pictographs" };
  if (!options.allowEmpty && value.trim() === "") return { value, problem: "blank" };
  return { value, problem: null };
}
