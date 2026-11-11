/**
 * 3D helpers for preparing a garment model: vertex normals smoothed across
 * the seams between pieces, a ray caster over the garment's triangles, which
 * surface of a two-sided cloth export faces outwards, and baked ambient
 * occlusion. Plain functions over typed arrays, no Three.js, no files.
 *
 * Conventions: positions in metres, triangles counter-clockwise seen from the
 * side their normal points to (glTF).
 */

export type Vec3 = [number, number, number];

/** One triangle mesh: positions (x, y, z per vertex) and triangle indices. */
export interface MeshData {
  positions: Float32Array | Float64Array;
  indices: Uint16Array | Uint32Array | number[];
}

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const at = (array: ArrayLike<number>, i: number): Vec3 => [array[i * 3]!, array[i * 3 + 1]!, array[i * 3 + 2]!];
export const normalize = (a: Vec3): Vec3 => {
  const l = Math.hypot(a[0], a[1], a[2]);
  return l === 0 ? [0, 0, 0] : [a[0] / l, a[1] / l, a[2] / l];
};

/** A triangle's normal by its winding, with length twice its area. */
export function faceNormal(mesh: MeshData, t: number): Vec3 {
  const a = at(mesh.positions, mesh.indices[t * 3]!);
  const b = at(mesh.positions, mesh.indices[t * 3 + 1]!);
  const c = at(mesh.positions, mesh.indices[t * 3 + 2]!);
  return cross(sub(b, a), sub(c, a));
}

/** Area-weighted vertex normals of one mesh, unit length (zero for a vertex no triangle uses). */
export function vertexNormals(mesh: MeshData): Float32Array {
  const out = new Float64Array(mesh.positions.length);
  const triangles = mesh.indices.length / 3;
  for (let t = 0; t < triangles; t++) {
    const n = faceNormal(mesh, t);
    for (let k = 0; k < 3; k++) {
      const v = mesh.indices[t * 3 + k]!;
      out[v * 3]! += n[0];
      out[v * 3 + 1]! += n[1];
      out[v * 3 + 2]! += n[2];
    }
  }
  const result = new Float32Array(out.length);
  for (let v = 0; v < out.length / 3; v++) {
    const n = normalize(at(out, v));
    result.set(n, v * 3);
  }
  return result;
}

/**
 * Vertex normals for several meshes that meet at seams (the pieces of a
 * garment): each mesh's own smooth normals, then, for vertices of any mesh
 * that lie within `weldDistance` of each other, the average of the normals
 * that are within `maxAngleDeg` of each other. So the light runs on across a
 * seam where the cloth is smooth and a real fold keeps its crease.
 */
export function seamSmoothNormals(meshes: readonly MeshData[], weldDistance: number, maxAngleDeg = 60): Float32Array[] {
  const own = meshes.map((m) => vertexNormals(m));
  const cell = weldDistance;
  const grid = new Map<string, Array<[number, number]>>();
  const keyOf = (p: Vec3) => `${Math.floor(p[0] / cell)},${Math.floor(p[1] / cell)},${Math.floor(p[2] / cell)}`;
  meshes.forEach((m, mi) => {
    for (let v = 0; v < m.positions.length / 3; v++) {
      const k = keyOf(at(m.positions, v));
      const list = grid.get(k);
      if (list) list.push([mi, v]);
      else grid.set(k, [[mi, v]]);
    }
  });
  const cosLimit = Math.cos((maxAngleDeg * Math.PI) / 180);
  return meshes.map((m, mi) => {
    const result = new Float32Array(own[mi]!.length);
    for (let v = 0; v < m.positions.length / 3; v++) {
      const p = at(m.positions, v);
      const mine = at(own[mi]!, v);
      const sum: Vec3 = [0, 0, 0];
      const c = [Math.floor(p[0] / cell), Math.floor(p[1] / cell), Math.floor(p[2] / cell)];
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          for (let dz = -1; dz <= 1; dz++) {
            for (const [oj, ov] of grid.get(`${c[0]! + dx},${c[1]! + dy},${c[2]! + dz}`) ?? []) {
              const q = at(meshes[oj]!.positions, ov);
              if (Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]) > weldDistance) continue;
              const n = at(own[oj]!, ov);
              if (dot(n, mine) < cosLimit) continue;
              sum[0] += n[0];
              sum[1] += n[1];
              sum[2] += n[2];
            }
          }
        }
      }
      result.set(normalize(sum), v * 3);
    }
    return result;
  });
}

/**
 * Closes the seams between pieces: boundary vertices (of any mesh, including
 * two edges of the same mesh, as on a sleeve's underarm seam) that lie within
 * `tolerance` of each other are moved to their common centre. A cloth export
 * sews pieces with matching vertices a fraction of a millimetre apart; left
 * open, those gaps show as a dotted line along every seam.
 *
 * `boundaries[k]` lists the boundary vertices of `meshes[k]`. Changes the
 * positions in place. Returns the number of welded groups and the largest
 * distance a vertex moved, in the positions' unit.
 */
export function weldSeams(meshes: readonly MeshData[], boundaries: readonly number[][], tolerance: number): { groups: number; maxMove: number } {
  const items: Array<{ mesh: number; vertex: number; p: Vec3 }> = [];
  boundaries.forEach((list, mesh) => {
    for (const vertex of list) items.push({ mesh, vertex, p: at(meshes[mesh]!.positions, vertex) });
  });
  // Union-find over pairs closer than the tolerance (a grid keeps it near linear).
  const parent = items.map((_, k) => k);
  const find = (k: number): number => {
    while (parent[k] !== k) {
      parent[k] = parent[parent[k]!]!;
      k = parent[k]!;
    }
    return k;
  };
  const cell = (p: Vec3) => [Math.floor(p[0] / tolerance), Math.floor(p[1] / tolerance), Math.floor(p[2] / tolerance)];
  const grid = new Map<string, number[]>();
  items.forEach((item, k) => {
    const key = cell(item.p).join(",");
    const list = grid.get(key);
    if (list) list.push(k);
    else grid.set(key, [k]);
  });
  items.forEach((item, k) => {
    const c = cell(item.p);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dz = -1; dz <= 1; dz++) {
          for (const j of grid.get(`${c[0]! + dx},${c[1]! + dy},${c[2]! + dz}`) ?? []) {
            if (j <= k) continue;
            const q = items[j]!.p;
            if (Math.hypot(q[0] - item.p[0], q[1] - item.p[1], q[2] - item.p[2]) <= tolerance) parent[find(j)] = find(k);
          }
        }
      }
    }
  });
  const groups = new Map<number, number[]>();
  items.forEach((_, k) => {
    const r = find(k);
    const list = groups.get(r);
    if (list) list.push(k);
    else groups.set(r, [k]);
  });
  let welded = 0;
  let maxMove = 0;
  for (const members of groups.values()) {
    if (members.length < 2) continue;
    welded++;
    const centre: Vec3 = [0, 0, 0];
    for (const k of members) for (let a = 0; a < 3; a++) centre[a] = centre[a]! + items[k]!.p[a]! / members.length;
    for (const k of members) {
      const { mesh, vertex, p } = items[k]!;
      maxMove = Math.max(maxMove, Math.hypot(p[0] - centre[0], p[1] - centre[1], p[2] - centre[2]));
      for (let a = 0; a < 3; a++) meshes[mesh]!.positions[vertex * 3 + a] = centre[a]!;
    }
  }
  return { groups: welded, maxMove };
}

/**
 * Smooths a value per vertex over the mesh: each pass moves every value half
 * way towards the mean of its neighbours (vertices that share a triangle).
 * Used to take the sampling noise out of baked occlusion. Returns a new array.
 */
export function smoothOverMesh(indices: ArrayLike<number>, values: Float32Array, passes: number): Float32Array {
  const count = values.length;
  const neighbours: Array<Set<number>> = Array.from({ length: count }, () => new Set<number>());
  for (let t = 0; t < indices.length; t += 3) {
    const a = indices[t]!;
    const b = indices[t + 1]!;
    const c = indices[t + 2]!;
    neighbours[a]!.add(b).add(c);
    neighbours[b]!.add(a).add(c);
    neighbours[c]!.add(a).add(b);
  }
  let current = Float32Array.from(values);
  for (let pass = 0; pass < passes; pass++) {
    const next = new Float32Array(count);
    for (let v = 0; v < count; v++) {
      const ns = neighbours[v]!;
      if (ns.size === 0) {
        next[v] = current[v]!;
        continue;
      }
      let sum = 0;
      for (const n of ns) sum += current[n]!;
      next[v] = 0.5 * current[v]! + 0.5 * (sum / ns.size);
    }
    current = next;
  }
  return current;
}

/**
 * Gives vertices of different meshes at exactly the same place (welded seams)
 * the mean of their values, so a baked value does not jump at a seam.
 * Changes `values` in place.
 */
export function shareAcrossSeams(meshes: readonly MeshData[], values: readonly Float32Array[]): void {
  const groups = new Map<string, Array<[number, number]>>();
  meshes.forEach((m, mi) => {
    for (let v = 0; v < m.positions.length / 3; v++) {
      const key = `${m.positions[v * 3]},${m.positions[v * 3 + 1]},${m.positions[v * 3 + 2]}`;
      const list = groups.get(key);
      if (list) list.push([mi, v]);
      else groups.set(key, [[mi, v]]);
    }
  });
  for (const members of groups.values()) {
    if (members.length < 2) continue;
    let sum = 0;
    for (const [mi, v] of members) sum += values[mi]![v]!;
    for (const [mi, v] of members) values[mi]![v] = sum / members.length;
  }
}

/** A small seeded random generator (mulberry32), so baked results are reproducible. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** `count` cosine-weighted directions on the hemisphere about +Z (unit vectors). */
export function cosineHemisphere(count: number, random: () => number): Vec3[] {
  const out: Vec3[] = [];
  for (let k = 0; k < count; k++) {
    // Stratified in the first coordinate for less noise.
    const u = (k + random()) / count;
    const phi = 2 * Math.PI * random();
    const r = Math.sqrt(u);
    out.push([r * Math.cos(phi), r * Math.sin(phi), Math.sqrt(Math.max(0, 1 - u))]);
  }
  return out;
}

/** A direction given about +Z, turned so that +Z becomes `normal`. */
export function alignToNormal(d: Vec3, normal: Vec3): Vec3 {
  const n = normalize(normal);
  const helper: Vec3 = Math.abs(n[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  const t = normalize(cross(helper, n));
  const b = cross(n, t);
  return [t[0] * d[0] + b[0] * d[1] + n[0] * d[2], t[1] * d[0] + b[1] * d[1] + n[1] * d[2], t[2] * d[0] + b[2] * d[1] + n[2] * d[2]];
}

/**
 * Ray casting against many triangles through a uniform grid: each cell lists
 * the triangles whose bounding box touches it; a ray walks the cells in order
 * (Amanatides and Woo) and tests only their triangles.
 */
export class TriangleGrid {
  private readonly tri: Float64Array; // 9 numbers per triangle
  private readonly min: Vec3;
  private readonly cellSize: number;
  private readonly dims: [number, number, number];
  private readonly cells: Map<number, number[]>;
  /** Triangle ids, in the order of the meshes given: mesh index and triangle index within it. */
  readonly owner: Array<[number, number]>;

  constructor(meshes: readonly MeshData[], cellSize: number) {
    const count = meshes.reduce((n, m) => n + m.indices.length / 3, 0);
    this.tri = new Float64Array(count * 9);
    this.owner = [];
    const min: Vec3 = [Infinity, Infinity, Infinity];
    const max: Vec3 = [-Infinity, -Infinity, -Infinity];
    let k = 0;
    meshes.forEach((m, mi) => {
      for (let t = 0; t < m.indices.length / 3; t++, k++) {
        for (let c = 0; c < 3; c++) {
          const p = at(m.positions, m.indices[t * 3 + c]!);
          for (let a = 0; a < 3; a++) {
            this.tri[k * 9 + c * 3 + a] = p[a]!;
            min[a] = Math.min(min[a]!, p[a]!);
            max[a] = Math.max(max[a]!, p[a]!);
          }
        }
        this.owner.push([mi, t]);
      }
    });
    this.cellSize = cellSize;
    this.min = [min[0] - cellSize * 0.01, min[1] - cellSize * 0.01, min[2] - cellSize * 0.01];
    this.dims = [0, 1, 2].map((a) => Math.max(1, Math.ceil((max[a]! - this.min[a]!) / cellSize) + 1)) as [number, number, number];
    this.cells = new Map();
    for (let t = 0; t < count; t++) {
      const lo = [0, 1, 2].map((a) => Math.min(this.tri[t * 9 + a]!, this.tri[t * 9 + 3 + a]!, this.tri[t * 9 + 6 + a]!));
      const hi = [0, 1, 2].map((a) => Math.max(this.tri[t * 9 + a]!, this.tri[t * 9 + 3 + a]!, this.tri[t * 9 + 6 + a]!));
      const c0 = lo.map((v, a) => this.cellIndex(v, a));
      const c1 = hi.map((v, a) => this.cellIndex(v, a));
      for (let x = c0[0]!; x <= c1[0]!; x++) {
        for (let y = c0[1]!; y <= c1[1]!; y++) {
          for (let z = c0[2]!; z <= c1[2]!; z++) {
            const key = (z * this.dims[1] + y) * this.dims[0] + x;
            const list = this.cells.get(key);
            if (list) list.push(t);
            else this.cells.set(key, [t]);
          }
        }
      }
    }
  }

  private cellIndex(value: number, axis: number): number {
    return Math.min(this.dims[axis]! - 1, Math.max(0, Math.floor((value - this.min[axis]!) / this.cellSize)));
  }

  /** Distance along the ray to triangle t, or Infinity (Moller-Trumbore, both sides count). */
  private hitTriangle(t: number, o: Vec3, d: Vec3): number {
    const T = this.tri;
    const b = t * 9;
    const e1: Vec3 = [T[b + 3]! - T[b]!, T[b + 4]! - T[b + 1]!, T[b + 5]! - T[b + 2]!];
    const e2: Vec3 = [T[b + 6]! - T[b]!, T[b + 7]! - T[b + 1]!, T[b + 8]! - T[b + 2]!];
    const p = cross(d, e2);
    const det = dot(e1, p);
    if (Math.abs(det) < 1e-14) return Infinity;
    const inv = 1 / det;
    const s: Vec3 = [o[0] - T[b]!, o[1] - T[b + 1]!, o[2] - T[b + 2]!];
    const u = dot(s, p) * inv;
    if (u < 0 || u > 1) return Infinity;
    const q = cross(s, e1);
    const v = dot(d, q) * inv;
    if (v < 0 || u + v > 1) return Infinity;
    return dot(e2, q) * inv;
  }

  /**
   * The nearest hit along the ray between `tMin` and `tMax` (metres): its
   * distance and triangle id, or null. `skip` ignores triangles (the ray's own).
   */
  cast(origin: Vec3, direction: Vec3, tMin: number, tMax: number, skip?: (triangle: number) => boolean): { t: number; triangle: number } | null {
    const d = normalize(direction);
    // Start where the ray enters the grid's box.
    let tEnter = tMin;
    let tExit = tMax;
    for (let a = 0; a < 3; a++) {
      const lo = this.min[a]!;
      const hi = lo + this.dims[a]! * this.cellSize;
      if (Math.abs(d[a]!) < 1e-15) {
        if (origin[a]! < lo || origin[a]! > hi) return null;
      } else {
        let t0 = (lo - origin[a]!) / d[a]!;
        let t1 = (hi - origin[a]!) / d[a]!;
        if (t0 > t1) [t0, t1] = [t1, t0];
        tEnter = Math.max(tEnter, t0);
        tExit = Math.min(tExit, t1);
      }
    }
    if (tEnter > tExit) return null;
    const start: Vec3 = [origin[0] + d[0] * tEnter, origin[1] + d[1] * tEnter, origin[2] + d[2] * tEnter];
    const cell = [0, 1, 2].map((a) => this.cellIndex(start[a]!, a));
    const step = [0, 1, 2].map((a) => (d[a]! > 0 ? 1 : d[a]! < 0 ? -1 : 0));
    const tMaxAxis = [0, 1, 2].map((a) => {
      if (step[a] === 0) return Infinity;
      const boundary = this.min[a]! + (cell[a]! + (step[a]! > 0 ? 1 : 0)) * this.cellSize;
      return tEnter + (boundary - start[a]!) / d[a]!;
    });
    const tDelta = [0, 1, 2].map((a) => (step[a] === 0 ? Infinity : this.cellSize / Math.abs(d[a]!)));
    let best = Infinity;
    let bestTri = -1;
    const tested = new Set<number>();
    for (;;) {
      const key = (cell[2]! * this.dims[1] + cell[1]!) * this.dims[0] + cell[0]!;
      for (const t of this.cells.get(key) ?? []) {
        if (tested.has(t)) continue;
        tested.add(t);
        if (skip?.(t)) continue;
        const h = this.hitTriangle(t, origin, d);
        if (h >= tMin && h <= tMax && h < best) {
          best = h;
          bestTri = t;
        }
      }
      const a = tMaxAxis[0]! < tMaxAxis[1]! ? (tMaxAxis[0]! < tMaxAxis[2]! ? 0 : 2) : tMaxAxis[1]! < tMaxAxis[2]! ? 1 : 2;
      // A hit nearer than the next cell boundary cannot be beaten by a later cell.
      if (best <= tMaxAxis[a]!) break;
      if (tMaxAxis[a]! > tExit) break;
      cell[a]! += step[a]!;
      if (cell[a]! < 0 || cell[a]! >= this.dims[a]!) break;
      tMaxAxis[a]! += tDelta[a]!;
    }
    return bestTri === -1 ? null : { t: best, triangle: bestTri };
  }
}

/**
 * How often rays leaving a surface hit other cloth, for each side of it: rays
 * from triangle centres (area-weighted sample of `samples` triangles), along
 * the winding normal (`front`) and against it (`back`), within `maxDistance`.
 *
 * On a two-layer cloth export the outer surface's outward side sees open space
 * (a low rate) and its other side meets the inner layer a fabric thickness
 * away (a rate near 1); the inner surface's inward side meets the garment's
 * opposite wall. So the surface and side with the lowest rate is the outside.
 */
export function sideHitRates(
  grid: TriangleGrid,
  meshIndex: number,
  mesh: MeshData,
  options: { samples: number; maxDistance: number; offset: number; seed: number },
): { front: number; back: number } {
  const random = seededRandom(options.seed);
  const triangles = mesh.indices.length / 3;
  const areas = new Float64Array(triangles);
  let total = 0;
  for (let t = 0; t < triangles; t++) {
    const n = faceNormal(mesh, t);
    areas[t] = Math.hypot(n[0], n[1], n[2]);
    total += areas[t]!;
  }
  let front = 0;
  let back = 0;
  for (let s = 0; s < options.samples; s++) {
    // Area-weighted pick.
    let r = random() * total;
    let t = 0;
    while (t < triangles - 1 && r > areas[t]!) r -= areas[t++]!;
    const n = normalize(faceNormal(mesh, t));
    const centre: Vec3 = [0, 0, 0];
    for (let c = 0; c < 3; c++) {
      const p = at(mesh.positions, mesh.indices[t * 3 + c]!);
      centre[0] += p[0] / 3;
      centre[1] += p[1] / 3;
      centre[2] += p[2] / 3;
    }
    const self = (tri: number) => grid.owner[tri]![0] === meshIndex && grid.owner[tri]![1] === t;
    for (const sign of [1, -1] as const) {
      const d: Vec3 = [n[0] * sign, n[1] * sign, n[2] * sign];
      const o: Vec3 = [centre[0] + d[0] * options.offset, centre[1] + d[1] * options.offset, centre[2] + d[2] * options.offset];
      if (grid.cast(o, d, 0, options.maxDistance, self)) {
        if (sign === 1) front++;
        else back++;
      }
    }
  }
  return { front: front / options.samples, back: back / options.samples };
}

/**
 * Ambient occlusion per vertex, for both sides of a single-layer surface:
 * the share of cosine-weighted rays that escape within `maxDistance`, on the
 * side the normal points to (`outer`) and on the other side (`inner`).
 * 1 is fully open, 0 fully enclosed.
 */
export function bakeOcclusion(
  grid: TriangleGrid,
  mesh: MeshData,
  normals: Float32Array,
  options: { rays: number; maxDistance: number; offset: number; seed: number },
): { outer: Float32Array; inner: Float32Array } {
  const random = seededRandom(options.seed);
  const count = mesh.positions.length / 3;
  const outer = new Float32Array(count);
  const inner = new Float32Array(count);
  for (let v = 0; v < count; v++) {
    const p = at(mesh.positions, v);
    const n = at(normals, v);
    for (const [sign, target] of [[1, outer], [-1, inner]] as const) {
      const axis: Vec3 = [n[0] * sign, n[1] * sign, n[2] * sign];
      const o: Vec3 = [p[0] + axis[0] * options.offset, p[1] + axis[1] * options.offset, p[2] + axis[2] * options.offset];
      let open = 0;
      for (const local of cosineHemisphere(options.rays, random)) {
        const d = alignToNormal(local, axis);
        if (!grid.cast(o, d, 0, options.maxDistance)) open++;
      }
      target[v] = open / options.rays;
    }
  }
  return { outer, inner };
}
