/**
 * G3: the plain functions behind the body model (scripts/process-body-model.ts): which parts of the avatar to keep,
 * the vertices a primitive uses (the avatar's materials share one vertex buffer), and the UVs' storage.
 */

export interface BodyRecord {
  source: { title: string; author: string; url: string; licence: string; bytes: number; sha256: string };
  output: { model: string; modelUrl: string; copyright: string; generator: string };
  /** Materials dropped (small things a phone cannot see). */
  dropMaterials: string[];
  /** Materials drawn with an alpha cut-out instead of blending (they then sort with the cloth). */
  cutoutMaterials: string[];
  /** Per material: its roughness (the avatar's own metal and roughness maps are dropped). */
  roughness: Record<string, number>;
  /**
   * G4: the avatar's briefs are part of its body texture and read as underwear below a jersey's hem. The triangles of
   * `material` with their middle between `minY` and `maxY` (the avatar's metres, up from the floor) and every corner
   * within `maxAbsX` of the middle line become plain shorts of `colour` (sRGB hex) and `roughness`.
   */
  shorts?: { material: string; colour: string; roughness: number; minY: number; maxY: number; maxAbsX: number };
}

/** The materials the body keeps, in file order. */
export function keptMaterials(names: readonly string[], drop: readonly string[]): string[] {
  return names.filter((n) => !drop.includes(n));
}

export interface CompactPrimitive {
  positions: Float64Array;
  normals: Float64Array;
  uvs: Float64Array;
  indices: Uint32Array;
}

/** The vertex data of one primitive, only the vertices its triangles use, in the order they first appear. */
export function compactPrimitive(
  positions: ArrayLike<number>,
  normals: ArrayLike<number>,
  uvs: ArrayLike<number>,
  indices: ArrayLike<number>,
): CompactPrimitive {
  const remap = new Map<number, number>();
  const order: number[] = [];
  const out = new Uint32Array(indices.length);
  for (let k = 0; k < indices.length; k++) {
    const v = indices[k]!;
    let n = remap.get(v);
    if (n === undefined) {
      n = order.length;
      remap.set(v, n);
      order.push(v);
    }
    out[k] = n;
  }
  const p = new Float64Array(order.length * 3);
  const nr = new Float64Array(order.length * 3);
  const t = new Float64Array(order.length * 2);
  order.forEach((v, i) => {
    for (let a = 0; a < 3; a++) {
      p[i * 3 + a] = positions[v * 3 + a]!;
      nr[i * 3 + a] = normals[v * 3 + a]!;
    }
    t[i * 2] = uvs[v * 2]!;
    t[i * 2 + 1] = uvs[v * 2 + 1]!;
  });
  return { positions: p, normals: nr, uvs: t, indices: out };
}

/** UVs as normalised 16-bit integers when they all lie in 0 to 1, else as floats. */
export function packUvs(uvs: ArrayLike<number>): { array: Uint16Array | Float32Array; normalized: boolean } {
  let inside = true;
  for (let k = 0; k < uvs.length; k++) if (!(uvs[k]! >= 0 && uvs[k]! <= 1)) inside = false;
  if (!inside) return { array: Float32Array.from(uvs as ArrayLike<number>), normalized: false };
  return { array: Uint16Array.from(uvs as ArrayLike<number>, (x) => Math.round(x * 65535)), normalized: true };
}

export interface MeshArrays {
  positions: number[];
  normals: number[];
  uvs: number[];
  indices: number[];
}

/**
 * Cuts every triangle that crosses the plane `y = at` in two (new corners where its edges cross the plane, position,
 * normal and UV interpolated), so a band of the surface can be taken by height with a straight edge however long the
 * original triangles are. Triangles that do not cross the plane are kept as they are; the input is not changed.
 */
export function clipAtY(positions: ArrayLike<number>, normals: ArrayLike<number>, uvs: ArrayLike<number>, indices: ArrayLike<number>, at: number): MeshArrays {
  const out: MeshArrays = { positions: Array.from(positions), normals: Array.from(normals), uvs: Array.from(uvs), indices: [] };
  const y = (v: number) => out.positions[v * 3 + 1]!;
  const between = (a: number, b: number): number => {
    const t = (at - y(a)) / (y(b) - y(a));
    const n = out.positions.length / 3;
    for (let k = 0; k < 3; k++) {
      out.positions.push(out.positions[a * 3 + k]! + t * (out.positions[b * 3 + k]! - out.positions[a * 3 + k]!));
    }
    const nx = [0, 1, 2].map((k) => out.normals[a * 3 + k]! + t * (out.normals[b * 3 + k]! - out.normals[a * 3 + k]!));
    const len = Math.hypot(nx[0]!, nx[1]!, nx[2]!) || 1;
    out.normals.push(nx[0]! / len, nx[1]! / len, nx[2]! / len);
    out.uvs.push(out.uvs[a * 2]! + t * (out.uvs[b * 2]! - out.uvs[a * 2]!), out.uvs[a * 2 + 1]! + t * (out.uvs[b * 2 + 1]! - out.uvs[a * 2 + 1]!));
    return n;
  };
  for (let k = 0; k < indices.length; k += 3) {
    const tri = [indices[k]!, indices[k + 1]!, indices[k + 2]!];
    const above = tri.filter((v) => y(v) > at);
    if (above.length === 0 || above.length === 3) {
      out.indices.push(...tri);
      continue;
    }
    // Rotate so the lone corner (the one on its own side of the plane) comes first, keeping the winding.
    const lone = above.length === 1 ? tri.findIndex((v) => y(v) > at) : tri.findIndex((v) => y(v) <= at);
    const a = tri[lone]!;
    const b = tri[(lone + 1) % 3]!;
    const c = tri[(lone + 2) % 3]!;
    const ab = between(a, b);
    const ac = between(a, c);
    out.indices.push(a, ab, ac, ab, b, c, ab, c, ac);
  }
  return out;
}
