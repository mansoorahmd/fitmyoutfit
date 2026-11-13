/**
 * Draws a design onto the model's texture, from data, every time: the product
 * definition says where each pattern piece sits in UV space and which colour
 * zone covers which part of it; the design says the colour of each zone.
 *
 * Plain functions over a minimal 2D-context interface, so they run and are
 * tested without a GPU or a DOM (the 3D view passes a real canvas context,
 * tests pass a recording fake). No Three.js here.
 *
 * Layout: the texture is one square image that covers the model's whole UV
 * space, (0, 0) top-left to (1, 1) bottom-right, V down (glTF). A piece's UV
 * rectangle times the texture size is its pixel rectangle, and each piece is
 * drawn with a transform from its millimetres to those pixels, so the layers
 * (text, numbers, logos, positioned in piece millimetres; see layers.ts) are
 * drawn in the same space with no extra conversion, after the zones.
 *
 * Shapes (stripes, hoops, a sash: `design.shapes`) are drawn with the zones,
 * piece by piece, over the zone colours and regions and under every layer,
 * clipped exactly as the regions are: to the piece's outline in the flat
 * view, and to the piece's area plus its margin in the texture, so the seams
 * bleed in the shape's colour and never show a line of the zone colour.
 */
import type { ColorRef, DesignDocument, PatternPiece, ProductDefinition, Shape } from "../design/schema.js";
import { pieceGeometry } from "../design/pattern.js";
import { parseSvgPath, traceSvgPath, type PathCommand, type PathPoint, type PathSink } from "../design/svg-path.js";
import { drawLayers, type AssetImageLookup, type LayerCanvasContext, type TextFit } from "./layers.js";
import { drawZoneHighlight, type ZoneHighlight } from "./zone-highlight.js";

/** Parsed shape paths, by path text (a design repaints often; its shapes rarely change). */
const shapePaths = new Map<string, PathCommand[] | null>();

/** A shape's path as drawing commands, or null when it does not parse (validation refuses those). */
export function shapeCommands(shape: Pick<Shape, "path">): PathCommand[] | null {
  let commands = shapePaths.get(shape.path);
  if (commands === undefined) {
    const parsed = parseSvgPath(shape.path);
    commands = parsed.ok ? parsed.commands : null;
    if (shapePaths.size > 2000) shapePaths.clear();
    shapePaths.set(shape.path, commands);
  }
  return commands;
}

/** Default texture edge in pixels. 2048 x 2048 RGBA is 16 MiB on the GPU (about 21 MiB with mipmaps). */
export const DEFAULT_TEXTURE_SIZE = 2048;

/** Colour of the texture outside every piece. Never visible on a valid model. */
export const TEXTURE_BACKGROUND = "#7F7F7F";

/**
 * The 2D-context calls the drawing needs. `CanvasRenderingContext2D` and
 * `OffscreenCanvasRenderingContext2D` satisfy it.
 */
export interface PatternCanvasContext extends PathSink, LayerCanvasContext {
  clearRect(x: number, y: number, width: number, height: number): void;
}

export interface PixelRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The piece's box in texture pixels (a texture of `size` x `size`). */
export function pieceTextureRect(piece: PatternPiece, size: number): PixelRect {
  return {
    x: piece.uv.x * size,
    y: piece.uv.y * size,
    width: piece.uv.width * size,
    height: piece.uv.height * size,
  };
}

/** Pixels per millimetre on this piece, across and down. Equal for a valid product (proportions are checked). */
export function pieceTextureScale(piece: PatternPiece, size: number): { x: number; y: number } {
  return { x: (piece.uv.width * size) / piece.width, y: (piece.uv.height * size) / piece.height };
}

/** A point in piece millimetres to texture pixels. */
export function pieceToTexture(piece: PatternPiece, point: PathPoint, size: number): PathPoint {
  const rect = pieceTextureRect(piece, size);
  return {
    x: rect.x + (point.x / piece.width) * rect.width,
    y: rect.y + (point.y / piece.height) * rect.height,
  };
}

/** Texture pixels to piece millimetres: the inverse of `pieceToTexture`. */
export function textureToPiece(piece: PatternPiece, pixel: PathPoint, size: number): PathPoint {
  const rect = pieceTextureRect(piece, size);
  return {
    x: ((pixel.x - rect.x) / rect.width) * piece.width,
    y: ((pixel.y - rect.y) / rect.height) * piece.height,
  };
}

/** The colour the design gives a zone, else the product's default for it. */
export function zoneColor(product: ProductDefinition, design: DesignDocument, zoneId: string): ColorRef | undefined {
  if (Object.prototype.hasOwnProperty.call(design.zones, zoneId)) return design.zones[zoneId];
  return product.zones.find((z) => z.id === zoneId)?.defaultColor;
}

export interface DrawPatternOptions {
  /** Texture edge in pixels. Default `DEFAULT_TEXTURE_SIZE`. */
  size?: number;
  /**
   * `"texture"` (default): for the 3D model. Each piece fills its whole UV
   *   rectangle plus a margin (`bleed`), so texture filtering at the seams
   *   never reaches the background. Regions run on past the outline.
   * `"flat"`: the pieces as cut, for a 2D view. Clipped to each outline,
   *   outline stroked, transparent background.
   */
  mode?: "texture" | "flat";
  /** Margin in pixels drawn around each piece in texture mode. Default: size / 128 (16 px at 2048). */
  bleed?: number;
  /** Images for logo and clipart layers (see layers.ts). Missing ones are drawn as grey placeholders. */
  images?: AssetImageLookup;
  /** A layer to outline as selected, in the editor's view. */
  selectedLayerId?: string | null;
  /** A colour zone or a group of shapes to show (the zone flash, editor only; never for proofs). */
  highlight?: ZoneHighlight | null;
}

/** What `drawPatternTexture` did, for a caller that reports cost or must know the drawing is complete. */
export interface DrawPatternResult {
  size: number;
  pieces: number;
  fills: number;
  /** Layers drawn. */
  layers: number;
  /** Asset ids drawn as placeholders because their image was not available yet. */
  missingImages: string[];
  /** Shapes drawn (each once per piece pass that shows it). */
  shapes: number;
  /** For every text and number layer, whether it was shrunk to fit its box (N12). */
  textFits: TextFit[];
}

/**
 * Draws every pattern piece with the design's zone colours, then the
 * design's layers (text, numbers, logos) over them, each clipped to its
 * piece. The same inputs always give the same drawing; nothing is cached
 * between calls.
 */
export function drawPatternTexture(
  ctx: PatternCanvasContext,
  product: ProductDefinition,
  design: DesignDocument,
  options: DrawPatternOptions = {},
): DrawPatternResult {
  const size = options.size ?? DEFAULT_TEXTURE_SIZE;
  const mode = options.mode ?? "texture";
  const bleed = options.bleed ?? Math.max(2, size / 128);
  let fills = 0;
  let shapesDrawn = 0;
  const shapesByPiece = new Map<string, Shape[]>();
  for (const shape of design.shapes ?? []) {
    const list = shapesByPiece.get(shape.pieceId);
    if (list) list.push(shape);
    else shapesByPiece.set(shape.pieceId, [shape]);
  }

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, size, size);
  if (mode === "texture") {
    ctx.fillStyle = TEXTURE_BACKGROUND;
    ctx.fillRect(0, 0, size, size);
  }

  const drawPiece = (piece: PatternPiece, margin: number) => {
    const rect = pieceTextureRect(piece, size);
    const scale = pieceTextureScale(piece, size);
    const geometry = pieceGeometry(piece);
    ctx.save();
    if (mode === "texture") {
      // Clip in pixels, then draw in millimetres.
      ctx.beginPath();
      ctx.rect(rect.x - margin, rect.y - margin, rect.width + 2 * margin, rect.height + 2 * margin);
      ctx.clip();
      ctx.setTransform(scale.x, 0, 0, scale.y, rect.x, rect.y);
    } else {
      ctx.setTransform(scale.x, 0, 0, scale.y, rect.x, rect.y);
      ctx.beginPath();
      traceSvgPath(ctx, geometry.outline.commands);
      ctx.clip();
    }
    // The piece's own zone, over the whole (clipped) area, with room for the margin.
    const base = zoneColor(product, design, piece.zone);
    if (base) {
      ctx.fillStyle = base.hex;
      const mx = margin / scale.x;
      const my = margin / scale.y;
      ctx.fillRect(-mx, -my, piece.width + 2 * mx, piece.height + 2 * my);
      fills++;
    }
    for (const region of geometry.regions) {
      const color = zoneColor(product, design, region.zone);
      if (!color) continue;
      ctx.fillStyle = color.hex;
      ctx.beginPath();
      traceSvgPath(ctx, region.commands);
      ctx.fill();
      fills++;
    }
    for (const shape of shapesByPiece.get(piece.id) ?? []) {
      const commands = shapeCommands(shape);
      if (!commands) continue;
      ctx.fillStyle = shape.fill.hex;
      ctx.beginPath();
      traceSvgPath(ctx, commands);
      ctx.fill();
      if (margin === 0) shapesDrawn++;
    }
    ctx.restore();
    if (mode === "flat") {
      ctx.save();
      ctx.setTransform(scale.x, 0, 0, scale.y, rect.x, rect.y);
      ctx.strokeStyle = "#333333";
      ctx.lineWidth = 1.5 / Math.min(scale.x, scale.y);
      ctx.beginPath();
      traceSvgPath(ctx, geometry.outline.commands);
      ctx.stroke();
      ctx.restore();
    }
  };

  if (mode === "texture") {
    // Margins first, for every piece, then every piece exactly: a margin can
    // never cover a neighbouring piece, however tightly the UVs are packed.
    for (const piece of product.pieces) drawPiece(piece, bleed);
    for (const piece of product.pieces) drawPiece(piece, 0);
  } else {
    for (const piece of product.pieces) drawPiece(piece, 0);
  }
  const pieces = new Map(product.pieces.map((p) => [p.id, p]));
  const layers = drawLayers(ctx, design, pieces, (piece) => pieceTransform(piece, size), {
    images: options.images,
    selectedLayerId: options.selectedLayerId,
  });
  if (options.highlight) drawZoneHighlight(ctx, product, design, options.highlight, (piece) => pieceTransform(piece, size), size / DEFAULT_TEXTURE_SIZE);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  return {
    size,
    pieces: product.pieces.length,
    fills,
    layers: layers.layers,
    missingImages: layers.missingImages,
    shapes: shapesDrawn,
    textFits: layers.textFits,
  };
}

/** The 2D transform from a piece's millimetres to texture pixels, as setTransform arguments. */
export function pieceTransform(piece: PatternPiece, size: number): [number, number, number, number, number, number] {
  const rect = pieceTextureRect(piece, size);
  const scale = pieceTextureScale(piece, size);
  return [scale.x, 0, 0, scale.y, rect.x, rect.y];
}
