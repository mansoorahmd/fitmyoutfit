/**
 * The garment's meshes as plain arrays (world positions and normals, UVs,
 * baked occlusion, indices) from a loaded model, for `renderGarmentView`
 * (template cards). Only the meshes that carry the product's pattern pieces.
 */
import { Matrix3, Vector3, type BufferAttribute, type InterleavedBufferAttribute, type Mesh, type Object3D } from "three";
import type { ProductDefinition } from "../design/schema.js";
import type { GarmentMesh } from "../texture/garment-view.js";
import { OCCLUSION_ATTRIBUTE_GLTF } from "./fabric.js";

type Attribute = BufferAttribute | InterleavedBufferAttribute;

function fileName(object: Object3D): string {
  const original = (object.userData as { name?: unknown }).name;
  return typeof original === "string" ? original : object.name;
}

/** Whether a mesh (or a group above it) carries one of the product's pieces. */
function carriesPiece(mesh: Object3D, names: Set<string>): boolean {
  for (let owner: Object3D | null = mesh; owner; owner = owner.parent) if (names.has(fileName(owner))) return true;
  return false;
}

export function extractGarmentMeshes(scene: Object3D, product: ProductDefinition): GarmentMesh[] {
  const names = new Set(product.pieces.map((p) => p.mesh));
  scene.updateMatrixWorld(true);
  const out: GarmentMesh[] = [];
  const v = new Vector3();
  const normalMatrix = new Matrix3();
  scene.traverse((object) => {
    const mesh = object as Mesh;
    if (!mesh.isMesh || !carriesPiece(mesh, names)) return;
    const geometry = mesh.geometry;
    const position = geometry.getAttribute("position") as Attribute | undefined;
    const uv = geometry.getAttribute("uv") as Attribute | undefined;
    if (!position || !uv) return;
    const count = position.count;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      v.fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld);
      positions[i * 3] = v.x;
      positions[i * 3 + 1] = v.y;
      positions[i * 3 + 2] = v.z;
    }
    const uvs = new Float32Array(count * 2);
    for (let i = 0; i < count; i++) {
      uvs[i * 2] = uv.getX(i);
      uvs[i * 2 + 1] = uv.getY(i);
    }
    const normal = geometry.getAttribute("normal") as Attribute | undefined;
    let normals: Float32Array | null = null;
    if (normal) {
      normalMatrix.getNormalMatrix(mesh.matrixWorld);
      normals = new Float32Array(count * 3);
      for (let i = 0; i < count; i++) {
        v.fromBufferAttribute(normal, i).applyMatrix3(normalMatrix).normalize();
        normals[i * 3] = v.x;
        normals[i * 3 + 1] = v.y;
        normals[i * 3 + 2] = v.z;
      }
    }
    const occ = geometry.getAttribute(OCCLUSION_ATTRIBUTE_GLTF) as Attribute | undefined;
    let occlusion: Float32Array | null = null;
    if (occ && occ.itemSize >= 2) {
      occlusion = new Float32Array(count * 2);
      for (let i = 0; i < count; i++) {
        occlusion[i * 2] = occ.getX(i);
        occlusion[i * 2 + 1] = occ.getY(i);
      }
    }
    const index = geometry.getIndex();
    const indices = index ? Uint32Array.from({ length: index.count }, (_, k) => index.getX(k)) : null;
    out.push({ positions, uvs, normals, occlusion, indices });
  });
  return out;
}
