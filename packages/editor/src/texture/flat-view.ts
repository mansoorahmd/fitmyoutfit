/**
 * The flat view (06-editor.md 10.3): when 3D cannot run, the editor shows the
 * garment's main pieces as cut, the front and the back side by side and the
 * sleeves under them, drawn by `drawPatternTexture` in flat mode, so every
 * colour, name, number and logo shows exactly as on the model.
 *
 * `flatViewProduct` lays the pieces out in a box: it returns the product with
 * only those pieces, each given a place (`uv`) inside a square drawing of
 * `size` pixels whose top-left `width` x `height` is the box.
 */
import type { PatternPiece, ProductDefinition } from "../design/schema.js";

export interface FlatViewLayout {
  /** The product narrowed to the pieces shown, placed for the drawing. */
  product: ProductDefinition;
  /** The square drawing's edge: pass it as `size` to `drawPatternTexture`. */
  size: number;
  /** Where each piece is, in pixels, for a caption or a tap. */
  places: Array<{ pieceId: string; x: number; y: number; width: number; height: number }>;
}

/** The sleeve pieces: those that carry the product's left and right placement presets. */
export function sleevePieces(product: ProductDefinition): { left: PatternPiece | null; right: PatternPiece | null } {
  const piece = (side: "left" | "right") => {
    const preset = product.placements.find((p) => p.side === side);
    return (preset && product.pieces.find((p) => p.id === preset.pieceId)) ?? null;
  };
  return { left: piece("left"), right: piece("right") };
}

export function flatViewProduct(product: ProductDefinition, box: { width: number; height: number; gap?: number }): FlatViewLayout {
  const { width, height } = box;
  const gap = box.gap ?? Math.round(Math.min(width, height) * 0.04);
  const size = Math.max(width, height);
  const front = product.pieces.find((p) => p.id === product.views.front);
  const back = product.pieces.find((p) => p.id === product.views.back);
  const { left, right } = sleevePieces(product);
  const top = [front, back].filter((p): p is PatternPiece => Boolean(p));
  const bottom = [right, left].filter((p): p is PatternPiece => Boolean(p) && !top.includes(p!));
  // Rows share the height by the pieces' own heights, so the body is large and the sleeves small.
  const topH = Math.max(0, ...top.map((p) => p.height));
  const bottomH = bottom.length > 0 ? Math.max(...bottom.map((p) => p.height)) : 0;
  const usable = height - gap * (bottom.length > 0 ? 3 : 2);
  const share = topH + bottomH > 0 ? usable / (topH + bottomH) : 0;
  const rows: Array<{ pieces: PatternPiece[]; y: number; h: number }> = [{ pieces: top, y: gap, h: topH * share }];
  if (bottom.length > 0) rows.push({ pieces: bottom, y: gap * 2 + topH * share, h: bottomH * share });
  const pieces: PatternPiece[] = [];
  const places: FlatViewLayout["places"] = [];
  for (const row of rows) {
    const cellW = (width - gap * (row.pieces.length + 1)) / Math.max(1, row.pieces.length);
    row.pieces.forEach((piece, k) => {
      const scale = Math.min(cellW / piece.width, row.h / piece.height);
      const w = piece.width * scale;
      const h = piece.height * scale;
      const x = gap + k * (cellW + gap) + (cellW - w) / 2;
      const y = row.y + (row.h - h) / 2;
      pieces.push({ ...piece, uv: { x: x / size, y: y / size, width: w / size, height: h / size } });
      places.push({ pieceId: piece.id, x, y, width: w, height: h });
    });
  }
  return { product: { ...product, pieces }, size, places };
}
