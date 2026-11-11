/**
 * Checks and assembly for the processed garment: that it faces the way the
 * editor expects, and joining several pieces into one mesh (one draw call).
 * Plain functions, no files.
 */

export type Vec3 = [number, number, number];

/** Mean of a mesh's vertex positions. */
export function centroid(positions: ArrayLike<number>): Vec3 {
  const n = Math.floor(positions.length / 3);
  const c: Vec3 = [0, 0, 0];
  for (let v = 0; v < n; v++) for (let a = 0; a < 3; a++) c[a] = c[a]! + positions[v * 3 + a]! / n;
  return c;
}

/**
 * What is wrong with the garment's orientation, as readable sentences (empty
 * when nothing is). The editor's convention (camera.ts, the demo's views):
 * Y up, the wearer facing +Z, the wearer's left at +X. A model in another
 * orientation, after its node transforms, would show its back first.
 */
export function orientationProblems(parts: { front: Vec3; back: Vec3; left?: Vec3; right?: Vec3 }, size: Vec3): string[] {
  const problems: string[] = [];
  if (!(size[1] > size[2])) problems.push(`the garment is deeper (${size[2].toFixed(3)}) than it is tall (${size[1].toFixed(3)}): Y is not up`);
  if (!(parts.front[2] > parts.back[2])) problems.push("the front is not in front of the back (+Z)");
  if (parts.left && parts.right && !(parts.left[0] > parts.right[0])) problems.push("the left sleeve is not on the wearer's left (+X)");
  return problems;
}

export interface MeshPart {
  positions: Float32Array;
  normals: Float32Array;
  uvs: Float32Array;
  /** Two values per vertex (outside, inside), normalised 16-bit. */
  occlusion: Uint16Array;
  indices: ArrayLike<number>;
}

/**
 * Joins parts into one mesh: attributes one after the other, indices moved by
 * the vertices before them. 16-bit indices when the vertices allow (at most
 * 65,535), else 32-bit.
 */
export function mergeParts(parts: readonly MeshPart[]): MeshPart & { indices: Uint16Array | Uint32Array } {
  if (parts.length === 0) throw new RangeError("nothing to merge");
  const vertices = parts.reduce((n, p) => n + p.positions.length / 3, 0);
  const indexCount = parts.reduce((n, p) => n + p.indices.length, 0);
  const positions = new Float32Array(vertices * 3);
  const normals = new Float32Array(vertices * 3);
  const uvs = new Float32Array(vertices * 2);
  const occlusion = new Uint16Array(vertices * 2);
  const indices = vertices <= 65535 ? new Uint16Array(indexCount) : new Uint32Array(indexCount);
  let v0 = 0;
  let i0 = 0;
  for (const p of parts) {
    const n = p.positions.length / 3;
    if (p.normals.length !== n * 3 || p.uvs.length !== n * 2 || p.occlusion.length !== n * 2) throw new RangeError("a part's attributes have different vertex counts");
    positions.set(p.positions, v0 * 3);
    normals.set(p.normals, v0 * 3);
    uvs.set(p.uvs, v0 * 2);
    occlusion.set(p.occlusion, v0 * 2);
    for (let k = 0; k < p.indices.length; k++) {
      const index = p.indices[k]!;
      if (index >= n) throw new RangeError(`a part's index ${index} is out of range`);
      indices[i0 + k] = index + v0;
    }
    v0 += n;
    i0 += p.indices.length;
  }
  return { positions, normals, uvs, occlusion, indices };
}
