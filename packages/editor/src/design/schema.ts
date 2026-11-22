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
import { LETTER_CASES } from "./letter-case.js";
import { MAX_PATH_LENGTH, SVG_PATH_PATTERN, parseSvgPath } from "./svg-path.js";
import { TEXT_ALIGNS, TEXT_DIRECTIONS, isNormalizedText } from "./text.js";

/**
 * Version of the design document format. Not the version of a saved design.
 * Version 3 (step E3a): team colours, colours that follow a team colour,
 * the colour code a coach asked for, a role on every layer, placement
 * presets, text outlines, shapes, the team name and a sample player, and the
 * template last applied. A version 2 document is upgraded by `upgradeDesign`
 * (upgrade.ts); version 1 documents are refused (none were ever saved).
 */
export const DESIGN_SCHEMA_VERSION = 3 as const;
/** Version of the product definition format. Version 2 (E3a): placement presets, default team colours, front and back views. */
export const PRODUCT_SCHEMA_VERSION = 2 as const;

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

const hex = z.string().regex(HEX_PATTERN, "must be an upper-case hex colour like #1B2A5C");

export const paletteRefSchema = z.strictObject({
  /** Palette identifier, for example "fmo-print-2026". */
  id,
  /** Palette revision, so old designs can still be read against old colours. */
  version: z.number().int().min(0),
});

/** A palette colour: its id in the palette and its code. */
export const colorRefSchema = z.strictObject({
  /** Colour id inside the palette. */
  id,
  /** The colour as upper-case #RRGGBB, copied from the palette when picked. */
  hex,
});

/** The team colours, in order: 1 Main, 2 Second, 3 Accent (optional). */
export const TEAM_COLOUR_ROLES = ["main", "second", "accent"] as const;
export type TeamColourRole = (typeof TEAM_COLOUR_ROLES)[number];

const requested = hex.describe(
  "The colour code the customer asked for (a code typed in the colour-code match), kept beside the palette colour it was matched to. " +
    "Never printed: `id` and `hex` are the printed colour.",
);

/** A team colour: a palette colour, and the code the coach asked for when it came from one. */
export const teamColorSchema = z.strictObject({
  id,
  hex,
  requested: requested.optional(),
});

/**
 * A colour as a design uses it (zones, text fills, outlines, shapes): always a
 * palette colour (`id`, `hex`: what is printed), optionally following a team
 * colour (`teamColor`: changing that team colour changes this one), or
 * carrying the code the customer asked for (`requested`). A colour that
 * follows a team colour holds that team colour's `id` and `hex` and no code of
 * its own (validateDesign checks both).
 */
export const colorValueSchema = z.strictObject({
  id,
  hex,
  teamColor: choice(TEAM_COLOUR_ROLES).optional(),
  requested: requested.optional(),
});

export const teamColorsSchema = z.strictObject({
  main: teamColorSchema,
  second: teamColorSchema,
  accent: teamColorSchema.optional(),
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

/**
 * What a layer is FOR, which the layer's kind does not say: the team name,
 * the player's name and number (swapped per player by the roster preview),
 * the crest, a sponsor, other text, or a graphic.
 */
export const ITEM_ROLES = ["team-name", "player-name", "player-number", "crest", "sponsor", "text", "graphic"] as const;
export type ItemRole = (typeof ITEM_ROLES)[number];

/** The roles each layer kind may have. A fixed number on every shirt is a `number` with the role `text`. */
export const ROLES_BY_KIND = {
  text: ["team-name", "player-name", "text", "sponsor"],
  number: ["player-number", "text"],
  logo: ["crest", "sponsor", "graphic"],
  clipart: ["crest", "sponsor", "graphic"],
} as const satisfies Record<string, readonly ItemRole[]>;

/** Roles whose value comes from the team or the player: the same text on every layer with the role. */
export const VALUE_ROLES = ["team-name", "player-name", "player-number"] as const;

/** Sides of the garment the camera can show. "left" is the wearer's left. */
export const VIEW_SIDES = ["front", "back", "left", "right"] as const;
export type ViewSide = (typeof VIEW_SIDES)[number];

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
  /**
   * The product's placement preset the layer was put at ("back-number",
   * "left-chest"), when it was. The position may have been moved from the
   * preset's centre since; the preset says where the layer belongs.
   */
  preset: id.optional(),
};

/** Text outline widths are in mm; this is the widest allowed. */
export const MAX_OUTLINE_MM = 20;

/**
 * An outline round text or a number: drawn outside the letters, `width` mm
 * wide, under the fill. Part of the data so proofs and production files
 * draw the same outline.
 */
export const outlineSchema = z.strictObject({
  color: colorValueSchema,
  /** Width in mm, measured outwards from the letter's edge. */
  width: finite.positive().max(MAX_OUTLINE_MM),
});

const textStyle = {
  fontId: id,
  /** Em size in mm. Resizing a text or number layer scales this and `size` together. */
  fontSize: finite.positive(),
  fill: colorValueSchema,
  /**
   * Where the line sits across the layer box, by reading direction: "start" is
   * the left edge for left-to-right text and the right edge for right-to-left
   * text. Vertically the line is centred on the box.
   */
  align: choice(TEXT_ALIGNS),
  outline: outlineSchema.optional(),
};

/** One line: no line breaks, tabs or other control characters. */
const ONE_LINE = /^[^\p{Cc}]*$/u;

/** The longest text value, in UTF-16 code units. */
export const MAX_TEXT_LENGTH = 200;

/** One line of text in NFC, possibly empty (the team name and the sample player's name may be empty). */
const oneLine = z
  .string()
  .max(MAX_TEXT_LENGTH)
  .regex(ONE_LINE, "must be one line of text: no line breaks, tabs or other control characters")
  .refine(isNormalizedText, "must be in Unicode normal form NFC (the edit functions normalise text; or use normalizeText())");

export const textLayerSchema = z.strictObject({
  id,
  kind: z.literal("text"),
  role: choice(ROLES_BY_KIND.text),
  ...placement,
  /**
   * One line of text in any script (Latin, Arabic, Urdu, mixed), in Unicode
   * NFC. Stored as text plus a font reference, never as a picture or outlines.
   * Empty only for the team name and the player's name (a slot waiting for
   * its text; nothing is drawn).
   */
  value: oneLine.describe(
    `One line of text in any script, at most ${MAX_TEXT_LENGTH} UTF-16 code units. It must also be in Unicode NFC, and hold a visible character ` +
      "unless the role is team-name or player-name (those may be empty), which this schema cannot check: validateDesign() from @fitmyoutfit/editor/design does.",
  ),
  /** Reading direction. "auto" follows the first strong letter of the text (Unicode bidi rules P2 and P3). */
  direction: choice(TEXT_DIRECTIONS),
  /**
   * How a PLAYER NAME is drawn (decision 012): "upper" draws the Latin letters in capitals, "as-typed" draws the text as
   * stored. Left out means the default, capitals, on a player-name item; other items always draw their text as stored.
   * The stored value is never changed, and Arabic-script text has no capitals.
   */
  letterCase: choice(LETTER_CASES).optional(),
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
    const hexDigits = (code: number) => code.toString(16).toUpperCase().padStart(4, "0");
    // A backslash-u escape in the pattern text, so the JSON Schema stays plain ASCII.
    return String.raw`[\u${hexDigits(s.zero)}-\u${hexDigits(s.zero + 9)}]+`;
  })
  .join("|")})$`;

const NUMBER_VALUE_DESCRIPTION =
  `A jersey number: one or more digits from one digit system (Western 0-9, Arabic-Indic ٠-٩ or Extended Arabic-Indic ۰-۹), kept as typed so "07" survives. ` +
  `This pattern checks the structure only. The largest number (${DEFAULT_JERSEY_NUMBER_RULES.maxValue}, so at most ${String(DEFAULT_JERSEY_NUMBER_RULES.maxValue).length} digits) is data, not part of the pattern, ` +
  `and is enforced by validateDesign() from @fitmyoutfit/editor/design, as are the allowed digit systems when the rules are changed. ` +
  `Do not rely on this schema alone to accept a number layer.`;

const jerseyNumberValue = z
  .string()
  .regex(new RegExp(JERSEY_NUMBER_VALUE_PATTERN), {
    // The readable reason comes from the one rule function, so it is the same everywhere.
    error: (issue) => {
      const result = checkJerseyNumber(issue.input);
      return result.ok ? "is not a valid jersey number" : result.error;
    },
  })
  .describe(NUMBER_VALUE_DESCRIPTION);

export const numberLayerSchema = z.strictObject({
  id,
  kind: z.literal("number"),
  role: choice(ROLES_BY_KIND.number),
  ...placement,
  value: jerseyNumberValue,
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
  role: choice(ROLES_BY_KIND.logo),
  ...placement,
  asset: logoAssetRefSchema,
});

export const clipartLayerSchema = z.strictObject({
  id,
  kind: z.literal("clipart"),
  role: choice(ROLES_BY_KIND.clipart),
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

/**
 * SVG path data in a piece's own coordinates (mm, origin top-left, Y down).
 * The JSON Schema checks the characters; the validators parse the path, which
 * is the rule (see svg-path.ts for the supported commands).
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
  "This pattern checks the characters only; validateProductDefinition() and validateDesign() from @fitmyoutfit/editor/design parse the path " +
  "and check where it lies. Do not rely on this schema alone.";

/**
 * A shape: a filled vector area on one pattern piece (a stripe, a hoop, a
 * sash, a chevron), drawn over the zones and under every layer, clipped to the
 * piece's outline. Templates bring them. `group` gathers the shapes that are
 * coloured together ("hoops" on the front, back and sleeves).
 */
export const shapeSchema = z.strictObject({
  id,
  kind: z.literal("shape"),
  /** Shapes coloured together share a group; the Colours tool shows one chip per group. */
  group: id,
  pieceId: id,
  /** The area, as SVG path data in the piece's millimetres. It may reach past the outline; only the part inside is drawn. */
  path: svgPathData.describe(
    "SVG path data (M, L, H, V, C, Q, Z) in the piece's millimetres. May reach past the outline; only the part inside it is drawn. " +
      SVG_PATH_RULE_NOTE,
  ),
  fill: colorValueSchema,
  /** A locked shape is part of the design: the interface offers its colour only, not moving or deleting it. */
  locked: z.boolean(),
});

/** The template a design was last given, by id and version. */
export const templateRefSchema = z.strictObject({ id, version: z.number().int().min(0) });

/** The player shown on the kit while designing (the roster preview swaps in each real player). Not part of the order. */
export const samplePlayerSchema = z.strictObject({
  /** May be empty. */
  name: oneLine,
  /** A jersey number, or empty when no layer shows the number. */
  number: z.union([z.literal(""), jerseyNumberValue]),
});

export const designSchema = z.strictObject({
  schemaVersion: z.literal(DESIGN_SCHEMA_VERSION, { error: `must be ${DESIGN_SCHEMA_VERSION}, the format version this code understands` }),
  /** Which product definition this design is for. */
  product: z.strictObject({ id }),
  palette: paletteRefSchema,
  /** The team's colours: Main, Second and an optional Accent, each a palette colour. */
  teamColors: teamColorsSchema,
  /** The team name, as typed. Every `team-name` layer shows it; kept here when no layer shows it. May be empty. */
  teamName: oneLine,
  samplePlayer: samplePlayerSchema,
  /** The template last applied, or null. */
  template: templateRefSchema.nullable(),
  /** Zone id to colour. Holds one entry per colour zone of the product. */
  zones: z.record(zoneId, colorValueSchema),
  /** Fonts used by text and number layers. */
  fonts: z.array(fontRefSchema),
  /** Shapes, drawn over the zones and under the layers, in this order. */
  shapes: z.array(shapeSchema).max(200),
  /** Bottom to top: later layers are drawn over earlier ones. */
  layers: z.array(layerSchema),
});

// Product definition: the garment model and its pattern pieces, as data.

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
  /**
   * Where items may be printed on this piece (06-editor.md 5.2, N6): a
   * rectangle in the piece's millimetres. An item's whole box stays inside it.
   * Without one, the piece's box is the limit (an item can still be cut by the
   * outline; the "clipped" check says so). Business data, placeholders until
   * the factories give their real print areas.
   */
  printArea: z
    .strictObject({ x: finite.min(0), y: finite.min(0), width: finite.positive(), height: finite.positive() })
    .optional(),
  /** The colour zone that fills the whole piece. `regions` are drawn over it. */
  zone: zoneId,
  /** Areas of other colour zones on this piece, bottom to top. */
  regions: z.array(pieceRegionSchema).max(100),
  /**
   * G3: the cloth's fine structure, seen only at the closest zooms of the 3D view: "interlock" (the default, the
   * smooth double knit of match jerseys) or "mesh" (a fine pinhole mesh, for side panels). Look only: it changes
   * nothing printed. Pieces that share one mesh in the model show the first piece's.
   */
  surface: z.enum(["interlock", "mesh"]).optional(),
});

export const zoneSchema = z.strictObject({
  id: zoneId,
  name: z.string().min(1).max(100),
  /** Colour of the zone in a new design. Where the zone is drawn is set by the pieces (`zone` and `regions`). */
  defaultColor: colorRefSchema,
});

/**
 * A named position on the garment ("left-chest", "back-number"): where a
 * layer of one of `roles` is put, on which piece, centred where, at most how
 * big, and which side the camera shows for it. Its centre lies in its piece's
 * print area, when the piece has one.
 */
export const placementPresetSchema = z.strictObject({
  id,
  /** A name for people reading the data ("Left chest"); the interface has its own wording. */
  name: z.string().min(1).max(100),
  pieceId: id,
  /** The centre, in the piece's millimetres. */
  centre: pointSchema,
  /** The largest box a layer gets here, in mm (text is shrunk to its width). */
  maxSize: sizeSchema,
  /** The roles of layers that may go here. */
  roles: z.array(choice(ITEM_ROLES)).min(1),
  /** The side the camera turns to for a layer here. */
  side: choice(VIEW_SIDES),
  /** The em size (mm) of text and numbers at the "medium" size; others are steps of it. */
  fontSize: finite.positive().optional(),
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
  /**
   * G3: an optional body model the garment is shown on (a person with a head and neck). It is only for looking at:
   * the canvas loads it after the garment, never picks, hovers, colours or prints on it, and the editor works the same
   * without one. The model is in the garment's frame (the same metres, Y up, front +Z); nothing in a design refers
   * to it. `url`: absolute, or a path the host app serves.
   */
  body: z
    .strictObject({
      url: z.string().min(1),
      format: z.literal("glb"),
      /**
       * The resting view shows the garment and this much more above it (the head and neck), in metres of the
       * garment's frame, and `frameBelow` metres under its hem. Both are looked at, never measured: the view
       * does not wait for the body to load.
       */
      frameAbove: z.number().finite().min(0).max(2),
      frameBelow: z.number().finite().min(0).max(2),
    })
    .optional(),
  /** Palette new designs for this product start from. */
  palette: paletteRefSchema,
  /** Team colours a new design starts with. */
  teamColors: teamColorsSchema,
  /** The pieces that show the front and the back (thumbnails, the flat view). */
  views: z.strictObject({ front: id, back: id }),
  pieces: z.array(pieceSchema).min(1),
  zones: z.array(zoneSchema).min(1),
  /** Named positions for layers, in the order the interface offers them. */
  placements: z.array(placementPresetSchema).max(100),
  /**
   * The smallest an item may be (E3c): the shorter side of its box, in mm, per kind of item. Resizing stops
   * there, and the print-area rule (`fitLayerToArea`) keeps every item at least this big where its area
   * allows. Business data: PLACEHOLDERS until the factories give their smallest printable sizes. Without
   * it, 5 mm for every kind.
   */
  minItemSize: z
    .strictObject({ text: finite.positive(), number: finite.positive(), logo: finite.positive(), clipart: finite.positive() })
    .optional(),
  /**
   * Where new items go first (E3c): for logos and for free text, the presets in the order a new item takes
   * them (the first free one). Presets not listed come after, in the order of `placements`.
   */
  placementOrder: z.strictObject({ logo: z.array(id).max(100), text: z.array(id).max(100) }).optional(),
});

export type PaletteRef = z.infer<typeof paletteRefSchema>;
export type ColorRef = z.infer<typeof colorRefSchema>;
export type ColorValue = z.infer<typeof colorValueSchema>;
export type TeamColor = z.infer<typeof teamColorSchema>;
export type TeamColors = z.infer<typeof teamColorsSchema>;
export type Point = z.infer<typeof pointSchema>;
export type Size = z.infer<typeof sizeSchema>;
export type FontRef = z.infer<typeof fontRefSchema>;
export type AssetRef = z.infer<typeof assetRefSchema>;
export type LogoAssetRef = z.infer<typeof logoAssetRefSchema>;
export type Outline = z.infer<typeof outlineSchema>;
export type TextLayer = z.infer<typeof textLayerSchema>;
export type NumberLayer = z.infer<typeof numberLayerSchema>;
export type LogoLayer = z.infer<typeof logoLayerSchema>;
export type ClipartLayer = z.infer<typeof clipartLayerSchema>;
export type Layer = z.infer<typeof layerSchema>;
export type LayerKind = Layer["kind"];
export type TextLikeLayer = TextLayer | NumberLayer;
export type Shape = z.infer<typeof shapeSchema>;
export type SamplePlayer = z.infer<typeof samplePlayerSchema>;
export type TemplateRef = z.infer<typeof templateRefSchema>;
export type DesignDocument = z.infer<typeof designSchema>;
export type PatternPiece = z.infer<typeof pieceSchema>;
export type PieceRegion = z.infer<typeof pieceRegionSchema>;
export type ColorZone = z.infer<typeof zoneSchema>;
export type PlacementPreset = z.infer<typeof placementPresetSchema>;
export type ProductDefinition = z.infer<typeof productDefinitionSchema>;
