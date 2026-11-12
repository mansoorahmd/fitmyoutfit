/**
 * Reads a committed model (GLB) into the plain meshes `renderGarmentView`
 * takes, with the model-prep GLB reader (no Three.js): world positions and
 * normals, UVs, the baked occlusion. For tests only; the editor gets the same
 * meshes from the model Three.js loaded (react/garment-geometry.ts).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { readAccessor, readGlb, transformPoint, worldMatrices } from "../../scripts/model-prep/glb";
import type { GarmentMesh } from "../texture/garment-view";

export function loadGarmentMeshes(file: string): GarmentMesh[] {
  const glb = readGlb(new Uint8Array(readFileSync(resolve(import.meta.dirname, "../../samples/models", file))));
  const matrices = worldMatrices(glb.json);
  const out: GarmentMesh[] = [];
  for (const [nodeIndex, matrix] of matrices) {
    const node = glb.json.nodes![nodeIndex]!;
    if (node.mesh === undefined) continue;
    const mesh = glb.json.meshes![node.mesh]!;
    for (const primitive of mesh.primitives) {
      const attrs = primitive.attributes as Record<string, number>;
      const pos = readAccessor(glb, attrs.POSITION!).values;
      const positions = new Float32Array(pos.length);
      for (let k = 0; k < pos.length; k += 3) positions.set(transformPoint(matrix, pos[k]!, pos[k + 1]!, pos[k + 2]!), k);
      let normals: Float32Array | null = null;
      if (attrs.NORMAL !== undefined) {
        const nor = readAccessor(glb, attrs.NORMAL).values;
        normals = new Float32Array(nor.length);
        const linear = [...matrix.slice(0, 12), 0, 0, 0, 1];
        for (let k = 0; k < nor.length; k += 3) normals.set(transformPoint(linear, nor[k]!, nor[k + 1]!, nor[k + 2]!), k);
      }
      const uvs = Float32Array.from(readAccessor(glb, attrs.TEXCOORD_0!).values);
      const occlusion = attrs._OCCLUSION !== undefined ? Float32Array.from(readAccessor(glb, attrs._OCCLUSION).values) : null;
      const indices = primitive.indices !== undefined ? Uint32Array.from(readAccessor(glb, primitive.indices).values) : null;
      out.push({ positions, uvs, normals, occlusion, indices });
    }
  }
  return out;
}
