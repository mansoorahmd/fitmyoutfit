/**
 * A bounding-volume hierarchy for picking on the model (E3c, S1): the ray from
 * the pointer to the garment, cast against a tree of boxes instead of every one
 * of the jersey's 103,000 triangles (three.js's own raycast tests them all, which
 * was the largest single cost of a drag on a slow phone). Plain typed arrays, no
 * Three.js: built once per mesh (in the mesh's own space), then a ray costs a few
 * dozen box and triangle tests. Both sides of a triangle count (the garment is
 * drawn double-sided), as with three.js's raycast on a double-sided material.
 */

export interface PickBvh {
  /** Nodes: 6 floats of bounds each (min x, y, z, max x, y, z). */
  bounds: Float32Array;
  /** Per node: for a leaf, the first triangle in `order` and the count (count > 0); for an inner node, the right child's index and 0 (the left child is the next node). */
  first: Uint32Array;
  count: Uint32Array;
  order: Uint32Array;
  positions: Float32Array;
  /** Three vertex indices per triangle. */
  triangles: Uint32Array;
  uvs: Float32Array | null;
}

export interface PickHit {
  /** Distance along the ray (in the units of the ray's direction). */
  distance: number;
  triangle: number;
  /** The UV at the hit, interpolated, or null when the mesh has none. */
  uv: { x: number; y: number } | null;
}

const LEAF = 8;

/**
 * Builds the tree. `positions`: x, y, z per vertex; `index`: three vertex indices per triangle, or null for
 * a non-indexed mesh; `uvs`: u, v per vertex, or null.
 */
export function buildPickBvh(positions: Float32Array, index: ArrayLike<number> | null, uvs: Float32Array | null): PickBvh {
  const triCount = index ? Math.floor(index.length / 3) : Math.floor(positions.length / 9);
  const triangles = new Uint32Array(triCount * 3);
  for (let k = 0; k < triCount * 3; k++) triangles[k] = index ? index[k]! : k;
  const centroid = new Float32Array(triCount * 3);
  const tmin = new Float32Array(triCount * 3);
  const tmax = new Float32Array(triCount * 3);
  for (let t = 0; t < triCount; t++) {
    for (let axis = 0; axis < 3; axis++) {
      const a = positions[triangles[3 * t]! * 3 + axis]!;
      const b = positions[triangles[3 * t + 1]! * 3 + axis]!;
      const c = positions[triangles[3 * t + 2]! * 3 + axis]!;
      tmin[3 * t + axis] = Math.min(a, b, c);
      tmax[3 * t + axis] = Math.max(a, b, c);
      centroid[3 * t + axis] = (a + b + c) / 3;
    }
  }
  const order = new Uint32Array(triCount);
  for (let t = 0; t < triCount; t++) order[t] = t;
  const maxNodes = Math.max(1, 2 * triCount + 1);
  const bounds = new Float32Array(maxNodes * 6);
  const first = new Uint32Array(maxNodes);
  const count = new Uint32Array(maxNodes);
  let nodes = 0;

  const build = (start: number, end: number): number => {
    const node = nodes++;
    let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
    let c0x = Infinity, c0y = Infinity, c0z = Infinity, c1x = -Infinity, c1y = -Infinity, c1z = -Infinity;
    for (let k = start; k < end; k++) {
      const t = order[k]! * 3;
      x0 = Math.min(x0, tmin[t]!); y0 = Math.min(y0, tmin[t + 1]!); z0 = Math.min(z0, tmin[t + 2]!);
      x1 = Math.max(x1, tmax[t]!); y1 = Math.max(y1, tmax[t + 1]!); z1 = Math.max(z1, tmax[t + 2]!);
      c0x = Math.min(c0x, centroid[t]!); c0y = Math.min(c0y, centroid[t + 1]!); c0z = Math.min(c0z, centroid[t + 2]!);
      c1x = Math.max(c1x, centroid[t]!); c1y = Math.max(c1y, centroid[t + 1]!); c1z = Math.max(c1z, centroid[t + 2]!);
    }
    bounds.set([x0, y0, z0, x1, y1, z1], node * 6);
    const n = end - start;
    if (n <= LEAF) {
      first[node] = start;
      count[node] = n;
      return node;
    }
    // Split at the middle of the centroids' longest side; an even split if that leaves one side empty.
    const ex = c1x - c0x, ey = c1y - c0y, ez = c1z - c0z;
    const axis = ex >= ey && ex >= ez ? 0 : ey >= ez ? 1 : 2;
    const mid = axis === 0 ? (c0x + c1x) / 2 : axis === 1 ? (c0y + c1y) / 2 : (c0z + c1z) / 2;
    let i = start;
    let j = end - 1;
    while (i <= j) {
      if (centroid[order[i]! * 3 + axis]! < mid) i++;
      else {
        const swap = order[i]!;
        order[i] = order[j]!;
        order[j] = swap;
        j--;
      }
    }
    let split = i;
    if (split === start || split === end) split = start + (n >> 1);
    build(start, split);
    first[node] = build(split, end);
    count[node] = 0;
    return node;
  };
  if (triCount > 0) build(0, triCount);
  return { bounds: bounds.slice(0, nodes * 6), first: first.slice(0, nodes), count: count.slice(0, nodes), order, positions, triangles, uvs };
}

/** Ray-triangle distance (Moller-Trumbore, both sides), with the barycentric weights, or null. */
function hitTriangle(bvh: PickBvh, t: number, o: readonly number[], d: readonly number[], out: { u: number; v: number }): number | null {
  const p = bvh.positions;
  const a = bvh.triangles[3 * t]! * 3, b = bvh.triangles[3 * t + 1]! * 3, c = bvh.triangles[3 * t + 2]! * 3;
  const e1x = p[b]! - p[a]!, e1y = p[b + 1]! - p[a + 1]!, e1z = p[b + 2]! - p[a + 2]!;
  const e2x = p[c]! - p[a]!, e2y = p[c + 1]! - p[a + 1]!, e2z = p[c + 2]! - p[a + 2]!;
  const px = d[1]! * e2z - d[2]! * e2y, py = d[2]! * e2x - d[0]! * e2z, pz = d[0]! * e2y - d[1]! * e2x;
  const det = e1x * px + e1y * py + e1z * pz;
  if (Math.abs(det) < 1e-14) return null;
  const inv = 1 / det;
  const tx = o[0]! - p[a]!, ty = o[1]! - p[a + 1]!, tz = o[2]! - p[a + 2]!;
  const u = (tx * px + ty * py + tz * pz) * inv;
  if (u < 0 || u > 1) return null;
  const qx = ty * e1z - tz * e1y, qy = tz * e1x - tx * e1z, qz = tx * e1y - ty * e1x;
  const v = (d[0]! * qx + d[1]! * qy + d[2]! * qz) * inv;
  if (v < 0 || u + v > 1) return null;
  const dist = (e2x * qx + e2y * qy + e2z * qz) * inv;
  if (dist < 0) return null;
  out.u = u;
  out.v = v;
  return dist;
}

/** The nearest hit of the ray (origin `o`, direction `d`, in the mesh's own space), or null. */
export function pickBvh(bvh: PickBvh, o: readonly number[], d: readonly number[]): PickHit | null {
  if (bvh.first.length === 0) return null;
  const inv = [1 / d[0]!, 1 / d[1]!, 1 / d[2]!];
  let best = Infinity;
  let bestTri = -1;
  let bestU = 0, bestV = 0;
  const bary = { u: 0, v: 0 };
  const stack: number[] = [0];
  const b = bvh.bounds;
  while (stack.length > 0) {
    const node = stack.pop()!;
    // Slab test.
    let near = 0;
    let far = best;
    for (let axis = 0; axis < 3; axis++) {
      let t0 = (b[node * 6 + axis]! - o[axis]!) * inv[axis]!;
      let t1 = (b[node * 6 + 3 + axis]! - o[axis]!) * inv[axis]!;
      if (t0 > t1) {
        const swap = t0;
        t0 = t1;
        t1 = swap;
      }
      if (t0 > near) near = t0;
      if (t1 < far) far = t1;
      if (near > far) break;
    }
    if (near > far) continue;
    const n = bvh.count[node]!;
    if (n > 0) {
      const start = bvh.first[node]!;
      for (let k = start; k < start + n; k++) {
        const t = bvh.order[k]!;
        const dist = hitTriangle(bvh, t, o, d, bary);
        if (dist !== null && dist < best) {
          best = dist;
          bestTri = t;
          bestU = bary.u;
          bestV = bary.v;
        }
      }
    } else {
      stack.push(bvh.first[node]!, node + 1);
    }
  }
  if (bestTri < 0) return null;
  let uv: PickHit["uv"] = null;
  if (bvh.uvs) {
    const w = 1 - bestU - bestV;
    const [ia, ib, ic] = [bvh.triangles[3 * bestTri]!, bvh.triangles[3 * bestTri + 1]!, bvh.triangles[3 * bestTri + 2]!];
    const q = bvh.uvs;
    uv = { x: w * q[2 * ia]! + bestU * q[2 * ib]! + bestV * q[2 * ic]!, y: w * q[2 * ia + 1]! + bestU * q[2 * ib + 1]! + bestV * q[2 * ic + 1]! };
  }
  return { distance: best, triangle: bestTri, uv };
}
