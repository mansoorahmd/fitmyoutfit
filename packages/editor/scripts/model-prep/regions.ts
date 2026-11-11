/**
 * Colour-zone regions that follow a piece's edge (side panels, sleeve ends),
 * built from the piece's traced outline in millimetres. Plain functions; the
 * result is SVG path data for the product definition (lines only).
 *
 * A region may reach past the outline: only the part inside the outline is
 * garment (see the product definition format), so the bands run `overshoot`
 * mm past the piece's edge rather than tracing it exactly.
 */
import type { PathPoint } from "../../src/design/svg-path.js";
import { bounds, columnExtent, polygonToSvgPath, rowExtent } from "./outline.js";

/** Which edge of the piece a band follows. Left and right are as the piece lies flat (X right, Y down). */
export type BandEdge = "left" | "right" | "bottom";

export interface BandSpec {
  edge: BandEdge;
  /** Width of the band, in mm, measured across the edge (horizontally for left and right, vertically for bottom). */
  width: number;
  /**
   * Left and right bands only: where the band starts, from the top. `"underarm"` (default) starts it where the piece
   * reaches its full width in its top half: the bottom of the armhole on a body piece. A number is a Y in mm.
   */
  from?: "underarm" | number;
}

/** How far a band reaches past the piece's edge, in mm. */
export const BAND_OVERSHOOT_MM = 10;
/** Step between the band's sampled points, in mm. */
export const BAND_STEP_MM = 5;
/**
 * Left and right bands stop following the edge this far above the bottom and
 * go straight down from there, so a rounded hem corner does not bend the band.
 */
export const BAND_CORNER_MM = 15;

/**
 * Where a side seam ends at the top: walking up the piece's side edge from
 * half its height, the first place where the edge turns inwards by more than
 * 1 mm over 2 mm of height. On a body piece that is the underarm point, where
 * the armhole curve leaves the side seam. (The widest point is not a safe
 * test: a shoulder can reach as far out as the underarm.)
 */
export function underarmY(outline: readonly PathPoint[], edge: "left" | "right"): number {
  const box = bounds(outline);
  const sideX = (y: number) => {
    const row = rowExtent(outline, y);
    return row ? (edge === "left" ? row.left : -row.right) : null; // larger = further in
  };
  const step = 2;
  for (let y = box.minY + (box.maxY - box.minY) / 2; y - step >= box.minY; y -= 0.5) {
    const here = sideX(y);
    const above = sideX(y - step);
    if (here === null || above === null) continue;
    if (above - here > 1) return y;
  }
  return box.minY;
}

function samples(from: number, to: number, step: number): number[] {
  const out: number[] = [];
  const n = Math.max(1, Math.ceil((to - from) / step));
  for (let k = 0; k <= n; k++) out.push(from + ((to - from) * k) / n);
  return out;
}

/**
 * The X range of the hem: the outline's segments that run within 15 degrees
 * of horizontal with both ends within `depth` of the piece's bottom. Beyond
 * it the outline turns up a side edge.
 */
export function hemRange(outline: readonly PathPoint[], depth: number): { from: number; to: number } {
  const box = bounds(outline);
  const flat = Math.tan((15 * Math.PI) / 180);
  let from = Infinity;
  let to = -Infinity;
  for (let k = 0; k < outline.length; k++) {
    const a = outline[k]!;
    const b = outline[(k + 1) % outline.length]!;
    if (Math.abs(b.y - a.y) > flat * Math.abs(b.x - a.x)) continue;
    if (Math.min(a.y, b.y) < box.maxY - depth) continue;
    from = Math.min(from, a.x, b.x);
    to = Math.max(to, a.x, b.x);
  }
  if (from === Infinity || to - from <= 0) throw new RangeError("the outline has no bottom edge to follow");
  return { from, to };
}

/**
 * A band of `width` mm along one edge of the piece, as a closed polygon (mm).
 *
 * - Left and right: from `from` (default: the underarm) down to past the
 *   bottom. The inner edge is the outline's side edge moved inwards by
 *   `width`; it goes straight down for the last `BAND_CORNER_MM`.
 * - Bottom: across the whole piece. The inner edge is the hem moved up by
 *   `width`; beyond the hem's ends (where the outline turns up a side edge)
 *   it runs on level, so the band meets itself at a seam that joins the two
 *   sides (a sleeve's underarm seam) at the same height.
 */
export function edgeBand(outline: readonly PathPoint[], spec: BandSpec): PathPoint[] {
  if (!(spec.width > 0)) throw new RangeError(`a band needs a positive width, got ${spec.width}`);
  const box = bounds(outline);
  const o = BAND_OVERSHOOT_MM;
  if (spec.edge === "bottom") {
    const hem = hemRange(outline, spec.width);
    const inner: PathPoint[] = [];
    for (const x of samples(hem.from, hem.to, BAND_STEP_MM)) {
      const col = columnExtent(outline, x);
      if (col) inner.push({ x, y: col.bottom - spec.width });
    }
    const first = inner[0]!;
    const last = inner[inner.length - 1]!;
    return [
      { x: box.minX - o, y: first.y },
      ...inner,
      { x: box.maxX + o, y: last.y },
      { x: box.maxX + o, y: box.maxY + o },
      { x: box.minX - o, y: box.maxY + o },
    ];
  }
  const side = spec.edge;
  const top = typeof spec.from === "number" ? spec.from : underarmY(outline, side);
  const inner: PathPoint[] = [];
  for (const y of samples(top, Math.max(top, box.maxY - BAND_CORNER_MM), BAND_STEP_MM)) {
    const row = rowExtent(outline, y);
    if (!row) continue;
    inner.push({ x: side === "left" ? row.left + spec.width : row.right - spec.width, y });
  }
  if (inner.length < 2) throw new RangeError(`the outline has no ${side} edge below y = ${top} mm`);
  const outerX = side === "left" ? box.minX - o : box.maxX + o;
  const lastInner = inner[inner.length - 1]!;
  return [{ x: outerX, y: top }, ...inner, { x: lastInner.x, y: box.maxY + o }, { x: outerX, y: box.maxY + o }];
}

/** The band as SVG path data (straight lines). */
export function edgeBandPath(outline: readonly PathPoint[], spec: BandSpec): string {
  return polygonToSvgPath(edgeBand(outline, spec), 2);
}
