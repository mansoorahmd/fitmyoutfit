/**
 * From a point on a pattern piece to the screen (06-editor.md 5.2, N9): the
 * handles over the model need the four corners of an item where the camera
 * sees them, and whether the item faces the camera.
 *
 * How:
 * 1. `buildSurfaceLookup` indexes the model's triangles by their UVs ONCE per
 *    model: a grid over UV space, each cell listing the triangles whose UV
 *    triangle touches it (compact arrays, no objects per triangle). The
 *    pattern pieces sit side by side in one UV atlas, so a UV point is on at
 *    most one piece and, the cloth being one layer, on one triangle.
 * 2. `lookup.at(u, v)` finds that triangle (a few barycentric tests in one
 *    cell) and returns the 3D point, the outward normal, and how the surface
 *    moves per unit of U and of V there (the triangle's tangents).
 * 3. `projectItem` maps an item's box (piece millimetres) to the screen with
 *    the camera's view-projection matrix: the centre, the four corners, the
 *    box's outline as a curve (sampled along each edge, so it bends round the
 *    garment as the print does), the turn handle's stem, and whether the item
 *    faces the camera (the normal at its centre within FACING_LIMIT_DEGREES
 *    of the direction to the camera).
 *
 * Where the lookup is weak (and what it does there):
 * - A corner off the piece's cut shape (a big item near a curved edge) or on
 *   a seam: no triangle holds its UV. The corner is then placed on the
 *   tangent plane at the item's centre (`source: "plane"`), so a handle is
 *   still drawn, slightly off the cloth where the garment curves away.
 * - Strongly curved parts (the side of the body, a sleeve): the outline
 *   follows the cloth, but the screen box is no longer a rectangle; handles
 *   stay at the true corners.
 * - Hidden behind another part (a sleeve over a side panel): only facing is
 *   tested, not occlusion. The handles of such an item show where it is.
 *
 * Plain maths over typed arrays: no Three.js, no DOM.
 */
import { pieceToUv } from "../design/pattern.js";
import { layerCorners } from "../design/placement.js";
import type { Layer, PatternPiece, Point } from "../design/schema.js";
import type { GarmentMesh } from "./garment-view.js";

export type Vec3 = [number, number, number];

export interface SurfacePoint {
  position: Vec3;
  /** Unit, pointing out of the garment (the cloth's outside). */
  normal: Vec3;
  /** How far the surface moves for one unit of U, and of V, at this point (world units). */
  dU: Vec3;
  dV: Vec3;
}

export interface SurfaceLookup {
  /** The surface at a UV point, or null when no triangle of the model holds it. */
  at(u: number, v: number): SurfacePoint | null;
  /** Triangles indexed (for tests and the performance log). */
  readonly triangles: number;
  /** Milliseconds it took to build. */
  readonly buildMs: number;
}

/** How far a UV point may lie outside a triangle and still be on it (seams are a hair apart in float UVs). */
const EDGE = 1e-6;

/**
 * Indexes the meshes' triangles by UV. `cells` is the grid's size per side
 * (default 128: about 4 triangles per cell for a 100,000-triangle garment).
 */
export function buildSurfaceLookup(meshes: readonly GarmentMesh[], options: { cells?: number } = {}): SurfaceLookup {
  const start = typeof performance !== "undefined" ? performance.now() : Date.now();
  const N = Math.max(4, Math.round(options.cells ?? 128));
  // Flatten every triangle into arrays: 3 vertex positions, 3 UVs, 3 normals.
  let count = 0;
  for (const m of meshes) count += Math.floor((m.indices ? m.indices.length : m.positions.length / 3) / 3);
  const P = new Float32Array(count * 9);
  const T = new Float32Array(count * 6);
  const Nm = new Float32Array(count * 9);
  const hasNormal = new Uint8Array(count);
  let t = 0;
  for (const m of meshes) {
    const tris = Math.floor((m.indices ? m.indices.length : m.positions.length / 3) / 3);
    for (let k = 0; k < tris; k++, t++) {
      for (let c = 0; c < 3; c++) {
        const i = m.indices ? m.indices[k * 3 + c]! : k * 3 + c;
        P[t * 9 + c * 3] = m.positions[i * 3]!;
        P[t * 9 + c * 3 + 1] = m.positions[i * 3 + 1]!;
        P[t * 9 + c * 3 + 2] = m.positions[i * 3 + 2]!;
        T[t * 6 + c * 2] = m.uvs[i * 2]!;
        T[t * 6 + c * 2 + 1] = m.uvs[i * 2 + 1]!;
        if (m.normals) {
          Nm[t * 9 + c * 3] = m.normals[i * 3]!;
          Nm[t * 9 + c * 3 + 1] = m.normals[i * 3 + 1]!;
          Nm[t * 9 + c * 3 + 2] = m.normals[i * 3 + 2]!;
        }
      }
      hasNormal[t] = m.normals ? 1 : 0;
    }
  }
  // Two passes over the triangles' UV boxes: count per cell, then fill (compressed rows).
  const cellOf = (x: number) => Math.min(N - 1, Math.max(0, Math.floor(x * N)));
  const counts = new Int32Array(N * N + 1);
  const boxes = new Int32Array(count * 4);
  for (let k = 0; k < count; k++) {
    const u0 = T[k * 6]!, v0 = T[k * 6 + 1]!, u1 = T[k * 6 + 2]!, v1 = T[k * 6 + 3]!, u2 = T[k * 6 + 4]!, v2 = T[k * 6 + 5]!;
    const area = (u1 - u0) * (v2 - v0) - (u2 - u0) * (v1 - v0);
    if (!(Math.abs(area) > 1e-14)) {
      boxes[k * 4] = 1;
      boxes[k * 4 + 1] = 0; // empty box: skipped
      continue;
    }
    const cx0 = cellOf(Math.min(u0, u1, u2)), cx1 = cellOf(Math.max(u0, u1, u2));
    const cy0 = cellOf(Math.min(v0, v1, v2)), cy1 = cellOf(Math.max(v0, v1, v2));
    boxes[k * 4] = cx0;
    boxes[k * 4 + 1] = cx1;
    boxes[k * 4 + 2] = cy0;
    boxes[k * 4 + 3] = cy1;
    for (let y = cy0; y <= cy1; y++) for (let x = cx0; x <= cx1; x++) counts[y * N + x + 1]!++;
  }
  for (let c = 0; c < N * N; c++) counts[c + 1]! += counts[c]!;
  const list = new Int32Array(counts[N * N]!);
  const fillAt = counts.slice(0, N * N);
  for (let k = 0; k < count; k++) {
    const cx0 = boxes[k * 4]!, cx1 = boxes[k * 4 + 1]!, cy0 = boxes[k * 4 + 2]!, cy1 = boxes[k * 4 + 3]!;
    for (let y = cy0; y <= cy1; y++) for (let x = cx0; x <= cx1; x++) list[fillAt[y * N + x]!++] = k;
  }

  const at = (u: number, v: number): SurfacePoint | null => {
    if (!(u >= 0 && u <= 1 && v >= 0 && v <= 1)) return null;
    const cell = cellOf(v) * N + cellOf(u);
    for (let j = counts[cell]!; j < counts[cell + 1]!; j++) {
      const k = list[j]!;
      const u0 = T[k * 6]!, v0 = T[k * 6 + 1]!, u1 = T[k * 6 + 2]!, v1 = T[k * 6 + 3]!, u2 = T[k * 6 + 4]!, v2 = T[k * 6 + 5]!;
      const area = (u1 - u0) * (v2 - v0) - (u2 - u0) * (v1 - v0);
      const w1 = ((u - u0) * (v2 - v0) - (u2 - u0) * (v - v0)) / area;
      const w2 = ((u1 - u0) * (v - v0) - (u - u0) * (v1 - v0)) / area;
      const w0 = 1 - w1 - w2;
      if (w0 < -EDGE || w1 < -EDGE || w2 < -EDGE) continue;
      const p = (c: number, axis: number) => P[k * 9 + c * 3 + axis]!;
      const position: Vec3 = [0, 1, 2].map((a) => w0 * p(0, a) + w1 * p(1, a) + w2 * p(2, a)) as Vec3;
      // Tangents: solve E1 = dU*(u1-u0) + dV*(v1-v0), E2 = dU*(u2-u0) + dV*(v2-v0).
      const du1 = u1 - u0, dv1 = v1 - v0, du2 = u2 - u0, dv2 = v2 - v0;
      const det = du1 * dv2 - du2 * dv1;
      const dU = [0, 1, 2].map((a) => ((p(1, a) - p(0, a)) * dv2 - (p(2, a) - p(0, a)) * dv1) / det) as Vec3;
      const dV = [0, 1, 2].map((a) => ((p(2, a) - p(0, a)) * du1 - (p(1, a) - p(0, a)) * du2) / det) as Vec3;
      let normal: Vec3;
      if (hasNormal[k]) {
        const n = (c: number, axis: number) => Nm[k * 9 + c * 3 + axis]!;
        normal = normalise([0, 1, 2].map((a) => w0 * n(0, a) + w1 * n(1, a) + w2 * n(2, a)) as Vec3);
      } else {
        const e1: Vec3 = [p(1, 0) - p(0, 0), p(1, 1) - p(0, 1), p(1, 2) - p(0, 2)];
        const e2: Vec3 = [p(2, 0) - p(0, 0), p(2, 1) - p(0, 1), p(2, 2) - p(0, 2)];
        normal = normalise(cross(e1, e2));
      }
      return { position, normal, dU, dV };
    }
    return null;
  };
  const end = typeof performance !== "undefined" ? performance.now() : Date.now();
  return { at, triangles: count, buildMs: end - start };
}

export function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

export function normalise(v: Vec3): Vec3 {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}

/** The camera, as the projection needs it: a column-major 4 x 4 view-projection matrix (Three.js `elements` order), its position, and the canvas size in CSS px. */
export interface ScreenCamera {
  viewProjection: ArrayLike<number>;
  position: Vec3;
  width: number;
  height: number;
}

export interface ScreenPoint {
  x: number;
  y: number;
}

/** A world point on the screen (CSS px from the canvas's top left), or null behind the camera. */
export function toScreen(camera: ScreenCamera, p: Vec3): ScreenPoint | null {
  const m = camera.viewProjection;
  const x = m[0]! * p[0] + m[4]! * p[1] + m[8]! * p[2] + m[12]!;
  const y = m[1]! * p[0] + m[5]! * p[1] + m[9]! * p[2] + m[13]!;
  const w = m[3]! * p[0] + m[7]! * p[1] + m[11]! * p[2] + m[15]!;
  if (!(w > 1e-9)) return null;
  return { x: ((x / w + 1) / 2) * camera.width, y: ((1 - y / w) / 2) * camera.height };
}

/** Beyond this angle between the item's normal and the direction to the camera, the item "faces away" (06-editor.md 5.2: about 75 degrees). */
export const FACING_LIMIT_DEGREES = 75;

/** How a point of the item was found: on the cloth, or on the tangent plane at its centre (off the cut shape or across a seam). */
export type PointSource = "surface" | "plane";

export interface ItemOnScreen {
  centre: ScreenPoint;
  /** Clockwise from the item's top left (as `layerCorners`). */
  corners: ScreenPoint[];
  cornerSources: PointSource[];
  /** The box's outline on screen, following the cloth: a closed polyline. */
  outline: ScreenPoint[];
  /** The top edge's middle, and the turn handle's end beyond it (`stemPx` further, away from the centre). */
  top: ScreenPoint;
  turn: ScreenPoint;
  /** Angle between the normal at the centre and the direction to the camera, degrees. */
  angle: number;
  /** True when the item faces the camera (angle within FACING_LIMIT_DEGREES). */
  facing: boolean;
  /**
   * True when the piece is seen mirrored (its x axis runs right-to-left
   * relative to its y axis on screen): a clockwise turn on screen is then
   * an anticlockwise turn on the piece.
   */
  mirrored: boolean;
  /** Screen px per piece mm at the centre (for snapping distances in px). */
  pxPerMm: number;
}

/** Where a point of the piece is in the world: on the cloth, else on the plane through `base` (the item's centre). */
function piecePointToWorld(lookup: SurfaceLookup, piece: PatternPiece, point: Point, base: SurfacePoint | null, baseUv: { u: number; v: number } | null): { p: Vec3; source: PointSource } | null {
  const uv = pieceToUv(piece, point);
  const r = piece.uv;
  const onRect = uv.u >= r.x && uv.u <= r.x + r.width && uv.v >= r.y && uv.v <= r.y + r.height;
  const hit = onRect ? lookup.at(uv.u, uv.v) : null;
  if (hit) return { p: hit.position, source: "surface" };
  if (!base || !baseUv) return null;
  const du = uv.u - baseUv.u;
  const dv = uv.v - baseUv.v;
  return { p: [0, 1, 2].map((a) => base.position[a]! + base.dU[a]! * du + base.dV[a]! * dv) as Vec3, source: "plane" };
}

/**
 * The surface under an item's centre, or (when the centre is off the cut
 * shape) the nearest point of the cloth within the item's box: a spiral of
 * samples. Null when none of the box is on the cloth.
 */
function centreSurface(lookup: SurfaceLookup, piece: PatternPiece, layer: Pick<Layer, "position" | "size">): { surface: SurfacePoint; uv: { u: number; v: number } } | null {
  const tries: Point[] = [layer.position];
  for (let ring = 1; ring <= 4; ring++) {
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      tries.push({ x: layer.position.x + (Math.cos(a) * ring * layer.size.width) / 8, y: layer.position.y + (Math.sin(a) * ring * layer.size.height) / 8 });
    }
  }
  for (const point of tries) {
    const uv = pieceToUv(piece, point);
    const surface = lookup.at(uv.u, uv.v);
    // The base's UV is the item's centre's, so plane points keep their offsets from it.
    if (surface) {
      const centreUv = pieceToUv(piece, layer.position);
      if (point === layer.position) return { surface, uv: centreUv };
      // Move the found point's plane back to the centre along its tangents.
      const du = centreUv.u - uv.u;
      const dv = centreUv.v - uv.v;
      const position = [0, 1, 2].map((a) => surface.position[a]! + surface.dU[a]! * du + surface.dV[a]! * dv) as Vec3;
      return { surface: { ...surface, position }, uv: centreUv };
    }
  }
  return null;
}

/** Samples per edge of the outline curve. */
const EDGE_SAMPLES = 8;

/**
 * An item's box on the screen (N9). Null when none of the item is on the
 * cloth, or its centre is behind the camera.
 */
export function projectItem(
  lookup: SurfaceLookup,
  piece: PatternPiece,
  layer: Pick<Layer, "position" | "size" | "rotation">,
  camera: ScreenCamera,
  options: { stemPx?: number } = {},
): ItemOnScreen | null {
  const base = centreSurface(lookup, piece, layer);
  if (!base) return null;
  const centre = toScreen(camera, base.surface.position);
  if (!centre) return null;
  const world = (point: Point) => piecePointToWorld(lookup, piece, point, base.surface, base.uv);
  const cornersMm = layerCorners(layer);
  const corners: ScreenPoint[] = [];
  const cornerSources: PointSource[] = [];
  for (const c of cornersMm) {
    const w = world(c);
    const s = w && toScreen(camera, w.p);
    if (!w || !s) return null;
    corners.push(s);
    cornerSources.push(w.source);
  }
  const outline: ScreenPoint[] = [];
  for (let e = 0; e < 4; e++) {
    const a = cornersMm[e]!;
    const b = cornersMm[(e + 1) % 4]!;
    for (let k = 0; k < EDGE_SAMPLES; k++) {
      const t = k / EDGE_SAMPLES;
      const w = world({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
      const s = w && toScreen(camera, w.p);
      if (s) outline.push(s);
    }
  }
  const topMm = { x: (cornersMm[0]!.x + cornersMm[1]!.x) / 2, y: (cornersMm[0]!.y + cornersMm[1]!.y) / 2 };
  const topWorld = world(topMm);
  const top = (topWorld && toScreen(camera, topWorld.p)) ?? { x: (corners[0]!.x + corners[1]!.x) / 2, y: (corners[0]!.y + corners[1]!.y) / 2 };
  const stem = options.stemPx ?? 28;
  const away = { x: top.x - centre.x, y: top.y - centre.y };
  const len = Math.hypot(away.x, away.y) || 1;
  const turn = { x: top.x + (away.x / len) * stem, y: top.y + (away.y / len) * stem };
  // Facing: the normal against the direction to the camera.
  const toCam = normalise([camera.position[0] - base.surface.position[0], camera.position[1] - base.surface.position[1], camera.position[2] - base.surface.position[2]]);
  const n = base.surface.normal;
  const cos = Math.max(-1, Math.min(1, n[0] * toCam[0] + n[1] * toCam[1] + n[2] * toCam[2]));
  const angle = (Math.acos(cos) * 180) / Math.PI;
  // Mirrored: the screen images of the piece's +x and +y directions, by the sign of their cross product
  // (on the screen, with y down, an unmirrored piece keeps x-then-y clockwise: a positive cross product).
  const sx = screenDirection(camera, base.surface, piece, "x");
  const sy = screenDirection(camera, base.surface, piece, "y");
  const mirrored = sx.x * sy.y - sx.y * sy.x < 0;
  const pxPerMm = Math.hypot(sx.x, sx.y);
  return { centre, corners, cornerSources, outline, top, turn, angle, facing: angle <= FACING_LIMIT_DEGREES, mirrored, pxPerMm };
}

/** Screen px moved for 1 mm along the piece's x (or y) at a surface point. */
function screenDirection(camera: ScreenCamera, s: SurfacePoint, piece: PatternPiece, axis: "x" | "y"): ScreenPoint {
  const perMm = axis === "x" ? piece.uv.width / piece.width : piece.uv.height / piece.height;
  const d = axis === "x" ? s.dU : s.dV;
  const a = toScreen(camera, s.position);
  const b = toScreen(camera, [s.position[0] + d[0] * perMm, s.position[1] + d[1] * perMm, s.position[2] + d[2] * perMm]);
  if (!a || !b) return { x: 0, y: 0 };
  return { x: b.x - a.x, y: b.y - a.y };
}

/** A line on a piece (mm) drawn on the screen along the cloth: the points of it that are on the cloth and in front of the camera. */
export function projectPieceLine(lookup: SurfaceLookup, piece: PatternPiece, from: Point, to: Point, camera: ScreenCamera, samples = 24): ScreenPoint[][] {
  const runs: ScreenPoint[][] = [];
  let run: ScreenPoint[] = [];
  for (let k = 0; k <= samples; k++) {
    const t = k / samples;
    const uv = pieceToUv(piece, { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t });
    const hit = lookup.at(uv.u, uv.v);
    const s = hit && toScreen(camera, hit.position);
    if (s) run.push(s);
    else if (run.length) {
      runs.push(run);
      run = [];
    }
  }
  if (run.length) runs.push(run);
  return runs.filter((r) => r.length > 1);
}
