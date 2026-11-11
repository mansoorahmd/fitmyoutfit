/**
 * Draws a design's layers (text, numbers, logos, clipart) into the pattern
 * texture, after the zones: each layer in its piece's millimetre transform,
 * clipped to the piece's outline, bottom to top. Text is drawn as text with
 * the browser's text engine (which shapes Arabic and Urdu and orders mixed
 * text by the Unicode bidi algorithm), in the paragraph direction this
 * package resolves, so the drawing follows the data and nothing is stored as
 * pixels. Plain functions over a minimal 2D context; tested without a GPU.
 *
 * Text layout, the rule the proof renders and production files must repeat:
 * - The line is drawn at `fontSize` (mm per em), vertically centred on the
 *   layer box (CSS "middle" baseline), anchored at the box's start edge, its
 *   centre or its end edge (`align`, by reading direction).
 * - When the line is wider than the box it is shrunk evenly to fit the box's
 *   width. It is never stretched, and never wraps.
 * - Number layers always read left to right (digits do, in Arabic too).
 *
 * Logos and clipart are drawn as large as fits inside the box, keeping the
 * image's proportions, centred.
 */
import type { AssetRef, DesignDocument, Layer, PatternPiece } from "../design/schema.js";
import { pieceGeometry } from "../design/pattern.js";
import { traceSvgPath } from "../design/svg-path.js";
import { physicalAlign, resolveTextDirection, type PhysicalAlign, type ResolvedDirection } from "../design/text.js";
import { logoPrintSize } from "../design/upload-checks.js";
import { layerFont } from "./fonts.js";

type TextLike = Extract<Layer, { kind: "text" | "number" }>;

/** The 2D-context calls layer drawing needs, on top of the zone drawing's. */
export interface LayerCanvasContext {
  fillStyle: string | CanvasGradient | CanvasPattern;
  strokeStyle: string | CanvasGradient | CanvasPattern;
  lineWidth: number;
  font: string;
  textAlign: CanvasTextAlign;
  textBaseline: CanvasTextBaseline;
  direction: CanvasDirection;
  save(): void;
  restore(): void;
  setTransform(a: number, b: number, c: number, d: number, e: number, f: number): void;
  translate(x: number, y: number): void;
  rotate(angle: number): void;
  scale(x: number, y: number): void;
  beginPath(): void;
  rect(x: number, y: number, width: number, height: number): void;
  fill(): void;
  stroke(): void;
  clip(): void;
  fillRect(x: number, y: number, width: number, height: number): void;
  fillText(text: string, x: number, y: number): void;
  measureText(text: string): { width: number };
  drawImage(image: CanvasImageSource, dx: number, dy: number, dw: number, dh: number): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  bezierCurveTo(x1: number, y1: number, x2: number, y2: number, x: number, y: number): void;
  quadraticCurveTo(x1: number, y1: number, x: number, y: number): void;
  closePath(): void;
}

/** An image ready to draw (an HTMLImageElement that has loaded, an ImageBitmap ...), or nothing yet. */
export type AssetImageLookup = (asset: AssetRef) => CanvasImageSource | null | undefined;

export interface TextLayout {
  direction: ResolvedDirection;
  /** The canvas `textAlign` to draw with: the physical edge the line is anchored to. */
  textAlign: PhysicalAlign;
  /** Even shrink applied so the line fits the box's width (1 when it fits). */
  scale: number;
  /** Anchor X in the layer's frame after the shrink (divide by `scale` already applied). */
  x: number;
}

/** The paragraph direction of a text or number layer. */
export function layerDirection(layer: TextLike): ResolvedDirection {
  return layer.kind === "number" ? "ltr" : resolveTextDirection(layer.value, layer.direction);
}

/** Where and how big a line is drawn in its box, given its measured width at `fontSize`. */
export function textLayout(layer: TextLike, measuredWidth: number): TextLayout {
  const direction = layerDirection(layer);
  const textAlign = physicalAlign(layer.align, direction);
  const width = layer.size.width;
  const scale = measuredWidth > width && measuredWidth > 0 ? width / measuredWidth : 1;
  const edge = width / 2 / scale;
  const x = textAlign === "left" ? -edge : textAlign === "right" ? edge : 0;
  return { direction, textAlign, scale, x };
}

export interface DrawLayersOptions {
  /** Images for logo and clipart layers. A layer whose image is not available is drawn as a grey placeholder. */
  images?: AssetImageLookup;
  /** The layer to outline as selected (the editor's view only; never pass it for proofs). */
  selectedLayerId?: string | null;
}

export interface DrawLayersResult {
  /** Layers drawn. */
  layers: number;
  /** Asset ids of logo and clipart layers drawn as placeholders because their image was not available. */
  missingImages: string[];
  /** Ids of layers not drawn because their piece is not in the product. */
  skipped: string[];
}

const PLACEHOLDER_FILL = "rgba(127, 127, 127, 0.35)";
const SELECTION_COLOURS = ["#FFFFFF", "#0A66FF"] as const;

/**
 * Draws every layer of the design, bottom to top, each in `pieceTransform`
 * (piece millimetres to texture pixels) and clipped to its piece's outline.
 */
export function drawLayers(
  ctx: LayerCanvasContext,
  design: DesignDocument,
  pieces: ReadonlyMap<string, PatternPiece>,
  pieceTransform: (piece: PatternPiece) => [number, number, number, number, number, number],
  options: DrawLayersOptions = {},
): DrawLayersResult {
  const result: DrawLayersResult = { layers: 0, missingImages: [], skipped: [] };
  for (const layer of design.layers) {
    const piece = pieces.get(layer.pieceId);
    if (!piece) {
      result.skipped.push(layer.id);
      continue;
    }
    ctx.save();
    ctx.setTransform(...pieceTransform(piece));
    ctx.beginPath();
    traceSvgPath(ctx, pieceGeometry(piece).outline.commands);
    ctx.clip();
    ctx.translate(layer.position.x, layer.position.y);
    ctx.rotate((layer.rotation * Math.PI) / 180);
    if (layer.kind === "text" || layer.kind === "number") {
      drawTextLine(ctx, design, layer);
    } else {
      const image = options.images?.(layer.asset) ?? null;
      const size = logoPrintSize(layer.size, layer.asset.width, layer.asset.height);
      if (image) {
        ctx.drawImage(image, -size.width / 2, -size.height / 2, size.width, size.height);
      } else {
        ctx.fillStyle = PLACEHOLDER_FILL;
        ctx.fillRect(-size.width / 2, -size.height / 2, size.width, size.height);
        result.missingImages.push(layer.asset.assetId);
      }
    }
    ctx.restore();
    result.layers++;
  }
  const selected = options.selectedLayerId ? design.layers.find((l) => l.id === options.selectedLayerId) : undefined;
  const piece = selected && pieces.get(selected.pieceId);
  if (selected && piece) {
    const transform = pieceTransform(piece);
    const pxPerMm = Math.hypot(transform[0], transform[1]) || 1;
    ctx.save();
    ctx.setTransform(...transform);
    ctx.translate(selected.position.x, selected.position.y);
    ctx.rotate((selected.rotation * Math.PI) / 180);
    const { width, height } = selected.size;
    SELECTION_COLOURS.forEach((colour, k) => {
      ctx.strokeStyle = colour;
      ctx.lineWidth = (k === 0 ? 5 : 2.5) / pxPerMm;
      ctx.beginPath();
      ctx.rect(-width / 2, -height / 2, width, height);
      ctx.stroke();
    });
    ctx.restore();
  }
  return result;
}

function drawTextLine(ctx: LayerCanvasContext, design: DesignDocument, layer: TextLike): void {
  ctx.font = layerFont(design, layer);
  ctx.direction = layerDirection(layer);
  ctx.textBaseline = "middle";
  const layout = textLayout(layer, ctx.measureText(layer.value).width);
  ctx.textAlign = layout.textAlign;
  ctx.scale(layout.scale, layout.scale);
  ctx.fillStyle = layer.fill.hex;
  ctx.fillText(layer.value, layout.x, 0);
}
