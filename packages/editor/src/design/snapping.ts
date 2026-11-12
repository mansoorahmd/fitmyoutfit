/**
 * Snapping while an item is moved (06-editor.md 5.2, N10): to the piece's
 * vertical centre line (the middle of its print area), to the centres of the position presets on the piece,
 * and to the centres and edges of the other items on the same piece. Each
 * axis snaps on its own (the nearest line within reach); the lines it snapped
 * to come back as guides to draw. Snapping is released by moving past the
 * reach, and held off with `free` (Alt with a mouse, or the setting).
 *
 * The reach is 6 mm on the garment or 8 screen px, whichever is larger.
 */
import { layerBounds, printAreaOf } from "./print-area.js";
import type { DesignDocument, Layer, Point, ProductDefinition } from "./schema.js";

export const SNAP_MM = 6;
export const SNAP_PX = 8;

/** The reach in mm for a scale of `pxPerMm` screen px per mm. */
export function snapReachMm(pxPerMm?: number | null): number {
  return pxPerMm && pxPerMm > 0 ? Math.max(SNAP_MM, SNAP_PX / pxPerMm) : SNAP_MM;
}

/** What a snap line is: the piece's centre line, a preset's centre, another item's centre or edge. */
export type SnapSource = "centre-line" | "preset" | "item-centre" | "item-edge";

export interface SnapLine {
  axis: "x" | "y";
  /** The line's position on the piece, mm. */
  at: number;
  source: SnapSource;
}

export interface SnapGuide {
  pieceId: string;
  from: Point;
  to: Point;
  axis: "x" | "y";
  source: SnapSource;
}

export interface SnapResult {
  position: Point;
  /** The lines snapped to (none, one per axis at most), as lines across the print area to draw. */
  guides: SnapGuide[];
}

/** The lines an item on `pieceId` may snap to (not counting itself). */
export function snapLines(product: ProductDefinition, design: Pick<DesignDocument, "layers">, layerId: string, pieceId: string): SnapLine[] {
  const piece = product.pieces.find((p) => p.id === pieceId);
  if (!piece) return [];
  // The centre line is the print area's middle: the piece's box may be a little off centre (a cut shape is
  // not symmetric to the millimetre), and print areas are laid out on the garment's centre line.
  const area = printAreaOf(piece);
  const lines: SnapLine[] = [{ axis: "x", at: area.x + area.width / 2, source: "centre-line" }];
  for (const preset of product.placements) {
    if (preset.pieceId !== pieceId) continue;
    lines.push({ axis: "x", at: preset.centre.x, source: "preset" }, { axis: "y", at: preset.centre.y, source: "preset" });
  }
  for (const other of design.layers) {
    if (other.id === layerId || other.pieceId !== pieceId) continue;
    const b = layerBounds(other);
    lines.push(
      { axis: "x", at: other.position.x, source: "item-centre" },
      { axis: "y", at: other.position.y, source: "item-centre" },
      { axis: "x", at: b.x, source: "item-edge" },
      { axis: "x", at: b.x + b.width, source: "item-edge" },
      { axis: "y", at: b.y, source: "item-edge" },
      { axis: "y", at: b.y + b.height, source: "item-edge" },
    );
  }
  return lines;
}

/**
 * Snaps a proposed centre: on each axis, the item's centre or either edge of
 * its box, to the nearest line within `reachMm`. Centre lines win a tie over
 * edges (they come first).
 */
export function snapPosition(
  product: ProductDefinition,
  design: Pick<DesignDocument, "layers">,
  layer: Pick<Layer, "id" | "pieceId" | "size" | "rotation">,
  proposed: Point,
  options: { reachMm?: number; free?: boolean } = {},
): SnapResult {
  if (options.free) return { position: proposed, guides: [] };
  const reach = options.reachMm ?? SNAP_MM;
  const piece = product.pieces.find((p) => p.id === layer.pieceId);
  if (!piece) return { position: proposed, guides: [] };
  const area = printAreaOf(piece);
  const b = layerBounds({ ...layer, position: proposed });
  const lines = snapLines(product, design, layer.id, layer.pieceId);
  const position = { ...proposed };
  const guides: SnapGuide[] = [];
  for (const axis of ["x", "y"] as const) {
    const centre = axis === "x" ? proposed.x : proposed.y;
    const half = (axis === "x" ? b.width : b.height) / 2;
    // The item's anchors: its centre, then its two edges (as offsets from the centre).
    const anchors = [0, -half, half];
    let best: { delta: number; line: SnapLine } | null = null;
    for (const line of lines) {
      if (line.axis !== axis) continue;
      // An item's centre snaps to centre lines; its edges snap to other items' edges.
      for (const offset of line.source === "item-edge" ? anchors.slice(1) : anchors.slice(0, 1)) {
        const delta = line.at - (centre + offset);
        if (Math.abs(delta) <= reach && (!best || Math.abs(delta) < Math.abs(best.delta) - 1e-9)) best = { delta, line };
      }
    }
    if (!best) continue;
    if (axis === "x") position.x = proposed.x + best.delta;
    else position.y = proposed.y + best.delta;
    guides.push(
      axis === "x"
        ? { pieceId: layer.pieceId, axis, source: best.line.source, from: { x: best.line.at, y: area.y }, to: { x: best.line.at, y: area.y + area.height } }
        : { pieceId: layer.pieceId, axis, source: best.line.source, from: { x: area.x, y: best.line.at }, to: { x: area.x + area.width, y: best.line.at } },
    );
  }
  return { position: { x: Math.round(position.x * 1000) / 1000, y: Math.round(position.y * 1000) / 1000 }, guides };
}

/** The print area's four edges as lines on the piece (drawn dashed while placing). */
export function printAreaLines(product: ProductDefinition, pieceId: string): Array<{ pieceId: string; from: Point; to: Point }> {
  const piece = product.pieces.find((p) => p.id === pieceId);
  if (!piece) return [];
  const a = printAreaOf(piece);
  const c = [
    { x: a.x, y: a.y },
    { x: a.x + a.width, y: a.y },
    { x: a.x + a.width, y: a.y + a.height },
    { x: a.x, y: a.y + a.height },
  ];
  return c.map((from, k) => ({ pieceId, from, to: c[(k + 1) % 4]! }));
}
