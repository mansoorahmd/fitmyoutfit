/**
 * The print-tested palette, as data, and the colour-code match.
 *
 * A palette lists the colours we can print (each with an id, a name, its
 * colour code and its family), the families in display order, and the
 * colours most teams pick, in order ("common first", for the start card's
 * first row). Customers choose only palette colours. A colour code a coach
 * types ("#1A5FB4") is matched to the nearest palette colour by the CIEDE2000
 * difference; the design then holds the palette colour as the printed
 * colour, with the code the coach asked for beside it (`requested`), so
 * nothing off-palette can ever be printed (decision 009-6).
 *
 * The match level thresholds are data (`DEFAULT_MATCH_THRESHOLDS`), from the
 * interface specification (06-editor.md, 4.3), to be tuned against the real
 * print-tested palette.
 */
import { z } from "zod";
import { colourDifference, parseColourCode } from "./colour.js";
import { HEX_PATTERN, ID_PATTERN, type ColorValue } from "./schema.js";
import { parseWith, type ValidationError, type ValidationResult } from "./validate.js";

const id = z.string().regex(ID_PATTERN, "must be 1 to 64 characters: letters, digits, '-', '_' or '.', starting with a letter or digit");

export const paletteColourSchema = z.strictObject({
  id,
  /** The colour's name, as customers see it ("Royal blue"). */
  name: z.string().min(1).max(100),
  hex: z.string().regex(HEX_PATTERN, "must be an upper-case hex colour like #1B2A5C"),
  /** The family it is shown in (an id from `families`). */
  family: id,
});

export const paletteFamilySchema = z.strictObject({
  id,
  name: z.string().min(1).max(100),
});

export const paletteSchema = z.strictObject({
  id,
  /** Revision of the palette. A design names the palette id and version it was made with. */
  version: z.number().int().min(0),
  /**
   * True only for a palette whose colours were printed and measured on our
   * fabrics. Placeholder palettes say false, and the editor may say so.
   */
  printTested: z.boolean(),
  /** A note for people reading the file. */
  note: z.string().max(1000).optional(),
  /** Families in display order. */
  families: z.array(paletteFamilySchema).min(1),
  /** The colours most teams choose, most common first (ids from `colors`). */
  common: z.array(id),
  colors: z.array(paletteColourSchema).min(1),
});

export type PaletteColour = z.infer<typeof paletteColourSchema>;
export type PaletteFamily = z.infer<typeof paletteFamilySchema>;
export type Palette = z.infer<typeof paletteSchema>;

function error(path: string, message: string): ValidationError {
  return { path, message: `${path}: ${message}` };
}

/**
 * Validates a palette. Never throws. Beyond the structure: ids are unique,
 * every colour's family is listed, every common colour exists (once), every
 * family has a colour, and no two colours share a code.
 */
export function validatePalette(input: unknown): ValidationResult<Palette> {
  try {
    const parsed = parseWith(paletteSchema, input, "a palette", null);
    if (!parsed.ok) return parsed;
    const palette = parsed.value;
    const errors: ValidationError[] = [];
    const families = new Set<string>();
    palette.families.forEach((f, i) => {
      if (families.has(f.id)) errors.push(error(`families[${i}].id`, `duplicate family id "${f.id}"`));
      families.add(f.id);
    });
    const ids = new Set<string>();
    const codes = new Map<string, string>();
    const used = new Set<string>();
    palette.colors.forEach((c, i) => {
      if (ids.has(c.id)) errors.push(error(`colors[${i}].id`, `duplicate colour id "${c.id}"`));
      ids.add(c.id);
      const same = codes.get(c.hex);
      if (same) errors.push(error(`colors[${i}].hex`, `${c.hex} is already colour "${same}"`));
      codes.set(c.hex, c.id);
      if (!families.has(c.family)) errors.push(error(`colors[${i}].family`, `"${c.family}" is not one of the families`));
      used.add(c.family);
    });
    palette.families.forEach((f, i) => {
      if (!used.has(f.id)) errors.push(error(`families[${i}]`, `family "${f.id}" has no colours`));
    });
    const common = new Set<string>();
    palette.common.forEach((c, i) => {
      if (!ids.has(c)) errors.push(error(`common[${i}]`, `"${c}" is not a colour of this palette`));
      else if (common.has(c)) errors.push(error(`common[${i}]`, `"${c}" is listed twice`));
      common.add(c);
    });
    return errors.length > 0 ? { ok: false, errors } : parsed;
  } catch (e) {
    return { ok: false, errors: [{ path: "", message: `a palette could not be read (${e instanceof Error ? e.message : String(e)})` }] };
  }
}

/** A palette colour as a colour value for a design. */
export function paletteColourRef(colour: Pick<PaletteColour, "id" | "hex">): ColorValue {
  return { id: colour.id, hex: colour.hex };
}

/** The palette colour with this id, or undefined. */
export function findPaletteColour(palette: Palette, colourId: string): PaletteColour | undefined {
  return palette.colors.find((c) => c.id === colourId);
}

/** The common colours, most common first, then every other colour in palette order (the start card's row). */
export function coloursCommonFirst(palette: Palette): PaletteColour[] {
  const byId = new Map(palette.colors.map((c) => [c.id, c]));
  const first = palette.common.flatMap((cid) => byId.get(cid) ?? []);
  const rest = palette.colors.filter((c) => !palette.common.includes(c.id));
  return [...first, ...rest];
}

/** The families in display order, each with its colours in palette order (the "All colours" groups). */
export function coloursByFamily(palette: Palette): Array<{ family: PaletteFamily; colours: PaletteColour[] }> {
  return palette.families.map((family) => ({ family, colours: palette.colors.filter((c) => c.family === family.id) }));
}

/** How close a palette colour is to a code the coach asked for. */
export type MatchLevel = "very-close" | "close" | "different";

export interface MatchThresholds {
  /** ΔE00 at or below this: "very close". */
  veryClose: number;
  /** ΔE00 at or below this (and above `veryClose`): "close". Above: "different". */
  close: number;
}

/** From the specification (06-editor.md, 4.3): up to 2 very close, up to 6 close, above 6 clearly different. */
export const DEFAULT_MATCH_THRESHOLDS: MatchThresholds = Object.freeze({ veryClose: 2, close: 6 });

/** The match level for a CIEDE2000 difference. */
export function matchLevel(deltaE: number, thresholds: MatchThresholds = DEFAULT_MATCH_THRESHOLDS): MatchLevel {
  if (deltaE <= thresholds.veryClose) return "very-close";
  if (deltaE <= thresholds.close) return "close";
  return "different";
}

export interface NearestColour {
  colour: PaletteColour;
  /** CIEDE2000 difference between the code and the palette colour. */
  deltaE: number;
  match: MatchLevel;
}

/**
 * The palette colour nearest to a colour code, by CIEDE2000. Ties go to the
 * colour listed first. Throws a RangeError for a value that is not a colour code.
 */
export function nearestPaletteColour(
  palette: Pick<Palette, "colors">,
  hex: string,
  thresholds: MatchThresholds = DEFAULT_MATCH_THRESHOLDS,
): NearestColour {
  const code = parseColourCode(hex);
  if (!code) throw new RangeError(`nearestPaletteColour: not a colour code: ${JSON.stringify(hex)}`);
  let best: PaletteColour | undefined;
  let bestDelta = Infinity;
  for (const colour of palette.colors) {
    const delta = colourDifference(code, colour.hex);
    if (delta < bestDelta) {
      best = colour;
      bestDelta = delta;
    }
  }
  if (!best) throw new RangeError("nearestPaletteColour: the palette has no colours");
  return { colour: best, deltaE: bestDelta, match: matchLevel(bestDelta, thresholds) };
}

export type ColourCodeMatch =
  | {
      ok: true;
      /** The code as typed, made upper-case "#RRGGBB". */
      requested: string;
      colour: PaletteColour;
      deltaE: number;
      match: MatchLevel;
      /** What the design should hold: the palette colour, with the requested code beside it. */
      value: ColorValue;
    }
  | { ok: false; code: "invalid-code"; error: string };

/**
 * The colour-code match for the Colours tool: reads what the coach typed
 * (3 or 6 hex digits, with or without "#") and returns the nearest palette
 * colour, the difference, the match level, and the colour value to apply
 * (the palette colour, plus `requested`). An invalid code is refused; nothing
 * is matched.
 */
export function matchColourCode(
  palette: Pick<Palette, "colors">,
  input: unknown,
  thresholds: MatchThresholds = DEFAULT_MATCH_THRESHOLDS,
): ColourCodeMatch {
  const requested = parseColourCode(input);
  if (!requested) {
    return { ok: false, code: "invalid-code", error: `${JSON.stringify(input)} is not a colour code: use 3 or 6 hexadecimal digits (0-9, A-F), with or without "#"` };
  }
  const nearest = nearestPaletteColour(palette, requested, thresholds);
  return { ok: true, requested, ...nearest, value: { id: nearest.colour.id, hex: nearest.colour.hex, requested } };
}
