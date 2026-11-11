/**
 * Pattern-piece geometry: where a point on a flat piece lands in the model's
 * UV space, and which colour zone it belongs to. Plain functions over the
 * product definition (data), with no DOM, React or Three.js, so the backend
 * and the production-file work can use the same answers as the 3D view.
 *
 * Coordinates: a point on a piece is in millimetres from the piece's top-left
 * corner, X right, Y down. UV follows glTF: origin top-left, V down, 0 to 1.
 */
import type { PatternPiece, ProductDefinition } from "./schema.js";
import {
  flattenPath,
  parseSvgPathOrThrow,
  pointInPolylines,
  type PathCommand,
  type PathPoint,
  type Polyline,
} from "./svg-path.js";

export interface UvPoint {
  u: number;
  v: number;
}

/** A piece's paths, parsed and flattened once. */
export interface PieceGeometry {
  outline: { commands: PathCommand[]; polylines: Polyline[] };
  regions: Array<{ zone: string; commands: PathCommand[]; polylines: Polyline[] }>;
}

const geometryCache = new WeakMap<PatternPiece, PieceGeometry>();

/**
 * The piece's outline and regions, parsed. Cached per piece object, so call it
 * freely. Throws a `RangeError` for path data that does not parse, which a
 * validated product definition never has.
 */
export function pieceGeometry(piece: PatternPiece): PieceGeometry {
  const cached = geometryCache.get(piece);
  if (cached) return cached;
  const outline = parseSvgPathOrThrow(piece.outline);
  const geometry: PieceGeometry = {
    outline: { commands: outline, polylines: flattenPath(outline) },
    regions: piece.regions.map((region) => {
      const commands = parseSvgPathOrThrow(region.path);
      return { zone: region.zone, commands, polylines: flattenPath(commands) };
    }),
  };
  geometryCache.set(piece, geometry);
  return geometry;
}

/** Piece millimetres to the model's UV space. Linear: the piece's box maps onto its UV rectangle. */
export function pieceToUv(piece: PatternPiece, point: PathPoint): UvPoint {
  return {
    u: piece.uv.x + (point.x / piece.width) * piece.uv.width,
    v: piece.uv.y + (point.y / piece.height) * piece.uv.height,
  };
}

/** The inverse of `pieceToUv`: a UV point to the piece's millimetres. */
export function uvToPiece(piece: PatternPiece, uv: UvPoint): PathPoint {
  return {
    x: ((uv.u - piece.uv.x) / piece.uv.width) * piece.width,
    y: ((uv.v - piece.uv.y) / piece.uv.height) * piece.height,
  };
}

/** True when the point (mm) is inside the piece's outline. */
export function isInsidePiece(piece: PatternPiece, point: PathPoint): boolean {
  return pointInPolylines(pieceGeometry(piece).outline.polylines, point);
}

/**
 * The colour zone at a point of a piece: the topmost region that contains the
 * point, else the piece's own zone. `null` when the point is outside the
 * piece's outline (not part of the garment).
 */
export function zoneAtPiecePoint(piece: PatternPiece, point: PathPoint): string | null {
  const geometry = pieceGeometry(piece);
  if (!pointInPolylines(geometry.outline.polylines, point)) return null;
  for (let k = geometry.regions.length - 1; k >= 0; k--) {
    const region = geometry.regions[k]!;
    if (pointInPolylines(region.polylines, point)) return region.zone;
  }
  return piece.zone;
}

/** The piece whose UV rectangle holds a UV point, and the point in that piece's mm. */
export function pieceAtUv(
  product: ProductDefinition,
  uv: UvPoint,
): { piece: PatternPiece; point: PathPoint } | null {
  for (const piece of product.pieces) {
    const r = piece.uv;
    if (uv.u >= r.x && uv.u <= r.x + r.width && uv.v >= r.y && uv.v <= r.y + r.height) {
      return { piece, point: uvToPiece(piece, uv) };
    }
  }
  return null;
}

/**
 * The colour zone at a UV point of the model, for example where a ray from a
 * tap hits the garment. `null` when the point is on no piece.
 */
export function zoneAtUv(product: ProductDefinition, uv: UvPoint): { pieceId: string; zone: string } | null {
  const hit = pieceAtUv(product, uv);
  if (!hit) return null;
  const zone = zoneAtPiecePoint(hit.piece, hit.point);
  return zone === null ? null : { pieceId: hit.piece.id, zone };
}

/** The ids of the pieces each zone is drawn on (as the whole piece or as a region). */
export function piecesByZone(product: ProductDefinition): Map<string, string[]> {
  const map = new Map<string, string[]>(product.zones.map((z) => [z.id, []]));
  for (const piece of product.pieces) {
    for (const zone of new Set([piece.zone, ...piece.regions.map((r) => r.zone)])) {
      const list = map.get(zone);
      if (list && !list.includes(piece.id)) list.push(piece.id);
    }
  }
  return map;
}
