/**
 * The design document format: the single source of truth.
 *
 * Both the TypeScript types and the JSON Schema are derived from the zod
 * schemas in this file, so they cannot drift apart. A design is DATA: previews,
 * proofs and production files are all generated from this JSON, so nothing in
 * it is ever flattened to pixels.
 *
 * This module must stay free of React and Three.js imports. The backend
 * imports it (through `@fitmyoutfit/editor/design`) to validate documents.
 *
 * Coordinates: see README.md. In short, positions and sizes are in millimetres
 * on the flat pattern piece, origin at the piece's top-left corner, X to the
 * right, Y downwards, rotation in degrees clockwise about the layer centre.
 */
import { z } from "zod";
import { DEFAULT_JERSEY_NUMBER_RULES } from "./jersey-number-rules.js";
import { checkJerseyNumber } from "./jersey-number.js";
import { MAX_PATH_LENGTH, SVG_PATH_PATTERN, parseSvgPath } from "./svg-path.js";
import { TEXT_ALIGNS, TEXT_DIRECTIONS, isNormalizedText } from "./text.js";

/**
 * Version of the design document format. Not the version of a saved design.
 * Version 2 (step E2): text alignment by reading direction (start, center,
 * end), a text direction, NFC text, font fallbacks, and asset references that
 * carry the image's pixel size. Version 1 documents are refused (none were
 * ever saved in production).
 */
export const DESIGN_SCHEMA_VERSION = 2 as const;
/** Version of the product definition format. It did not change in E2. */
export const PRODUCT_SCHEMA_VERSION = 1 as const;

/** Stable identifier: letters, digits, dash, underscore, dot. */
export const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/;
/** Colours are stored as upper-case #RRGGBB. */
export const HEX_PATTERN = /^#[0-9A-F]{6}$/;

const id = z
  .string()
  .regex(ID_PATTERN, "must be 1 to 64 characters: letters, digits, '-', '_' or '.', starting with a letter or digit");

/**
 * Zone ids are also used as object keys (`design.zones[zoneId]`), so the names
 * that mean something special on a JavaScript object are not allowed.
 * `__proto__` already fails ID_PATTERN; the other two are listed explicitly.
 */
export const RESERVED_KEYS = ["__proto__", "constructor", "prototype"] as const;
export const ZONE_ID_PATTERN = /^(?!(?:__proto__|constructor|prototype)$)[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/;
const zoneId = z
  .string()
  .regex(
    ZONE_ID_PATTERN,
    `must be 1 to 64 characters: letters, digits, '-', '_' or '.', starting with a letter or digit, and not one of: ${RESERVED_KEYS.join(", ")}`,
  );

const finite = z.number();

/** An enum whose message lists the choices, and says "missing" when the field is absent. */
function choice<const T extends readonly [string, ...string[]]>(values: T) {
  const list = values.map((v) => JSON.stringify(v)).join(", ");
  return z.enum(values, {
    error: (issue) =>
      issue.input === undefined ? `is required but missing (one of ${list})` : `must be one of ${list}`,
  });
}

export const paletteRefSchema = z.strictObject({
  /** Palette identifier, for example "fmo-print-2026". */
  id,
  /** Palette revision, so old designs can still be read against old colours. */
  version: z.number().int().min(0),
});

export const colorRefSchema = z.strictObject({
  /** Colour id inside the palette. */
  id,
  /** The colour as upper-case #RRGGBB, copied from the palette when picked. */
  hex: z.string().regex(HEX_PATTERN, "must be an upper-case hex colour like #1B2A5C"),
});

export const pointSchema = z.strictObject({ x: finite, y: finite });

export const sizeSchema = z.strictObject({
  width: finite.positive(),
  height: finite.positive(),
});

/**
 * A font family name as it goes into a CSS font string: printable characters
 * without quotes, backslashes, semicolons, braces or angle brackets.
 */
export const FONT_FAMILY_PATTERN = /^[^"'\\;{}<>\p{Cc}]{1,100}$/u;

export const fontRefSchema = z.strictObject({
  /** Id that text and number layers use in `fontId`. */
  id,
  /** The font family name, exactly as the font files declare it, for example "Noto Sans Arabic". */
  family: z
    .string()
    .regex(
      FONT_FAMILY_PATTERN,
      "must be a font family name of 1 to 100 characters, without quotes, backslashes, semicolons, braces or angle brackets",
    ),
  weight: z.number().int().min(1).max(1000).optional(),
  style: z.enum(["normal", "italic"]).optional(),
  /** Reference to the font file in asset storage. Omitted for built-in fonts. */
  assetId: id.optional(),
  /**
   * Other fonts of this document (their ids), tried in order for characters
   * this font does not have: an Arabic font after a Latin one, so a name such
   * as "Ali علي" prints with known fonts only. Part of the document because the
   * proof and the production file must use the same fonts as the preview.
   */
  fallbackFontIds: z.array(id).max(8).optional(),
});

/** Image formats an asset reference may name. SVG is for curated clipart only; customer logos are raster (see upload-checks.ts). */
export const ASSET_MEDIA_TYPES = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"] as const;
/** Image formats a customer's logo may have: the ones the upload checks accept. */
export const LOGO_MEDIA_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
export type LogoMediaType = (typeof LOGO_MEDIA_TYPES)[number];

const pixelCount = z.number().int().min(1).max(100_000);

const assetRefFields = {
  /** Id of the file in asset storage (customer upload or clipart library). The bytes are never in the design. */
  assetId: id,
  /** Width of the image in pixels (for SVG: its declared size). The print resolution (DPI) check uses it. */
  width: pixelCount,
  /** Height of the image in pixels. */
  height: pixelCount,
};

export const assetRefSchema = z.strictObject({
  ...assetRefFields,
  /** SVG stays SVG. Raster sources are kept as the original file, never re-encoded. */
  mediaType: z.enum(ASSET_MEDIA_TYPES),
});

/** A customer's uploaded logo: one of the raster formats the upload checks accept. */
export const logoAssetRefSchema = z.strictObject({
  ...assetRefFields,
  mediaType: z.enum(LOGO_MEDIA_TYPES),
});

/** Where a layer sits on a pattern piece, in pattern-piece coordinates (mm). */
const placement = {
  /** Id of the pattern piece (from the product definition) the layer sits on. */
  pieceId: id,
  /** Layer centre in mm from the piece's top-left corner, Y down. */
  position: pointSchema,
  /** Unrotated layer box in mm. */
  size: sizeSchema,
  /** Degrees, clockwise, about the layer centre. */
  rotation: finite,
};

const textStyle = {
  fontId: id,
  /** Em size in mm. Resizing a text or number layer scales this and `size` together. */
  fontSize: finite.positive(),
  fill: colorRefSchema,
  /**
   * Where the line sits across the layer box, by reading direction: "start" is
   * the left edge for left-to-right text and the right edge for right-to-left
   * text. Vertically the line is centred on the box.
   */
  align: choice(TEXT_ALIGNS),
};

/** One line: no line breaks, tabs or other control characters. */
const ONE_LINE = /^[^\p{Cc}]*$/u;

/** The longest text value, in UTF-16 code units. */
export const MAX_TEXT_LENGTH = 200;

export const textLayerSchema = z.strictObject({
  id,
  kind: z.literal("text"),
  ...placement,
  /**
   * One line of text in any script (Latin, Arabic, Urdu, mixed), in Unicode
   * NFC. Stored as text plus a font reference, never as a picture or outlines.
   */
  value: z
    .string()
    .min(1)
    .max(MAX_TEXT_LENGTH)
    .regex(ONE_LINE, "must be one line of text: no line breaks, tabs or other control characters")
    .refine((value) => value.trim().length > 0, "must contain a visible character, not only spaces")
    .refine(isNormalizedText, "must be in Unicode normal form NFC (the edit functions normalise text; or use normalizeText())")
    .describe(
      `One line of text in any script, 1 to ${MAX_TEXT_LENGTH} UTF-16 code units. It must also be in Unicode NFC and hold a visible character, ` +
        "which this schema cannot check: validateDesign() from @fitmyoutfit/editor/design does.",
    ),
  /** Reading direction. "auto" follows the first strong letter of the text (Unicode bidi rules P2 and P3). */
  direction: choice(TEXT_DIRECTIONS),
  ...textStyle,
});

/**
 * The structural part of the jersey number rule, built from the default rules
 * data: one or more digits, all from ONE of the allowed digit systems (so
 * mixing is forbidden here too). It says nothing about length or size: the
 * maximum is data, so `validateDesign` and the edit functions enforce it, with
 * rules that can be passed in. See jersey-number.ts.
 */
export const JERSEY_NUMBER_VALUE_PATTERN = `^(?:${DEFAULT_JERSEY_NUMBER_RULES.digitSystems
  .map((s) => {
    const hex = (code: number) => code.toString(16).toUpperCase().padStart(4, "0");
    // A backslash-u escape in the pattern text, so the JSON Schema stays plain ASCII.
    return String.raw`[\u${hex(s.zero)}-\u${hex(s.zero + 9)}]+`;
  })
  .join("|")})$`;

const NUMBER_VALUE_DESCRIPTION =
  `A jersey number: one or more digits from one digit system (Western 0-9, Arabic-Indic ٠-٩ or Extended Arabic-Indic ۰-۹), kept as typed so "07" survives. ` +
  `This pattern checks the structure only. The largest number (${DEFAULT_JERSEY_NUMBER_RULES.maxValue}, so at most ${String(DEFAULT_JERSEY_NUMBER_RULES.maxValue).length} digits) is data, not part of the pattern, ` +
  `and is enforced by validateDesign() from @fitmyoutfit/editor/design, as are the allowed digit systems when the rules are changed. ` +
  `Do not rely on this schema alone to accept a number layer.`;

export const numberLayerSchema = z.strictObject({
  id,
  kind: z.literal("number"),
  ...placement,
  value: z
    .string()
    .regex(new RegExp(JERSEY_NUMBER_VALUE_PATTERN), {
      // The readable reason comes from the one rule function, so it is the same everywhere.
      error: (issue) => {
        const result = checkJerseyNumber(issue.input);
        return result.ok ? "is not a valid jersey number" : result.error;
      },
    })
    .describe(NUMBER_VALUE_DESCRIPTION),
  ...textStyle,
});

/**
 * A customer's logo: a reference to the uploaded file (id, pixel size, type),
 * never its bytes. It is drawn as large as fits inside `size` while keeping the
 * image's proportions, centred in the box.
 */
export const logoLayerSchema = z.strictObject({
  id,
  kind: z.literal("logo"),
  ...placement,
  asset: logoAssetRefSchema,
});

export const clipartLayerSchema = z.strictObject({
  id,
  kind: z.literal("clipart"),
  ...placement,
  asset: assetRefSchema,
});

const LAYER_KINDS = "text, number, logo, clipart";

export const layerSchema = z.discriminatedUnion(
  "kind",
  [textLayerSchema, numberLayerSchema, logoLayerSchema, clipartLayerSchema],
  {
    error: (issue) => {
      const input = issue.input;
      if (typeof input !== "object" || input === null || Array.isArray(input)) {
        return `must be a layer object with a 'kind' of ${LAYER_KINDS}`;
      }
      const kind = (input as Record<string, unknown>).kind;
      return kind === undefined
        ? `is required: one of ${LAYER_KINDS}`
        : `${JSON.stringify(kind)} is not a layer kind; use one of ${LAYER_KINDS}`;
    },
  },
);

export const designSchema = z.strictObject({
  schemaVersion: z.literal(DESIGN_SCHEMA_VERSION, { error: `must be ${DESIGN_SCHEMA_VERSION}, the format version this code understands` }),
  /** Which product definition this design is for. */
  product: z.strictObject({ id }),
  palette: paletteRefSchema,
  /** Zone id to colour. Holds one entry per colour zone of the product. */
  zones: z.record(zoneId, colorRefSchema),
  /** Fonts used by text and number layers. */
  fonts: z.array(fontRefSchema),
  /** Bottom to top: later layers are drawn over earlier ones. */
  layers: z.array(layerSchema),
});

// Product definition: the garment model and its pattern pieces, as data.

/**
 * SVG path data in a piece's own coordinates (mm, origin top-left, Y down).
 * The JSON Schema checks the characters; `validateProductDefinition` parses
 * the path, which is the rule (see svg-path.ts for the supported commands).
 */
const svgPathData = z
  .string()
  .min(1)
  .max(MAX_PATH_LENGTH)
  .regex(new RegExp(SVG_PATH_PATTERN), {
    error: (issue) => {
      const base = "may only hold the path commands M, L, H, V, C, Q and Z (either case), numbers, spaces and commas";
      const parsed = parseSvgPath(issue.input);
      // Name the unsupported command when there is one (an arc, say), which is the likely mistake.
      return !parsed.ok && parsed.error.includes("is not supported") ? `${base}: ${parsed.error}` : base;
    },
    abort: true,
  })
  .superRefine((value, ctx) => {
    const parsed = parseSvgPath(value);
    if (!parsed.ok) ctx.addIssue({ code: "custom", message: `is not usable path data: ${parsed.error}` });
  });

const SVG_PATH_RULE_NOTE =
  "This pattern checks the characters only; validateProductDefinition() from @fitmyoutfit/editor/design parses the path " +
  "and checks the outline is closed, inside the piece and that zones exist. Do not rely on this schema alone.";

export const pieceRegionSchema = z.strictObject({
  /** The colour zone this area belongs to. */
  zone: zoneId,
  /**
   * The area, as SVG path data in the piece's millimetres. It may reach past
   * the piece's outline (a band that runs to the edge, for example): only the
   * part inside the outline is part of the garment.
   */
  path: svgPathData.describe(
    "SVG path data (M, L, H, V, C, Q, Z) in the piece's millimetres. May reach past the outline; only the part inside it counts. " +
      SVG_PATH_RULE_NOTE,
  ),
});

export const pieceSchema = z.strictObject({
  id,
  name: z.string().min(1).max(100),
  /** Name of the mesh (node) in the model file that carries this piece. Several pieces may share one mesh. */
  mesh: z.string().min(1),
  /** Flat piece size in mm: the box the outline sits in. */
  width: finite.positive(),
  height: finite.positive(),
  /**
   * Where the piece's box sits in the model's UV space (glTF convention:
   * origin top-left, V down). The piece's top-left corner maps to (x, y) and
   * its bottom-right to (x + width, y + height). It must have the same
   * proportions as the piece, so artwork is not stretched.
   */
  uv: z.strictObject({
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
    width: z.number().gt(0).max(1),
    height: z.number().gt(0).max(1),
  }),
  /**
   * The cut shape of the flat piece: one closed SVG path in the piece's
   * millimetres, inside the box (0, 0) to (width, height). It is the vector
   * that production files are cut from; the model's UVs for this piece lie inside it.
   */
  outline: svgPathData.describe(
    "The cut shape of the piece: one closed SVG path (M, L, H, V, C, Q, Z) in the piece's millimetres, inside its width and height. " +
      SVG_PATH_RULE_NOTE,
  ),
  /** The colour zone that fills the whole piece. `regions` are drawn over it. */
  zone: zoneId,
  /** Areas of other colour zones on this piece, bottom to top. */
  regions: z.array(pieceRegionSchema).max(100),
});

export const zoneSchema = z.strictObject({
  id: zoneId,
  name: z.string().min(1).max(100),
  /** Colour of the zone in a new design. Where the zone is drawn is set by the pieces (`zone` and `regions`). */
  defaultColor: colorRefSchema,
});

export const productDefinitionSchema = z.strictObject({
  schemaVersion: z.literal(PRODUCT_SCHEMA_VERSION, { error: `must be ${PRODUCT_SCHEMA_VERSION}, the format version this code understands` }),
  id,
  name: z.string().min(1).max(200),
  model: z.strictObject({
    /** Absolute URL, or a path the host app serves. */
    url: z.string().min(1),
    format: z.literal("glb"),
  }),
  /** Palette new designs for this product start from. */
  palette: paletteRefSchema,
  pieces: z.array(pieceSchema).min(1),
  zones: z.array(zoneSchema).min(1),
});

export type PaletteRef = z.infer<typeof paletteRefSchema>;
export type ColorRef = z.infer<typeof colorRefSchema>;
export type Point = z.infer<typeof pointSchema>;
export type Size = z.infer<typeof sizeSchema>;
export type FontRef = z.infer<typeof fontRefSchema>;
export type AssetRef = z.infer<typeof assetRefSchema>;
export type LogoAssetRef = z.infer<typeof logoAssetRefSchema>;
export type TextLayer = z.infer<typeof textLayerSchema>;
export type NumberLayer = z.infer<typeof numberLayerSchema>;
export type LogoLayer = z.infer<typeof logoLayerSchema>;
export type ClipartLayer = z.infer<typeof clipartLayerSchema>;
export type Layer = z.infer<typeof layerSchema>;
export type LayerKind = Layer["kind"];
export type DesignDocument = z.infer<typeof designSchema>;
export type PatternPiece = z.infer<typeof pieceSchema>;
export type PieceRegion = z.infer<typeof pieceRegionSchema>;
export type ColorZone = z.infer<typeof zoneSchema>;
export type ProductDefinition = z.infer<typeof productDefinitionSchema>;
