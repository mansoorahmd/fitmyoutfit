/**
 * Print areas (06-editor.md 5.2, N6): an item's whole box stays inside its
 * piece's print area, and a "clipped" check says when an item is still cut by
 * the piece's outline (a large logo near a curved edge, a name crossing the
 * side seam), with the nearest position where it is not ("Move it in").
 *
 * The box is the item's turned box (`layerCorners`); its upright bounds are
 * what must fit in the area. Plain geometry in piece millimetres.
 */
import { isInsidePiece } from "./pattern.js";
import { layerCorners, round3 } from "./placement.js";
import type { Layer, PatternPiece, Point, ProductDefinition } from "./schema.js";

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The piece's print area, or its whole box when it has none. */
export function printAreaOf(piece: Pick<PatternPiece, "width" | "height" | "printArea">): Rect {
  return piece.printArea ?? { x: 0, y: 0, width: piece.width, height: piece.height };
}

/** The upright bounds of an item's turned box. */
export function layerBounds(layer: Pick<Layer, "position" | "size" | "rotation">): Rect {
  const c = layerCorners(layer);
  const xs = c.map((p) => p.x);
  const ys = c.map((p) => p.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}

/**
 * The item's centre moved (as little as possible) so its whole box is inside
 * the area. A box larger than the area in one direction is centred on it in
 * that direction.
 */
export function clampIntoArea(area: Rect, layer: Pick<Layer, "position" | "size" | "rotation">, position: Point = layer.position): Point {
  const b = layerBounds({ ...layer, position });
  const halfW = b.width / 2;
  const halfH = b.height / 2;
  // The bounds are centred on the position (a turned rectangle is symmetric about its centre).
  const clampAxis = (value: number, from: number, size: number, half: number) => (2 * half >= size ? from + size / 2 : Math.min(from + size - half, Math.max(from + half, value)));
  return { x: round3(clampAxis(position.x, area.x, area.width, halfW)), y: round3(clampAxis(position.y, area.y, area.height, halfH)) };
}

/** `clampIntoArea` with the item's own piece's print area. */
export function clampToPrintArea(product: ProductDefinition, layer: Pick<Layer, "pieceId" | "position" | "size" | "rotation">, position: Point = layer.position): Point {
  const piece = product.pieces.find((p) => p.id === layer.pieceId);
  return piece ? clampIntoArea(printAreaOf(piece), layer, position) : position;
}

/** The largest factor (at least the smallest that keeps it) by which the item may grow and still fit in its print area. */
export function maxScaleInArea(area: Rect, layer: Pick<Layer, "size" | "rotation" | "position">): number {
  const b = layerBounds(layer);
  if (b.width <= 0 || b.height <= 0) return 1;
  return Math.min(area.width / b.width, area.height / b.height);
}

/** Points along the item's box edges (corners and `perEdge` between), in piece mm. */
export function boxSamples(layer: Pick<Layer, "position" | "size" | "rotation">, perEdge = 6): Point[] {
  const c = layerCorners(layer);
  const out: Point[] = [];
  for (let e = 0; e < 4; e++) {
    const a = c[e]!;
    const b = c[(e + 1) % 4]!;
    for (let k = 0; k < perEdge; k++) {
      const t = k / perEdge;
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    }
  }
  return out;
}

/** True when part of the item's box is outside its piece's outline (it would be cut off at the seam). */
export function isClipped(product: ProductDefinition, layer: Pick<Layer, "pieceId" | "position" | "size" | "rotation">): boolean {
  const piece = product.pieces.find((p) => p.id === layer.pieceId);
  if (!piece) return false;
  return boxSamples(layer).some((p) => !isInsidePiece(piece, p));
}

/**
 * "Move it in": the nearest centre (searching outwards from the item, towards
 * the print area's middle and round it) where the whole box is inside the
 * outline and the print area; null when there is none (the item is too big
 * for the piece; making it smaller is the fix).
 */
export function moveInside(product: ProductDefinition, layer: Pick<Layer, "pieceId" | "position" | "size" | "rotation">): Point | null {
  const piece = product.pieces.find((p) => p.id === layer.pieceId);
  if (!piece) return null;
  const area = printAreaOf(piece);
  const fits = (at: Point) => {
    const clamped = clampIntoArea(area, layer, at);
    if (Math.abs(clamped.x - at.x) > 1e-6 || Math.abs(clamped.y - at.y) > 1e-6) return false;
    return boxSamples({ ...layer, position: at }).every((p) => isInsidePiece(piece, p));
  };
  const start = clampIntoArea(area, layer, layer.position);
  if (fits(start)) return start;
  // Rings of candidates round the start, 4 mm apart, nearest first; the first that fits wins.
  const step = 4;
  // At most 200 mm away and 64 directions a ring: a box too big for the piece fails in milliseconds, not seconds.
  const maxRing = Math.min(50, Math.ceil(Math.max(area.width, area.height) / step));
  for (let ring = 1; ring <= maxRing; ring++) {
    const r = ring * step;
    const count = Math.min(64, Math.max(8, Math.round((2 * Math.PI * r) / step)));
    let best: Point | null = null;
    let bestD = Infinity;
    for (let k = 0; k < count; k++) {
      const a = (k / count) * 2 * Math.PI;
      const at = { x: round3(start.x + Math.cos(a) * r), y: round3(start.y + Math.sin(a) * r) };
      if (!fits(at)) continue;
      const d = Math.hypot(at.x - layer.position.x, at.y - layer.position.y);
      if (d < bestD) {
        bestD = d;
        best = at;
      }
    }
    if (best) return best;
  }
  return null;
}
