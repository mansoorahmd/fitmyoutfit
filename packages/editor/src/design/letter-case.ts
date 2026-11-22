/**
 * Names in capitals (decision 012, 08-team-list.md Q-TL2): Latin names print in capitals by default, with an "As typed"
 * choice. The STORED name is never changed; only what is drawn (and said about the drawing) is. Arabic-script names
 * have no capitals and are never touched, and neither is a digit, a space or a punctuation mark.
 */
export const LETTER_CASES = ["upper", "as-typed"] as const;
export type LetterCase = (typeof LETTER_CASES)[number];

const LATIN_LETTER = /\p{Script=Latin}/u;

/** Capitals for the Latin letters of `text`; every other character (Arabic script, digits, marks) stays as it is. */
export function upperLatin(text: string): string {
  let out = "";
  for (const ch of text) out += LATIN_LETTER.test(ch) ? ch.toUpperCase() : ch;
  return out;
}

/** The part of a layer this rule needs. */
export interface CaseLayer {
  kind: string;
  role: string;
  value: string;
  letterCase?: LetterCase | undefined;
}

/** Whether a layer is drawn in capitals: a player's name, unless the coach chose "As typed". */
export function isCapitalised(layer: Pick<CaseLayer, "kind" | "role" | "letterCase">): boolean {
  return layer.kind === "text" && layer.role === "player-name" && layer.letterCase !== "as-typed";
}

/** What is drawn for a layer's value: the stored text, or its Latin letters in capitals. */
export function drawnText(layer: CaseLayer): string {
  return isCapitalised(layer) ? upperLatin(layer.value) : layer.value;
}
