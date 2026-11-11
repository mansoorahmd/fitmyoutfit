/**
 * Placing layers on pattern pieces: plain geometry in piece millimetres, with
 * no DOM and no Three.js, so it is tested without a GPU and the 3D view only
 * has to supply "this mesh was hit at this UV".
 *
 * - A pointer on the model becomes a point on a piece: the ray's hit gives the
 *   mesh and the UV there; `pieceAtMeshUv` finds the piece of that mesh whose
 *   UV rectangle holds the UV and converts it to the piece's millimetres.
 * - A layer stays on its own piece: `dragPosition` ignores points on other
 *   pieces and keeps the layer's centre inside its piece's box.
 * - A layer is a box (`size`) about its centre (`position`), turned by
 *   `rotation` degrees clockwise. `isPointInLayer` tests a point against the
 *   turned box.
 */
import type { DesignDocument, Layer, PatternPiece, Point, ProductDefinition } from "./schema.js";
import { uvToPiece, type UvPoint } from "./pattern.js";

/**
 * The piece under a hit on the model: the piece carried by `meshName` whose UV
 * rectangle holds `uv`, and the point in that piece's millimetres. `null` when
 * the mesh carries no piece or the UV is outside all of its pieces.
 */
export function pieceAtMeshUv(
  product: ProductDefinition,
  meshName: string,
  uv: UvPoint,
): { piece: PatternPiece; point: Point } | null {
  const t = UV_EDGE_TOLERANCE;
  for (const piece of product.pieces) {
    if (piece.mesh !== meshName) continue;
    const r = piece.uv;
    if (uv.u >= r.x - t && uv.u <= r.x + r.width + t && uv.v >= r.y - t && uv.v <= r.y + r.height + t) {
      return { piece, point: clampToPiece(piece, uvToPiece(piece, uv)) };
    }
  }
  return null;
}

/**
 * How far (in UV units) a hit may lie outside a piece's UV rectangle and still
 * count: model UVs are 32-bit floats, so a vertex on the seam can be a hair
 * outside. 1e-4 is 0.2 texture pixels at 2048.
 */
export const UV_EDGE_TOLERANCE = 1e-4;

/** A point in the layer's own frame: origin at its centre, axes along its (turned) box. */
export function toLayerFrame(layer: Pick<Layer, "position" | "rotation">, point: Point): Point {
  const dx = point.x - layer.position.x;
  const dy = point.y - layer.position.y;
  const a = (-layer.rotation * Math.PI) / 180;
  return { x: dx * Math.cos(a) - dy * Math.sin(a), y: dx * Math.sin(a) + dy * Math.cos(a) };
}

/**
 * True when the point (piece mm) is inside the layer's turned box, grown by
 * `slopMm` on every side (a finger is wider than a thin line of text).
 */
export function isPointInLayer(layer: Layer, point: Point, slopMm = 0): boolean {
  const local = toLayerFrame(layer, point);
  return Math.abs(local.x) <= layer.size.width / 2 + slopMm && Math.abs(local.y) <= layer.size.height / 2 + slopMm;
}

/** The topmost layer on `pieceId` whose box holds the point, or null. */
export function layerAtPoint(design: DesignDocument, pieceId: string, point: Point, slopMm = 0): Layer | null {
  for (let k = design.layers.length - 1; k >= 0; k--) {
    const layer = design.layers[k]!;
    if (layer.pieceId === pieceId && isPointInLayer(layer, point, slopMm)) return layer;
  }
  return null;
}

/** The four corners of a layer's turned box, in piece mm, clockwise from the top left. */
export function layerCorners(layer: Pick<Layer, "position" | "size" | "rotation">): Point[] {
  const a = (layer.rotation * Math.PI) / 180;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  const hw = layer.size.width / 2;
  const hh = layer.size.height / 2;
  return [
    [-hw, -hh],
    [hw, -hh],
    [hw, hh],
    [-hw, hh],
  ].map(([x, y]) => ({ x: layer.position.x + x! * cos - y! * sin, y: layer.position.y + x! * sin + y! * cos }));
}

/** The point moved into the piece's box (0, 0) to (width, height). */
export function clampToPiece(piece: Pick<PatternPiece, "width" | "height">, point: Point): Point {
  return { x: Math.min(piece.width, Math.max(0, point.x)), y: Math.min(piece.height, Math.max(0, point.y)) };
}

export interface LayerDrag {
  layerId: string;
  pieceId: string;
  /** Layer centre minus the point where the drag started, so the layer does not jump to the pointer. */
  offset: Point;
}

/** Starts a drag at a point on the layer's piece. */
export function startLayerDrag(layer: Layer, point: Point): LayerDrag {
  return { layerId: layer.id, pieceId: layer.pieceId, offset: { x: layer.position.x - point.x, y: layer.position.y - point.y } };
}

/**
 * The layer's new centre for a pointer on the model during a drag, or `null`
 * when the pointer is on another piece or off the garment (the layer then
 * stays where it is). The centre never leaves its piece's box.
 */
export function dragPosition(
  product: ProductDefinition,
  drag: LayerDrag,
  hit: { piece: PatternPiece; point: Point } | null,
): Point | null {
  if (!hit || hit.piece.id !== drag.pieceId) return null;
  const piece = product.pieces.find((p) => p.id === drag.pieceId);
  if (!piece) return null;
  return clampToPiece(piece, { x: hit.point.x + drag.offset.x, y: hit.point.y + drag.offset.y });
}

/** Smallest and largest box side a resize may produce, in mm. */
export const MIN_LAYER_SIDE_MM = 5;
export const MAX_LAYER_SIDE_MM = 1000;

/**
 * The fields that change when a layer is resized by `factor` about its centre:
 * the box, and for text and number layers the font size with it, so the text
 * keeps its proportions. The factor is limited so no side leaves
 * MIN_LAYER_SIDE_MM to MAX_LAYER_SIDE_MM.
 */
export function scaleLayer(layer: Layer, factor: number): { size: Layer["size"]; fontSize?: number } {
  if (!Number.isFinite(factor) || factor <= 0) throw new RangeError(`scaleLayer: the factor must be a positive number, got ${factor}`);
  const { width, height } = layer.size;
  const low = MIN_LAYER_SIDE_MM / Math.min(width, height);
  const high = MAX_LAYER_SIDE_MM / Math.max(width, height);
  const f = Math.min(Math.max(factor, Math.min(low, 1)), Math.max(high, 1));
  const size = { width: round3(width * f), height: round3(height * f) };
  if (layer.kind === "text" || layer.kind === "number") return { size, fontSize: round3(layer.fontSize * f) };
  return { size };
}

/** Degrees in -180 (exclusive) to 180 (inclusive), for a rotation control. Stored values are not wrapped. */
export function normalizeRotation(degrees: number): number {
  const r = ((((degrees + 180) % 360) + 360) % 360) - 180;
  return r === -180 ? 180 : r;
}

/** Rounds to 0.001 mm, so dragged positions do not carry float noise into the document. */
export function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}
