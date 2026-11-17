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
 * - An outline (`outline`, `width` mm) is a stroke round the glyphs, twice
 *   the width wide with round joins, drawn under the fill, so `width` mm show
 *   outside the letters. The line and its outline together fit the box, so
 *   the outline stays inside the box too. When a long line is shrunk, its
 *   outline shrinks with it (it follows the size the letters are drawn at, so
 *   a thick outline never crowds a shrunk name), but never below
 *   `MIN_OUTLINE_MM` (thinner does not print), or the outline's own width
 *   when that is thinner still.
 *
 * Logos and clipart are drawn as large as fits inside the box, keeping the
 * image's proportions, centred.
 */
import type { AssetRef, DesignDocument, Layer, PatternPiece } from "../design/schema.js";
import { pieceGeometry } from "../design/pattern.js";
import { traceSvgPath } from "../design/svg-path.js";
import { physicalAlign, resolveTextDirection, type PhysicalAlign, type ResolvedDirection } from "../design/text.js";
import { logoPrintSize } from "../design/upload-checks.js";
import { MIN_OUTLINE_MM } from "../design/roles.js";
import { layerFont } from "./fonts.js";

type TextLike = Extract<Layer, { kind: "text" | "number" }>;

/** The 2D-context calls layer drawing needs, on top of the zone drawing's. */
export interface LayerCanvasContext {
  fillStyle: string | CanvasGradient | CanvasPattern;
  strokeStyle: string | CanvasGradient | CanvasPattern;
  lineWidth: number;
  lineJoin: CanvasLineJoin;
  miterLimit: number;
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
  strokeText(text: string, x: number, y: number): void;
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
  /** The outline width drawn, in mm on the garment (0 without an outline): it follows the shrink. */
  outlineWidth: number;
  /** Anchor X in the layer's frame after the shrink (divide by `scale` already applied). */
  x: number;
}

/** The paragraph direction of a text or number layer. */
export function layerDirection(layer: TextLike): ResolvedDirection {
  return layer.kind === "number" ? "ltr" : resolveTextDirection(layer.value, layer.direction);
}

/** The width a line may take in its box at its full size: the box less the outline on both ends. */
export function textRoom(layer: Pick<TextLike, "size" | "outline">): number {
  const outline = layer.outline ? 2 * layer.outline.width : 0;
  return Math.max(layer.size.width * 0.05, layer.size.width - outline);
}

/**
 * The shrink and the drawn outline width for a line measured at its font
 * size: the letters and the outline round them fit the box's width, and the
 * outline shrinks with the letters (but not below `MIN_OUTLINE_MM`, or the
 * outline's own width when that is thinner).
 */
export function fitLine(layer: Pick<TextLike, "size" | "outline">, measuredWidth: number): { scale: number; outlineWidth: number } {
  const box = layer.size.width;
  const full = layer.outline ? layer.outline.width : 0;
  if (!(measuredWidth > 0) || measuredWidth + 2 * full <= box) return { scale: 1, outlineWidth: full };
  // The outline follows the letters: s * (measured + 2 * full) = box.
  let scale = box / (measuredWidth + 2 * full);
  let outlineWidth = full * scale;
  const floor = Math.min(full, MIN_OUTLINE_MM);
  if (outlineWidth < floor) {
    // Thinner than prints: the outline stays at the floor, the letters take the rest.
    outlineWidth = floor;
    scale = Math.max(box * 0.05, box - 2 * floor) / measuredWidth;
  }
  return { scale, outlineWidth };
}

/** Where and how big a line is drawn in its box, given its measured width at `fontSize`. */
export function textLayout(layer: TextLike, measuredWidth: number): TextLayout {
  const direction = layerDirection(layer);
  const textAlign = physicalAlign(layer.align, direction);
  const { scale, outlineWidth } = fitLine(layer, measuredWidth);
  // The letters start inside the outline: (box / 2 - outline) mm from the centre, in the shrunk frame.
  const edge = (layer.size.width / 2 - outlineWidth) / scale;
  const x = textAlign === "left" ? -edge : textAlign === "right" ? edge : 0;
  return { direction, textAlign, scale, x, outlineWidth };
}

/**
 * Whether a text or number layer was shrunk to fit its box (N12): the even
 * shrink applied (1 when the line fits), for the interface to say "Long names
 * get smaller to fit" only while it happens.
 */
export interface TextFit {
  layerId: string;
  role: TextLike["role"];
  /** The even shrink, 0 to 1 (1: drawn at its font size). */
  scale: number;
  /** True when the line was shrunk (scale below 1). */
  shrunk: boolean;
}

/** The fit of a line measured at its font size. */
export function textFit(layer: TextLike, measuredWidth: number): TextFit {
  const scale = textLayout(layer, measuredWidth).scale;
  return { layerId: layer.id, role: layer.role, scale, shrunk: scale < 1 };
}

export interface DrawLayersOptions {
  /** Images for logo and clipart layers. A layer whose image is not available is drawn as a grey placeholder. */
  images?: AssetImageLookup;
  /** The layer to outline as selected (the editor's view only; never pass it for proofs). */
  selectedLayerId?: string | null;
  /** Device pixels per CSS pixel of the canvas drawn on (the selection line keeps its CSS width). */
  pixelRatio?: number;
}

export interface DrawLayersResult {
  /** Layers drawn. */
  layers: number;
  /** Asset ids of logo and clipart layers drawn as placeholders because their image was not available. */
  missingImages: string[];
  /** Ids of layers not drawn because their piece is not in the product. */
  skipped: string[];
  /** For every text and number layer drawn, whether it was shrunk to fit (N12). */
  textFits: TextFit[];
}

const PLACEHOLDER_FILL = "rgba(127, 127, 127, 0.35)";
/** E3d (R36): the selection's two-tone line, as on the 3D view's overlay: 3.5 px white under 1.5 px ink (CSS px). */
export const SELECTION_LINE = [
  { colour: "#FFFFFF", width: 3.5 },
  { colour: "#0B1530", width: 1.5 },
] as const;

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
  const result: DrawLayersResult = { layers: 0, missingImages: [], skipped: [], textFits: [] };
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
      result.textFits.push(drawTextLine(ctx, design, layer));
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
    const ratio = options.pixelRatio ?? 1;
    SELECTION_LINE.forEach(({ colour, width: line }) => {
      ctx.strokeStyle = colour;
      ctx.lineWidth = (line * ratio) / pxPerMm;
      ctx.beginPath();
      ctx.rect(-width / 2, -height / 2, width, height);
      ctx.stroke();
    });
    ctx.restore();
  }
  return result;
}

function drawTextLine(ctx: LayerCanvasContext, design: DesignDocument, layer: TextLike): TextFit {
  ctx.font = layerFont(design, layer);
  ctx.direction = layerDirection(layer);
  ctx.textBaseline = "middle";
  const measured = ctx.measureText(layer.value).width;
  const layout = textLayout(layer, measured);
  ctx.textAlign = layout.textAlign;
  ctx.scale(layout.scale, layout.scale);
  if (layer.outline && layer.value.length > 0) {
    // A stroke is centred on the glyph edge: twice the width, so the outline's width shows outside the
    // letters once the fill covers the inner half. It shrinks with a shrunk line (layout.outlineWidth mm).
    ctx.lineJoin = "round";
    ctx.miterLimit = 2;
    ctx.strokeStyle = layer.outline.color.hex;
    ctx.lineWidth = (2 * layout.outlineWidth) / layout.scale;
    ctx.strokeText(layer.value, layout.x, 0);
  }
  ctx.fillStyle = layer.fill.hex;
  ctx.fillText(layer.value, layout.x, 0);
  return { layerId: layer.id, role: layer.role, scale: layout.scale, shrunk: layout.scale < 1 };
}
