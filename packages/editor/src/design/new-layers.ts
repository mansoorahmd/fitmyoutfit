/**
 * New layers with sensible first placements, as plain functions. They only
 * build layer objects; add them with `addLayer` (which validates them).
 *
 * - At a placement preset (`preset`): on the preset's piece, at its centre,
 *   in its largest box, text and numbers at its font size. The preset must
 *   take the layer's role.
 * - Otherwise, text: a box 80% of the piece's width, the line drawn at
 *   `fontSize` and shrunk to fit when longer (see texture/layers.ts).
 * - Numbers: a box a little larger than the digits.
 * - Logos: as wide as prints sharp at the minimum DPI, at most 100 mm (and
 *   at most 40% of the piece, and inside the preset's box), keeping the
 *   image's proportions. So a logo is never placed blurry; it only gets the
 *   resolution warning when the customer makes it bigger than its pixels allow.
 */
import type {
  ColorValue,
  DesignDocument,
  ItemRole,
  Layer,
  LogoAssetRef,
  Outline,
  PatternPiece,
  PlacementPreset,
  Point,
  ProductDefinition,
} from "./schema.js";
import type { TextAlign, TextDirection } from "./text.js";
import { normalizeText } from "./text.js";
import { DEFAULT_UPLOAD_LIMITS, maxPrintWidthMm } from "./upload-checks.js";
import { round3 } from "./placement.js";
import { fitLayerToArea } from "./print-area.js";
import { DesignError } from "./validate.js";

type TextLayer = Extract<Layer, { kind: "text" }>;
type NumberLayer = Extract<Layer, { kind: "number" }>;
type LogoLayer = Extract<Layer, { kind: "logo" }>;

/** Rounds down to 0.001 mm. */
function floor3(value: number): number {
  return Math.floor(value * 1000) / 1000;
}

/** The first free id of the form `<prefix>-<n>` (n from 1), among layers and shapes. */
export function nextLayerId(design: Pick<DesignDocument, "layers"> & Partial<Pick<DesignDocument, "shapes">>, prefix: string): string {
  const taken = new Set([...design.layers.map((l) => l.id), ...(design.shapes ?? []).map((s) => s.id)]);
  for (let n = 1; ; n++) {
    const id = `${prefix}-${n}`;
    if (!taken.has(id)) return id;
  }
}

function requirePiece(product: ProductDefinition, pieceId: string): PatternPiece {
  const piece = product.pieces.find((p) => p.id === pieceId);
  if (!piece) {
    throw new DesignError(`Cannot place a layer: product "${product.id}" has no pattern piece "${pieceId}" (pieces: ${product.pieces.map((p) => p.id).join(", ")})`);
  }
  return piece;
}

/** The product's placement preset with this id. Throws a DesignError naming the presets when there is none. */
export function requirePreset(product: ProductDefinition, presetId: string): PlacementPreset {
  const preset = product.placements.find((p) => p.id === presetId);
  if (!preset) {
    throw new DesignError(
      `Cannot place a layer: product "${product.id}" has no placement preset "${presetId}" (presets: ${product.placements.map((p) => p.id).join(", ") || "none"})`,
    );
  }
  return preset;
}

/** The preset and piece a new layer goes to: the preset's piece, else `pieceId`. Checks the preset takes the role. */
function target(product: ProductDefinition, options: { pieceId?: string; preset?: string }, role: ItemRole): { piece: PatternPiece; preset: PlacementPreset | null } {
  if (options.preset !== undefined) {
    const preset = requirePreset(product, options.preset);
    if (!preset.roles.includes(role)) {
      throw new DesignError(`Cannot place a ${role} layer at preset "${preset.id}": it takes ${preset.roles.join(", ")}`);
    }
    if (options.pieceId !== undefined && options.pieceId !== preset.pieceId) {
      throw new DesignError(`Cannot place a layer at preset "${preset.id}" on piece "${options.pieceId}": the preset is on "${preset.pieceId}"`);
    }
    return { piece: requirePiece(product, preset.pieceId), preset };
  }
  if (options.pieceId === undefined) throw new DesignError("Cannot place a layer: give a piece or a placement preset");
  return { piece: requirePiece(product, options.pieceId), preset: null };
}

/** The middle of a piece's box. */
export function pieceCentre(piece: Pick<PatternPiece, "width" | "height">): Point {
  return { x: piece.width / 2, y: piece.height / 2 };
}

/** The placement presets of a product that take a role, optionally on one piece, in the product's order. */
export function presetsForRole(product: ProductDefinition, role: ItemRole, pieceId?: string): PlacementPreset[] {
  return product.placements.filter((p) => p.roles.includes(role) && (pieceId === undefined || p.pieceId === pieceId));
}

export interface NewTextOptions {
  id: string;
  /** The piece; may be left out when `preset` is given. */
  pieceId?: string;
  /** A placement preset of the product: the layer goes there. */
  preset?: string;
  /** Default "text". */
  role?: TextLayer["role"];
  value: string;
  fontId: string;
  fill: ColorValue;
  fontSize?: number;
  align?: TextAlign;
  direction?: TextDirection;
  position?: Point;
  rotation?: number;
  outline?: Outline;
}

/** A first font size for a piece: about a tenth of its height, between 20 and 80 mm. */
export function defaultFontSize(piece: Pick<PatternPiece, "height">): number {
  return round3(Math.min(80, Math.max(20, piece.height / 10)));
}

export function newTextLayer(product: ProductDefinition, options: NewTextOptions): TextLayer {
  const role = options.role ?? "text";
  const { piece, preset } = target(product, options, role);
  const fontSize = options.fontSize ?? preset?.fontSize ?? defaultFontSize(piece);
  const layer: TextLayer = {
    id: options.id,
    kind: "text",
    role,
    pieceId: piece.id,
    position: options.position ?? (preset ? { ...preset.centre } : pieceCentre(piece)),
    size: preset
      ? { width: preset.maxSize.width, height: round3(Math.min(preset.maxSize.height, fontSize * 1.4)) }
      : { width: round3(piece.width * 0.8), height: round3(fontSize * 1.4) },
    rotation: options.rotation ?? 0,
    value: normalizeText(options.value),
    direction: options.direction ?? "auto",
    fontId: options.fontId,
    fontSize,
    fill: options.fill,
    align: options.align ?? "center",
  };
  if (preset) layer.preset = preset.id;
  if (options.outline) layer.outline = options.outline;
  return layer;
}

export interface NewNumberOptions {
  id: string;
  pieceId?: string;
  preset?: string;
  /** Default "player-number": its value must then be the sample player's number. */
  role?: NumberLayer["role"];
  value: string;
  fontId: string;
  fill: ColorValue;
  fontSize?: number;
  position?: Point;
  outline?: Outline;
}

export function newNumberLayer(product: ProductDefinition, options: NewNumberOptions): NumberLayer {
  const role = options.role ?? "player-number";
  const { piece, preset } = target(product, options, role);
  const fontSize = options.fontSize ?? preset?.fontSize ?? round3(Math.min(250, piece.height * 0.35));
  const layer: NumberLayer = {
    id: options.id,
    kind: "number",
    role,
    pieceId: piece.id,
    position: options.position ?? (preset ? { ...preset.centre } : pieceCentre(piece)),
    size: preset
      ? { width: preset.maxSize.width, height: round3(Math.min(preset.maxSize.height, fontSize * 1.1)) }
      : { width: round3(Math.min(piece.width, fontSize * 1.3)), height: round3(fontSize * 1.1) },
    rotation: 0,
    value: options.value,
    fontId: options.fontId,
    fontSize,
    fill: options.fill,
    align: "center",
  };
  if (preset) layer.preset = preset.id;
  if (options.outline) layer.outline = options.outline;
  return layer;
}

export interface NewLogoOptions {
  id: string;
  pieceId?: string;
  preset?: string;
  /** Default "crest". */
  role?: LogoLayer["role"];
  asset: LogoAssetRef;
  position?: Point;
  /** The DPI the first size must reach. Default: the upload limits' minimum (150). */
  minDpi?: number;
}

/** Narrowest first width of a logo, in mm, even when its pixels would allow less. */
export const MIN_START_LOGO_MM = 20;

export function newLogoLayer(product: ProductDefinition, options: NewLogoOptions): LogoLayer {
  const role = options.role ?? "crest";
  const { piece, preset } = target(product, options, role);
  const { asset } = options;
  const sharp = maxPrintWidthMm(asset.width, options.minDpi ?? DEFAULT_UPLOAD_LIMITS.minDpi);
  // Inside the preset's box, keeping the image's proportions.
  const presetWidth = preset ? Math.min(preset.maxSize.width, (preset.maxSize.height * asset.width) / asset.height) : Infinity;
  const width = Math.max(MIN_START_LOGO_MM, Math.min(100, piece.width * 0.4, sharp, presetWidth));
  const height = (width * asset.height) / asset.width;
  const layer: LogoLayer = {
    id: options.id,
    kind: "logo",
    role,
    pieceId: piece.id,
    position: options.position ?? (preset ? { ...preset.centre } : pieceCentre(piece)),
    // Rounded down, so the first size never falls below the minimum DPI by rounding.
    size: { width: floor3(width), height: floor3(height) },
    rotation: 0,
    asset: { ...asset },
  };
  if (preset) layer.preset = preset.id;
  // A very tall or wide image may not fit the place's print area at that width: the print-area rule.
  return fitLayerToArea(product, layer);
}
