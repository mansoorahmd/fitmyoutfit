/**
 * The outline of a flat pattern piece, traced from its UV mesh: the mesh's
 * boundary loop, simplified, written as SVG path data in the piece's
 * millimetres. Plain functions with no file or GPU access, so they are unit
 * tested (outline.test.ts) and the processing script only wires them up.
 */
import type { PathPoint } from "../../src/design/svg-path.js";

/**
 * The boundary loops of a triangle mesh: the edges used by exactly one
 * triangle, chained into closed loops, as lists of vertex indices.
 *
 * Vertices with the same `key` (for example the same UV) count as one, so a
 * mesh split at a seam inside the piece does not show a boundary there.
 * Each loop runs the way its triangles wind (a counter-clockwise mesh gives
 * counter-clockwise loops). Throws a `RangeError` when the boundary is not a
 * set of simple loops (two boundary edges leave the same vertex), which a
 * pattern piece never has.
 */
export function boundaryLoops(indices: ArrayLike<number>, key: (vertex: number) => string | number = (v) => v): number[][] {
  if (indices.length % 3 !== 0) throw new RangeError(`index count ${indices.length} is not a multiple of 3`);
  const canonical = new Map<string | number, number>();
  const rep = (v: number) => {
    const k = key(v);
    const found = canonical.get(k);
    if (found !== undefined) return found;
    canonical.set(k, v);
    return v;
  };
  // Directed edges a -> b as the triangles list them; an undirected edge used once is on the boundary.
  const uses = new Map<string, number>();
  const directed: Array<[number, number]> = [];
  for (let t = 0; t < indices.length; t += 3) {
    const tri = [rep(indices[t]!), rep(indices[t + 1]!), rep(indices[t + 2]!)];
    if (tri[0] === tri[1] || tri[1] === tri[2] || tri[0] === tri[2]) continue; // degenerate after welding
    for (let e = 0; e < 3; e++) {
      const a = tri[e]!;
      const b = tri[(e + 1) % 3]!;
      directed.push([a, b]);
      const k = a < b ? `${a}_${b}` : `${b}_${a}`;
      uses.set(k, (uses.get(k) ?? 0) + 1);
    }
  }
  const next = new Map<number, number>();
  for (const [a, b] of directed) {
    const k = a < b ? `${a}_${b}` : `${b}_${a}`;
    if (uses.get(k) !== 1) continue;
    if (next.has(a)) throw new RangeError(`the mesh boundary is not simple: two boundary edges leave vertex ${a}`);
    next.set(a, b);
  }
  const loops: number[][] = [];
  const seen = new Set<number>();
  for (const start of next.keys()) {
    if (seen.has(start)) continue;
    const loop: number[] = [];
    let v = start;
    while (!seen.has(v)) {
      seen.add(v);
      loop.push(v);
      const n = next.get(v);
      if (n === undefined) throw new RangeError(`the mesh boundary is not closed at vertex ${v}`);
      v = n;
    }
    if (v !== start) throw new RangeError(`the mesh boundary is not simple near vertex ${v}`);
    loops.push(loop);
  }
  return loops;
}

/** Signed area of a closed polygon by the shoelace formula (positive when counter-clockwise with Y up). */
export function signedArea(points: readonly PathPoint[]): number {
  let sum = 0;
  for (let k = 0; k < points.length; k++) {
    const a = points[k]!;
    const b = points[(k + 1) % points.length]!;
    sum += a.x * b.y - b.x * a.y;
  }
  return sum / 2;
}

function distanceToSegment(p: PathPoint, a: PathPoint, b: PathPoint): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** Douglas-Peucker on an open run of points, keeping both ends. */
function simplifyRun(points: readonly PathPoint[], tolerance: number): PathPoint[] {
  if (points.length <= 2) return [...points];
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const stack: Array<[number, number]> = [[0, points.length - 1]];
  while (stack.length > 0) {
    const [first, last] = stack.pop()!;
    let worst = -1;
    let index = -1;
    for (let k = first + 1; k < last; k++) {
      const d = distanceToSegment(points[k]!, points[first]!, points[last]!);
      if (d > worst) {
        worst = d;
        index = k;
      }
    }
    if (index !== -1 && worst > tolerance) {
      keep[index] = 1;
      stack.push([first, index], [index, last]);
    }
  }
  return points.filter((_, k) => keep[k] === 1);
}

/**
 * Simplifies a closed polygon (Douglas-Peucker): drops points that lie within
 * `tolerance` of the simplified outline, so every original point stays within
 * `tolerance` of the result. The kept points are a subset of the input, so the
 * result never leaves the input's bounding box.
 */
export function simplifyClosed(points: readonly PathPoint[], tolerance: number): PathPoint[] {
  if (points.length <= 3) return [...points];
  // Split at the point farthest from the first one, simplify both halves.
  let far = 1;
  let best = -1;
  for (let k = 1; k < points.length; k++) {
    const d = Math.hypot(points[k]!.x - points[0]!.x, points[k]!.y - points[0]!.y);
    if (d > best) {
      best = d;
      far = k;
    }
  }
  const first = simplifyRun(points.slice(0, far + 1), tolerance);
  const second = simplifyRun([...points.slice(far), points[0]!], tolerance);
  return [...first.slice(0, -1), ...second.slice(0, -1)];
}

/** Rounds to `decimals` places, without "-0". */
export function roundTo(value: number, decimals: number): number {
  const f = 10 ** decimals;
  const r = Math.round(value * f) / f;
  return r === 0 ? 0 : r;
}

/** A closed polygon as SVG path data with straight lines only: `M x y L x y ... Z`. */
export function polygonToSvgPath(points: readonly PathPoint[], decimals = 2): string {
  if (points.length < 3) throw new RangeError("a polygon needs at least 3 points");
  const parts = points.map((p, k) => `${k === 0 ? "M" : "L"} ${roundTo(p.x, decimals)} ${roundTo(p.y, decimals)}`);
  return `${parts.join(" ")} Z`;
}

/** Bounding box of a set of points. */
export function bounds(points: readonly PathPoint[]): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  return { minX, minY, maxX, maxY };
}

/**
 * Where a horizontal line at `y` crosses the closed polygon: the leftmost and
 * rightmost crossing, or null when the line misses it.
 */
export function rowExtent(points: readonly PathPoint[], y: number): { left: number; right: number } | null {
  let left = Infinity;
  let right = -Infinity;
  for (let k = 0; k < points.length; k++) {
    const a = points[k]!;
    const b = points[(k + 1) % points.length]!;
    if ((a.y <= y && b.y >= y) || (b.y <= y && a.y >= y)) {
      const x = a.y === b.y ? Math.min(a.x, b.x) : a.x + ((y - a.y) / (b.y - a.y)) * (b.x - a.x);
      const x2 = a.y === b.y ? Math.max(a.x, b.x) : x;
      left = Math.min(left, x);
      right = Math.max(right, x2);
    }
  }
  return left === Infinity ? null : { left, right };
}

/**
 * Where a vertical line at `x` crosses the closed polygon: the top and bottom
 * crossing (Y down), or null when the line misses it.
 */
export function columnExtent(points: readonly PathPoint[], x: number): { top: number; bottom: number } | null {
  const swapped = points.map((p) => ({ x: p.y, y: p.x }));
  const row = rowExtent(swapped, x);
  return row ? { top: row.left, bottom: row.right } : null;
}
