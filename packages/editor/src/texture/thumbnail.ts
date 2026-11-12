/**
 * Flat views of one piece, and template thumbnails (N13, 06-editor.md 4.1):
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
