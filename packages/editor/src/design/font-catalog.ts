/**
 * The fonts a customer can choose from, as data: a catalogue file (see
 * samples/fonts/placeholder-fonts.json) lists each font's family, weight, the
 * scripts it covers, the fonts to fall back to for other scripts, and its
 * licence. A design copies the font references it uses into `design.fonts`
 * (as it copies colour HEX values from the palette), so a design renders
 * without the catalogue.
 *
 * The catalogue does not hold font files. The host application makes the
 * families available to the browser (for example by importing the
 * `@fontsource/*` CSS named in `licence.package`); the editor waits for them
 * before it trusts a drawing (see texture/fonts.ts).
 */
import { z } from "zod";
import { FONT_FAMILY_PATTERN, ID_PATTERN, type DesignDocument, type FontRef } from "./schema.js";
import { DesignError, parseWith, type ValidationError, type ValidationResult } from "./validate.js";
import { addFont } from "./edit.js";

const id = z.string().regex(ID_PATTERN, "must be 1 to 64 characters: letters, digits, '-', '_' or '.', starting with a letter or digit");

/** Scripts a font can cover. Urdu is written in the Arabic script. */
export const FONT_SCRIPTS = ["latin", "arabic"] as const;
export type FontScript = (typeof FONT_SCRIPTS)[number];

export const fontLicenceSchema = z.strictObject({
  /** SPDX identifier, for example "OFL-1.1". */
  spdx: z.string().min(1).max(64),
  /** The copyright line from the font's licence file. */
  copyright: z.string().min(1).max(500),
  /** Where the font files come from: the npm package that ships them. */
  package: z.string().min(1).max(214),
  /** The licence text or the font's home page. */
  url: z.url(),
});

export const fontCatalogEntrySchema = z.strictObject({
  id,
  /** Name shown to the customer. */
  name: z.string().min(1).max(100),
  family: z.string().regex(FONT_FAMILY_PATTERN, "must be a font family name without quotes, backslashes, semicolons, braces or angle brackets"),
  weight: z.number().int().min(1).max(1000),
  style: z.enum(["normal", "italic"]),
  /** The scripts this font has letters for. */
  scripts: z.array(z.enum(FONT_SCRIPTS)).min(1),
  /** Catalogue fonts (ids) to use, in order, for characters this font does not have. */
  fallbackFontIds: z.array(id).max(8),
  /** What the font is offered for. */
  uses: z.array(z.enum(["text", "number"])).min(1),
  licence: fontLicenceSchema,
});

export const fontCatalogSchema = z.strictObject({
  id,
  version: z.number().int().min(0),
  fonts: z.array(fontCatalogEntrySchema).min(1),
});

export type FontLicence = z.infer<typeof fontLicenceSchema>;
export type FontCatalogEntry = z.infer<typeof fontCatalogEntrySchema>;
export type FontCatalog = z.infer<typeof fontCatalogSchema>;

/** Validates a font catalogue: the structure, unique ids, and fallbacks that exist and do not loop. Never throws. */
export function validateFontCatalog(input: unknown): ValidationResult<FontCatalog> {
  let parsed: ValidationResult<FontCatalog>;
  try {
    parsed = parseWith(fontCatalogSchema, input, "a font catalogue", null);
  } catch (error) {
    return { ok: false, errors: [{ path: "", message: `a font catalogue could not be read (${String(error)})` }] };
  }
  if (!parsed.ok) return parsed;
  const errors: ValidationError[] = [];
  const ids = new Set<string>();
  parsed.value.fonts.forEach((font, i) => {
    if (ids.has(font.id)) errors.push({ path: `fonts[${i}].id`, message: `fonts[${i}].id: duplicate font id "${font.id}"` });
    ids.add(font.id);
  });
  parsed.value.fonts.forEach((font, i) => {
    font.fallbackFontIds.forEach((fallback, k) => {
      const path = `fonts[${i}].fallbackFontIds[${k}]`;
      if (fallback === font.id) errors.push({ path, message: `${path}: a font cannot be its own fallback` });
      else if (!ids.has(fallback)) errors.push({ path, message: `${path}: "${fallback}" is not a font of this catalogue` });
      else {
        const target = parsed.value.fonts.find((f) => f.id === fallback);
        if (target && target.fallbackFontIds.length > 0) {
          errors.push({ path, message: `${path}: "${fallback}" has fallbacks of its own; a fallback must be a font without fallbacks` });
        }
      }
    });
  });
  return errors.length > 0 ? { ok: false, errors } : parsed;
}

/** The design's font reference for a catalogue font. */
export function fontRefFromCatalog(entry: FontCatalogEntry): FontRef {
  const ref: FontRef = { id: entry.id, family: entry.family, weight: entry.weight, style: entry.style };
  if (entry.fallbackFontIds.length > 0) ref.fallbackFontIds = [...entry.fallbackFontIds];
  return ref;
}

/**
 * Adds a catalogue font and its fallbacks to the design (fallbacks first, so
 * the references hold). A font the design already has is replaced by the
 * catalogue's version.
 */
export function addCatalogFont(design: DesignDocument, catalog: FontCatalog, fontId: string): DesignDocument {
  const entry = catalog.fonts.find((f) => f.id === fontId);
  if (!entry) {
    throw new DesignError(
      `Cannot add font: "${fontId}" is not in font catalogue "${catalog.id}" (fonts: ${catalog.fonts.map((f) => f.id).join(", ")})`,
    );
  }
  let next = design;
  for (const fallbackId of entry.fallbackFontIds) {
    const fallback = catalog.fonts.find((f) => f.id === fallbackId);
    if (!fallback) throw new DesignError(`Cannot add font "${fontId}": its fallback "${fallbackId}" is not in the catalogue`);
    next = addFont(next, fontRefFromCatalog(fallback));
  }
  return addFont(next, fontRefFromCatalog(entry));
}
