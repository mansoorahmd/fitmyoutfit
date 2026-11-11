/**
 * Splitting a source mesh into its shells and telling them apart, from the
 * data alone. A garment export often puts many pattern pieces, both layers of
 * the cloth and the edge strips that join the layers into one mesh (a
 * Sketchfab download merges everything per material). Plain functions over
 * typed arrays, no files.
 *
 * - A **shell** is a connected part of a mesh: triangles that share a vertex,
 *   or vertices at the same place with the same UV (a mesh may split a vertex
 *   for its normals). Two pieces sewn together share places but not UVs, so
 *   they stay two shells; the two layers of the cloth share UVs but not
 *   places, so they stay two shells as well.
 * - An **edge strip** joins the two layers along the cloth's cut edges: it has
 *   3D area but (almost) no UV area. A **layer** has both.
 * - A pattern piece in the source is found by a UV point inside it: every
 *   layer whose UV triangles hold that point is a copy of the piece (outer or
 *   inner; rays decide which, see `sideHitRates` in mesh3d.ts).
 */

export interface ShellStats {
  /** The shell's triangles, as indices into the mesh's triangle list, in mesh order. */
  triangles: number[];
  /** Sum of the triangles' UV areas, unsigned (UV units squared). */
  uvArea: number;
  /** Sum of the triangles' signed UV areas (positive: counter-clockwise with V up, clockwise with V down as glTF draws it). */
  uvSignedArea: number;
  /** Sum of the triangles' 3D areas (position units squared). */
  area: number;
  /** UV bounding box. */
  uvBox: { minU: number; minV: number; maxU: number; maxV: number };
}

/** Union-find with path halving. */
function makeSets(count: number) {
  const parent = new Int32Array(count);
  for (let k = 0; k < count; k++) parent[k] = k;
  const find = (k: number): number => {
    while (parent[k] !== k) {
      parent[k] = parent[parent[k]!]!;
      k = parent[k]!;
    }
    return k;
  };
  const union = (a: number, b: number) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[Math.max(ra, rb)] = Math.min(ra, rb);
  };
  return { find, union };
}

/** Signed UV area of triangle t (shoelace / 2). */
export function uvTriangleArea(uvs: ArrayLike<number>, indices: ArrayLike<number>, t: number): number {
  const a = indices[t * 3]!;
  const b = indices[t * 3 + 1]!;
  const c = indices[t * 3 + 2]!;
  return ((uvs[b * 2]! - uvs[a * 2]!) * (uvs[c * 2 + 1]! - uvs[a * 2 + 1]!) - (uvs[b * 2 + 1]! - uvs[a * 2 + 1]!) * (uvs[c * 2]! - uvs[a * 2]!)) / 2;
}

/** 3D area of triangle t. */
export function triangleArea(positions: ArrayLike<number>, indices: ArrayLike<number>, t: number): number {
  const p = (k: number, axis: number) => positions[indices[t * 3 + k]! * 3 + axis]!;
  const e1 = [p(1, 0) - p(0, 0), p(1, 1) - p(0, 1), p(1, 2) - p(0, 2)];
  const e2 = [p(2, 0) - p(0, 0), p(2, 1) - p(0, 1), p(2, 2) - p(0, 2)];
  return Math.hypot(e1[1]! * e2[2]! - e1[2]! * e2[1]!, e1[2]! * e2[0]! - e1[0]! * e2[2]!, e1[0]! * e2[1]! - e1[1]! * e2[0]!) / 2;
}

/**
 * The shells of a mesh, ordered by their first triangle, with their areas.
 * `positions` x, y, z per vertex; `uvs` u, v per vertex.
 */
export function splitShells(positions: ArrayLike<number>, uvs: ArrayLike<number>, indices: ArrayLike<number>): ShellStats[] {
  const vertices = Math.floor(positions.length / 3);
  if (uvs.length !== vertices * 2) throw new RangeError("positions and UVs describe different numbers of vertices");
  if (indices.length % 3 !== 0) throw new RangeError(`index count ${indices.length} is not a multiple of 3`);
  const sets = makeSets(vertices);
  const same = new Map<string, number>();
  for (let v = 0; v < vertices; v++) {
    const key = `${positions[v * 3]},${positions[v * 3 + 1]},${positions[v * 3 + 2]},${uvs[v * 2]},${uvs[v * 2 + 1]}`;
    const first = same.get(key);
    if (first === undefined) same.set(key, v);
    else sets.union(v, first);
  }
  const triangles = indices.length / 3;
  for (let t = 0; t < triangles; t++) {
    const a = indices[t * 3]!;
    if (a >= vertices || indices[t * 3 + 1]! >= vertices || indices[t * 3 + 2]! >= vertices) throw new RangeError(`triangle ${t} has an index out of range`);
    sets.union(a, indices[t * 3 + 1]!);
    sets.union(a, indices[t * 3 + 2]!);
  }
  const byRoot = new Map<number, ShellStats>();
  const shells: ShellStats[] = [];
  for (let t = 0; t < triangles; t++) {
    const root = sets.find(indices[t * 3]!);
    let shell = byRoot.get(root);
    if (!shell) {
      shell = { triangles: [], uvArea: 0, uvSignedArea: 0, area: 0, uvBox: { minU: Infinity, minV: Infinity, maxU: -Infinity, maxV: -Infinity } };
      byRoot.set(root, shell);
      shells.push(shell);
    }
    shell.triangles.push(t);
    const s = uvTriangleArea(uvs, indices, t);
    shell.uvArea += Math.abs(s);
    shell.uvSignedArea += s;
    shell.area += triangleArea(positions, indices, t);
    for (let k = 0; k < 3; k++) {
      const v = indices[t * 3 + k]!;
      const box = shell.uvBox;
      box.minU = Math.min(box.minU, uvs[v * 2]!);
      box.maxU = Math.max(box.maxU, uvs[v * 2]!);
      box.minV = Math.min(box.minV, uvs[v * 2 + 1]!);
      box.maxV = Math.max(box.maxV, uvs[v * 2 + 1]!);
    }
  }
  return shells;
}

/**
 * True for an edge strip: a shell whose flat (UV) area is less than
 * `maxShare` of its 3D area, with UV units converted to position units by
 * `positionUnitsPerUv` (a first estimate is enough: a layer's share is near 1,
 * a strip's near 0).
 */
export function isEdgeStrip(shell: Pick<ShellStats, "uvArea" | "area">, positionUnitsPerUv: number, maxShare = 0.05): boolean {
  if (!(shell.area > 0)) return true;
  return (shell.uvArea * positionUnitsPerUv * positionUnitsPerUv) / shell.area < maxShare;
}

/** True when the UV point lies inside (or on the edge of) one of the shell's UV triangles. Degenerate triangles never hold a point. */
export function shellHoldsUv(shell: Pick<ShellStats, "triangles" | "uvBox">, uvs: ArrayLike<number>, indices: ArrayLike<number>, u: number, v: number): boolean {
  const box = shell.uvBox;
  if (u < box.minU || u > box.maxU || v < box.minV || v > box.maxV) return false;
  for (const t of shell.triangles) {
    const a = indices[t * 3]!;
    const b = indices[t * 3 + 1]!;
    const c = indices[t * 3 + 2]!;
    const [ax, ay, bx, by, cx, cy] = [uvs[a * 2]!, uvs[a * 2 + 1]!, uvs[b * 2]!, uvs[b * 2 + 1]!, uvs[c * 2]!, uvs[c * 2 + 1]!];
    const det = (bx - ax) * (cy - ay) - (cx - ax) * (by - ay);
    if (Math.abs(det) < 1e-18) continue;
    const l1 = ((u - ax) * (cy - ay) - (cx - ax) * (v - ay)) / det;
    const l2 = ((bx - ax) * (v - ay) - (u - ax) * (by - ay)) / det;
    if (l1 >= 0 && l2 >= 0 && l1 + l2 <= 1) return true;
  }
  return false;
}

/** True when two UV boxes overlap (share more than an edge). */
export function uvBoxesOverlap(a: ShellStats["uvBox"], b: ShellStats["uvBox"]): boolean {
  return a.minU < b.maxU && b.minU < a.maxU && a.minV < b.maxV && b.minV < a.maxV;
}
