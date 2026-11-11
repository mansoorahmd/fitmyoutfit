/**
 * Text rules for text and number layers: Unicode normalisation, reading
 * direction and alignment by reading direction. Plain functions, no DOM, so
 * the validator, the texture drawing and (later) the roster checks and the
 * production files all read text the same way.
 *
 * - Text is stored in Unicode NFC, so "José" typed with a combining accent and
 *   "José" typed with the precomposed letter are the same string, and two
 *   names compare equal with `===`. The edit functions normalise; the
 *   validator refuses text that is not NFC rather than changing it silently.
 * - A text layer's direction is "ltr", "rtl" or "auto". "auto" follows the
 *   text: the first strong letter decides (Unicode bidi rules P2 and P3), so
 *   "محمد علی" reads right to left and "Ali علي" left to right. Digits are not
 *   strong letters, in any digit system.
 * - Alignment is "start", "center" or "end", relative to the reading
 *   direction: "start" is the left edge for left-to-right text and the right
 *   edge for right-to-left text. Shaping (joining Arabic letters) and the bidi
 *   ordering of mixed text inside a line are left to the text renderer; this
 *   module only decides the paragraph direction.
 */

export const TEXT_ALIGNS = ["start", "center", "end"] as const;
export type TextAlign = (typeof TEXT_ALIGNS)[number];

export const TEXT_DIRECTIONS = ["auto", "ltr", "rtl"] as const;
export type TextDirection = (typeof TEXT_DIRECTIONS)[number];
export type ResolvedDirection = "ltr" | "rtl";

/** The physical edge of the layer box a line of text is anchored to. */
export type PhysicalAlign = "left" | "center" | "right";

/** Text in Unicode NFC. */
export function normalizeText(value: string): string {
  return value.normalize("NFC");
}

/** True when the text is already in Unicode NFC. */
export function isNormalizedText(value: string): boolean {
  return value === value.normalize("NFC");
}

/** Letters of right-to-left scripts. Digits (Arabic-Indic too) are not letters, so they never count. */
const RTL_LETTER =
  /[\p{Script=Arabic}\p{Script=Hebrew}\p{Script=Syriac}\p{Script=Thaana}\p{Script=Nko}\p{Script=Samaritan}\p{Script=Mandaic}\p{Script=Adlam}\p{Script=Hanifi_Rohingya}]/u;
const LETTER = /\p{L}/u;

// Explicit directional characters (Unicode bidi, X1 to X8 and P2).
const ISOLATE_OPEN = new Set([0x2066, 0x2067, 0x2068]); // LRI, RLI, FSI
const ISOLATE_CLOSE = 0x2069; // PDI
const LRM = 0x200e;
const RLM = 0x200f;
const ALM = 0x061c;

/**
 * The direction of the first strong character, skipping text inside bidi
 * isolates (rule P2), or `null` when there is none (only digits, spaces and
 * punctuation, for example).
 */
export function firstStrongDirection(value: string): ResolvedDirection | null {
  let isolates = 0;
  for (const char of value) {
    const code = char.codePointAt(0)!;
    if (ISOLATE_OPEN.has(code)) {
      isolates++;
      continue;
    }
    if (code === ISOLATE_CLOSE) {
      if (isolates > 0) isolates--;
      continue;
    }
    if (isolates > 0) continue;
    if (code === LRM) return "ltr";
    if (code === RLM || code === ALM) return "rtl";
    if (!LETTER.test(char)) continue;
    return RTL_LETTER.test(char) ? "rtl" : "ltr";
  }
  return null;
}

/** The reading direction of a line: as given, or for "auto" from the first strong letter (left to right if none). */
export function resolveTextDirection(value: string, direction: TextDirection = "auto"): ResolvedDirection {
  if (direction === "ltr" || direction === "rtl") return direction;
  return firstStrongDirection(value) ?? "ltr";
}

/** Start and end turned into the left or right edge, for a line in the given direction. */
export function physicalAlign(align: TextAlign, direction: ResolvedDirection): PhysicalAlign {
  if (align === "center") return "center";
  const startIsLeft = direction === "ltr";
  return (align === "start") === startIsLeft ? "left" : "right";
}

/** True when the text holds a letter of a right-to-left script (Arabic, Urdu, Hebrew ...). */
export function hasRtlLetters(value: string): boolean {
  for (const char of value) if (LETTER.test(char) && RTL_LETTER.test(char)) return true;
  return false;
}
