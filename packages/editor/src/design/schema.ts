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

/** Version of this document format. Not the version of a saved design. */
export const DESIGN_SCHEMA_VERSION = 1 as const;

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

export const fontRefSchema = z.strictObject({
  /** Id that text and number layers use in `fontId`. */
  id,
  family: z.string().min(1).max(100),
  weight: z.number().int().min(1).max(1000).optional(),
  style: z.enum(["normal", "italic"]).optional(),
  /** Reference to the font file in asset storage. Omitted for built-in fonts. */
  assetId: id.optional(),
});

export const assetRefSchema = z.strictObject({
  /** Id of the file in asset storage (customer upload or clipart library). */
  assetId: id,
  /** SVG stays SVG. Raster sources are kept as the original file, never re-encoded. */
  mediaType: z.enum(["image/svg+xml", "image/png", "image/jpeg"]),
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
  /** Em size in mm. */
  fontSize: finite.positive(),
  fill: colorRefSchema,
  align: z.enum(["left", "center", "right"]),
};

export const textLayerSchema = z.strictObject({
  id,
  kind: z.literal("text"),
  ...placement,
  value: z.string().min(1).max(200),
  ...textStyle,
});

export const numberLayerSchema = z.strictObject({
  id,
  kind: z.literal("number"),
  ...placement,
  /** One to three digits, kept as text so "00" and "07" survive. */
  value: z.string().regex(/^[0-9]{1,3}$/, "must be 1 to 3 digits"),
  ...textStyle,
});

export const logoLayerSchema = z.strictObject({
  id,
  kind: z.literal("logo"),
  ...placement,
  asset: assetRefSchema,
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

export const pieceSchema = z.strictObject({
  id,
  name: z.string().min(1).max(100),
  /** Name of the mesh in the model file that carries this piece. */
  mesh: z.string().min(1),
  /** Flat piece size in mm. */
  width: finite.positive(),
  height: finite.positive(),
  /**
   * Where the piece sits in the model's UV space (glTF convention: origin
   * top-left, V down). The piece's top-left corner maps to (x, y) and its
   * bottom-right to (x + width, y + height).
   */
  uv: z.strictObject({
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
    width: z.number().gt(0).max(1),
    height: z.number().gt(0).max(1),
  }),
});

export const zoneSchema = z.strictObject({
  id: zoneId,
  name: z.string().min(1).max(100),
  /** Names of the materials in the model file that this zone colours. */
  materials: z.array(z.string().min(1)).min(1),
  defaultColor: colorRefSchema,
});

export const productDefinitionSchema = z.strictObject({
  schemaVersion: z.literal(DESIGN_SCHEMA_VERSION, { error: `must be ${DESIGN_SCHEMA_VERSION}, the format version this code understands` }),
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
export type TextLayer = z.infer<typeof textLayerSchema>;
export type NumberLayer = z.infer<typeof numberLayerSchema>;
export type LogoLayer = z.infer<typeof logoLayerSchema>;
export type ClipartLayer = z.infer<typeof clipartLayerSchema>;
export type Layer = z.infer<typeof layerSchema>;
export type LayerKind = Layer["kind"];
export type DesignDocument = z.infer<typeof designSchema>;
export type PatternPiece = z.infer<typeof pieceSchema>;
export type ColorZone = z.infer<typeof zoneSchema>;
export type ProductDefinition = z.infer<typeof productDefinitionSchema>;
