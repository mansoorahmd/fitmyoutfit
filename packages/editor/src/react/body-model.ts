/**
 * G3: the body under the garment, as a scene object kept apart from the garment. Plain Three.js, no GPU.
 * `makeBody` clones a loaded model so one cached file can serve several canvases, gives each mesh its own
 * materials, and makes every mesh answer no ray: nothing in the editor (tapping a part, hovering, dragging an item)
 * can ever pick the body. `disposeBody` frees the clones.
 */
import type { Material, Mesh, Object3D } from "three";

/** Marks a mesh as part of the body (userData), so a test or a tool can tell it from the garment. */
export const BODY_FLAG = "fmoBody";

export function makeBody(source: Object3D): Object3D {
  const body = source.clone(true);
  body.traverse((object) => {
    const mesh = object as Mesh;
    if (!mesh.isMesh) return;
    mesh.raycast = () => undefined;
    mesh.userData[BODY_FLAG] = true;
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map((m) => m.clone()) : mesh.material.clone();
  });
  return body;
}

export function disposeBody(body: Object3D): void {
  body.traverse((object) => {
    const mesh = object as Mesh;
    if (!mesh.isMesh) return;
    for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) (m as Material).dispose();
  });
}
