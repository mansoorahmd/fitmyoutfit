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
