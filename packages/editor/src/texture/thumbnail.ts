/**
 * Flat views of one piece, template thumbnails (N13, 06-editor.md 4.1) and
 * template cards. The cards the interface shows are `drawTemplateCard`: the
 * garment as the 3D model shows it (garment-view.ts). `drawTemplateThumbnail`
 * (the flat front piece) stays for the flat view and for tests.
 *
 * Template thumbnails:
 * a template's front, small and flat, in the team's colours with the team
 * name and the crest. Drawn by `drawPatternTexture` itself (flat mode), on a
 * product narrowed to the one piece and fitted into the thumbnail's box, so
 * a thumbnail shows exactly what the model would. No DOM; any 2D context.
 */
import type { DesignDocument, ProductDefinition } from "../design/schema.js";
import type { FontCatalog } from "../design/font-catalog.js";
import { applyTemplate, type Template } from "../design/template.js";
import { DesignError } from "../design/validate.js";
import { drawPatternTexture, type DrawPatternResult, type PatternCanvasContext } from "./pattern-texture.js";
import type { AssetImageLookup } from "./layers.js";
import { composeGarmentView, type GarmentView, type TextureSampler } from "./garment-view.js";

export interface PieceViewOptions {
  /** A piece id, or the product's front or back piece. Default "front". */
  piece?: string | "front" | "back";
  /** The drawing's size in pixels; the piece is fitted inside, centred, keeping its proportions. */
  width: number;
  height: number;
  /** Space kept round the piece, in pixels. Default 4. */
  padding?: number;
  images?: AssetImageLookup;
}

/** The product as a flat view of one piece needs it: only that piece, its box fitted into `width` x `height`. */
export function pieceViewProduct(product: ProductDefinition, options: PieceViewOptions): ProductDefinition {
  const wanted = options.piece ?? "front";
  const pieceId = wanted === "front" ? product.views.front : wanted === "back" ? product.views.back : wanted;
  const piece = product.pieces.find((p) => p.id === pieceId);
  if (!piece) throw new DesignError(`Cannot draw a view: product "${product.id}" has no piece "${pieceId}"`);
  const { width, height } = options;
  if (!(width > 0 && height > 0)) throw new DesignError("Cannot draw a view: width and height must be positive");
  const padding = options.padding ?? 4;
  const k = Math.min((width - 2 * padding) / piece.width, (height - 2 * padding) / piece.height);
  const size = Math.max(width, height);
  const boxW = piece.width * k;
  const boxH = piece.height * k;
  const uv = { x: (width - boxW) / 2 / size, y: (height - boxH) / 2 / size, width: boxW / size, height: boxH / size };
  return { ...product, pieces: [{ ...piece, uv }] };
}

/** Draws one piece of a design flat (as cut), fitted into `width` x `height`. Layers on other pieces are left out. */
export function drawPieceView(ctx: PatternCanvasContext, product: ProductDefinition, design: DesignDocument, options: PieceViewOptions): DrawPatternResult {
  const view = pieceViewProduct(product, options);
  return drawPatternTexture(ctx, view, design, { size: Math.max(options.width, options.height), mode: "flat", images: options.images });
}

export interface TemplateThumbnailOptions extends PieceViewOptions {
  fonts: FontCatalog;
  /** The template the design has now, as for `applyTemplate`. */
  previous?: Template | null;
}

/**
 * A template's thumbnail for the current design: the design with the
 * template applied (so in the team's colours, with its team name, crest and
 * sample player), its front drawn flat. Returns the design it drew, which is
 * also what tapping the card would give.
 */
export function drawTemplateThumbnail(
  ctx: PatternCanvasContext,
  product: ProductDefinition,
  design: DesignDocument,
  template: Template,
  options: TemplateThumbnailOptions,
): { design: DesignDocument; result: DrawPatternResult } {
  const applied = applyTemplate(design, template, { product, fonts: options.fonts, previous: options.previous });
  return { design: applied, result: drawPieceView(ctx, product, applied, options) };
}

/** Where a card's pattern texture is drawn (a small square canvas) and how it is read back. */
export interface CardTexture {
  ctx: PatternCanvasContext;
  /** The texture's edge in pixels (the canvas is this size). 512 is plenty for a card. */
  size: number;
  /** Reads what was drawn, as a sampler (in the browser: from `getImageData`). */
  read(): TextureSampler;
}

export interface DesignViewOptions {
  /** The garment seen from the front (or the back), from `renderGarmentView`, once per product. */
  view: GarmentView;
  texture: CardTexture;
  /**
   * A second, small texture for the inside of the garment (E3c): seen through the neck, it is drawn without the
   * prints, as the 3D view and the flat view draw it. Without it the inside shows the outside's texture.
   */
  insideTexture?: CardTexture;
  images?: AssetImageLookup;
}

/**
 * A picture of a design as the 3D model shows it (06-editor.md 4.1, E3a-2):
 * the design's pattern texture, drawn small, looked up through the garment's
 * view buffer. Writes RGBA into `out` (`view.width * view.height * 4`).
 */
export function drawDesignView(out: Uint8ClampedArray, product: ProductDefinition, design: DesignDocument, options: DesignViewOptions): DrawPatternResult {
  const result = drawPatternTexture(options.texture.ctx, product, design, { size: options.texture.size, images: options.images });
  let inside: TextureSampler | undefined;
  if (options.insideTexture) {
    drawPatternTexture(options.insideTexture.ctx, product, { ...design, layers: [] }, { size: options.insideTexture.size });
    inside = options.insideTexture.read();
  }
  composeGarmentView(options.view, options.texture.read(), out, inside);
  return result;
}

export interface TemplateCardOptions extends DesignViewOptions {
  fonts: FontCatalog;
  /** The template the design has now, as for `applyTemplate`. */
  previous?: Template | null;
}

/**
 * A template card: the current design with the template applied (in the
 * team's colours, with its name, crest and sample player), as the garment
 * shows it from the front: a jersey with its sleeves and collar, not the flat
 * front piece (which, for a front that wraps round under the side panels,
 * reads like a dress). Returns the design it drew, which is also what tapping
 * the card gives.
 */
export function drawTemplateCard(
  out: Uint8ClampedArray,
  product: ProductDefinition,
  design: DesignDocument,
  template: Template,
  options: TemplateCardOptions,
): { design: DesignDocument; result: DrawPatternResult } {
  const applied = applyTemplate(design, template, { product, fonts: options.fonts, previous: options.previous });
  return { design: applied, result: drawDesignView(out, product, applied, options) };
}
