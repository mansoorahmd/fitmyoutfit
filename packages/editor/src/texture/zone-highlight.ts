/**
 * The editor-only zone highlight (N8, 06-editor.md 4.3): when the coach
 * chooses a colour zone (or a group of shapes, such as the hoops), its edge
 * flashes on the model: a light white veil over the part, and a white band
 * with an ink line inside it along its edge, on every piece it covers. Drawn into the
 * texture after the layers, like the selection outline; never for proofs.
 */
import type { DesignDocument, PatternPiece, ProductDefinition } from "../design/schema.js";
import { pieceGeometry } from "../design/pattern.js";
import { parseSvgPath, traceSvgPath, type PathCommand, type PathSink } from "../design/svg-path.js";
import type { LayerCanvasContext } from "./layers.js";

type HighlightContext = PathSink & LayerCanvasContext;

function commandsOf(path: string): PathCommand[] | null {
  const parsed = parseSvgPath(path);
  return parsed.ok ? parsed.commands : null;
}

export interface ZoneHighlight {
  /** A colour zone to show. */
  zoneId?: string | null;
  /** Or a group of shapes ("hoops"). */
  shapeGroup?: string | null;
  /** 0 (gone) to 1 (full): the flash fades out. Default 1. */
  alpha?: number;
}

/** How much the part is veiled in white at full strength. */
export const HIGHLIGHT_VEIL = 0.35;

/** The ink of the highlight's inner line (the store's ink). */
export const HIGHLIGHT_INK = "11, 21, 48";

/**
 * Draws the highlight. `pieceTransform` gives each piece's millimetre-to-pixel
 * transform; `pxPerTexel` scales the band (1 for a 2048 px texture). Returns
 * how many edges were drawn.
 */
export function drawZoneHighlight(
  ctx: HighlightContext,
  product: ProductDefinition,
  design: Pick<DesignDocument, "shapes">,
  highlight: ZoneHighlight,
  pieceTransform: (piece: PatternPiece) => [number, number, number, number, number, number],
  pxPerTexel = 1,
): number {
  const alpha = Math.min(1, Math.max(0, highlight.alpha ?? 1));
  if (alpha <= 0 || (!highlight.zoneId && !highlight.shapeGroup)) return 0;
  let drawn = 0;
  for (const piece of product.pieces) {
    const geometry = pieceGeometry(piece);
    const paths: Array<PathCommand[] | null> = [];
    if (highlight.zoneId) {
      if (piece.zone === highlight.zoneId) paths.push(geometry.outline.commands);
      for (const region of geometry.regions) if (region.zone === highlight.zoneId) paths.push(region.commands);
    }
    if (highlight.shapeGroup) {
      for (const shape of design.shapes) if (shape.pieceId === piece.id && shape.group === highlight.shapeGroup) paths.push(commandsOf(shape.path));
    }
    const usable = paths.filter((p): p is NonNullable<typeof p> => p !== null);
    if (usable.length === 0) continue;
    const t = pieceTransform(piece);
    const pxPerMm = Math.hypot(t[0], t[1]) || 1;
    ctx.save();
    ctx.setTransform(...t);
    // Only inside the garment: a stroke centred on the edge shows its inner half.
    ctx.beginPath();
    traceSvgPath(ctx, geometry.outline.commands);
    ctx.clip();
    // A light veil over the part, so it lights up even where its edge is small on screen (a phone).
    ctx.fillStyle = `rgba(255, 255, 255, ${HIGHLIGHT_VEIL * alpha})`;
    for (const commands of usable) {
      ctx.beginPath();
      traceSvgPath(ctx, commands);
      ctx.fill();
    }
    ctx.lineJoin = "round";
    for (const [colour, width] of [[`rgba(255, 255, 255, ${alpha})`, 36], [`rgba(${HIGHLIGHT_INK}, ${alpha})`, 14]] as const) {
      ctx.strokeStyle = colour;
      ctx.lineWidth = (width * pxPerTexel) / pxPerMm;
      for (const commands of usable) {
        ctx.beginPath();
        traceSvgPath(ctx, commands);
        ctx.stroke();
      }
    }
    ctx.restore();
    drawn += usable.length;
  }
  return drawn;
}
