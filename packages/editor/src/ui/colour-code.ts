/**
 * The "Match a colour code" field (06-editor.md 4.3), as plain logic: what to
 * show for what the coach has typed so far. The field never applies anything
 * itself; "Use …" applies the palette colour, with the typed code kept beside
 * it (`requested`), so nothing off the palette reaches the design.
 */
import { matchColourCode, type MatchLevel, type Palette, type PaletteColour } from "../design/palette.js";
import type { ColorValue } from "../design/schema.js";

export type ColourCodeState =
  /** Nothing typed. */
  | { kind: "empty" }
  /** Still typing a code (1, 2, 4 or 5 hex digits): no error yet, nothing to show. */
  | { kind: "typing" }
  /** Not a colour code: show W-ED51. */
  | { kind: "invalid" }
  /** A colour code: both colours, the match line and "Use …". */
  | { kind: "match"; requested: string; colour: PaletteColour; deltaE: number; match: MatchLevel; value: ColorValue };

/**
 * The field's state. `finished` is true once the coach leaves the field or
 * presses Enter: a code cut short (4 digits, say) is then an error; while
 * typing it is not.
 */
export function colourCodeState(palette: Pick<Palette, "colors">, input: string, finished = false): ColourCodeState {
  const trimmed = input.trim();
  if (trimmed === "") return { kind: "empty" };
  const digits = trimmed.startsWith("#") ? trimmed.slice(1) : trimmed;
  if (!/^[0-9a-fA-F]*$/.test(digits) || digits.length > 6) return { kind: "invalid" };
  if (digits.length !== 3 && digits.length !== 6) return finished ? { kind: "invalid" } : { kind: "typing" };
  const result = matchColourCode(palette, trimmed);
  if (!result.ok) return { kind: "invalid" };
  return { kind: "match", requested: result.requested, colour: result.colour, deltaE: result.deltaE, match: result.match, value: result.value };
}

/** What the coach typed, as the field shows it: upper case, "#" first, at most 7 characters. */
export function normaliseCodeInput(raw: string): string {
  const cleaned = raw.replace(/\s+/g, "").toUpperCase();
  const body = cleaned.replace(/^#+/, "");
  return `#${body}`.slice(0, 7);
}
