/**
 * New layers with sensible first placements, as plain functions. They only
 * build layer objects; add them with `addLayer` (which validates them).
 *
 * - Text: a box 80% of the piece's width, the line drawn at `fontSize` and
 *   shrunk to fit when longer (see texture/layers.ts).
 * - Numbers: a box a little larger than the digits.
 * - Logos: as wide as prints sharp at the minimum DPI, at most 100 mm (and
 *   at most 40% of the piece), keeping the image's proportions. So a logo is
 *   never placed blurry; it only gets the resolution warning when the
 *   customer makes it bigger than its pixels allow.
 */
import type { ColorRef, DesignDocument, Layer, LogoAssetRef, PatternPiece, Point, ProductDefinition } from "./schema.js";
import type { TextAlign, TextDirection } from "./text.js";
import { normalizeText } from "./text.js";
import { DEFAULT_UPLOAD_LIMITS, maxPrintWidthMm } from "./upload-checks.js";
import { round3 } from "./placement.js";
import { DesignError } from "./validate.js";

type TextLayer = Extract<Layer, { kind: "text" }>;
type NumberLayer = Extract<Layer, { kind: "number" }>;
type LogoLayer = Extract<Layer, { kind: "logo" }>;

/** Rounds down to 0.001 mm. */
function floor3(value: number): number {
  return Math.floor(value * 1000) / 1000;
}

/** The first free id of the form `<prefix>-<n>` (n from 1). */
export function nextLayerId(design: DesignDocument, prefix: string): string {
  const taken = new Set(design.layers.map((l) => l.id));
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

/** The middle of a piece's box. */
export function pieceCentre(piece: Pick<PatternPiece, "width" | "height">): Point {
  return { x: piece.width / 2, y: piece.height / 2 };
}

export interface NewTextOptions {
  id: string;
  pieceId: string;
  value: string;
  fontId: string;
  fill: ColorRef;
  fontSize?: number;
  align?: TextAlign;
  direction?: TextDirection;
  position?: Point;
  rotation?: number;
}

/** A first font size for a piece: about a tenth of its height, between 20 and 80 mm. */
export function defaultFontSize(piece: Pick<PatternPiece, "height">): number {
  return round3(Math.min(80, Math.max(20, piece.height / 10)));
}

export function newTextLayer(product: ProductDefinition, options: NewTextOptions): TextLayer {
  const piece = requirePiece(product, options.pieceId);
  const fontSize = options.fontSize ?? defaultFontSize(piece);
  return {
    id: options.id,
    kind: "text",
    pieceId: piece.id,
    position: options.position ?? pieceCentre(piece),
    size: { width: round3(piece.width * 0.8), height: round3(fontSize * 1.4) },
    rotation: options.rotation ?? 0,
    value: normalizeText(options.value),
    direction: options.direction ?? "auto",
    fontId: options.fontId,
    fontSize,
    fill: options.fill,
    align: options.align ?? "center",
  };
}

export interface NewNumberOptions {
  id: string;
  pieceId: string;
  value: string;
  fontId: string;
  fill: ColorRef;
  fontSize?: number;
  position?: Point;
}

export function newNumberLayer(product: ProductDefinition, options: NewNumberOptions): NumberLayer {
  const piece = requirePiece(product, options.pieceId);
  const fontSize = options.fontSize ?? round3(Math.min(250, piece.height * 0.35));
  return {
    id: options.id,
    kind: "number",
    pieceId: piece.id,
    position: options.position ?? pieceCentre(piece),
    size: { width: round3(Math.min(piece.width, fontSize * 1.3)), height: round3(fontSize * 1.1) },
    rotation: 0,
    value: options.value,
    fontId: options.fontId,
    fontSize,
    fill: options.fill,
    align: "center",
  };
}

export interface NewLogoOptions {
  id: string;
  pieceId: string;
  asset: LogoAssetRef;
  position?: Point;
  /** The DPI the first size must reach. Default: the upload limits' minimum (150). */
  minDpi?: number;
}

/** Narrowest first width of a logo, in mm, even when its pixels would allow less. */
export const MIN_START_LOGO_MM = 20;

export function newLogoLayer(product: ProductDefinition, options: NewLogoOptions): LogoLayer {
  const piece = requirePiece(product, options.pieceId);
  const { asset } = options;
  const sharp = maxPrintWidthMm(asset.width, options.minDpi ?? DEFAULT_UPLOAD_LIMITS.minDpi);
  const width = Math.max(MIN_START_LOGO_MM, Math.min(100, piece.width * 0.4, sharp));
  const height = (width * asset.height) / asset.width;
  return {
    id: options.id,
    kind: "logo",
    pieceId: piece.id,
    position: options.position ?? pieceCentre(piece),
    // Rounded down, so the first size never falls below the minimum DPI by rounding.
    size: { width: floor3(width), height: floor3(height) },
    rotation: 0,
    asset: { ...asset },
  };
}
