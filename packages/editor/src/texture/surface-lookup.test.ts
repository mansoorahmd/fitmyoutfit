/**
 * The UV-to-surface lookup (N9) on both stand-in models: a point on a piece
 * finds its place on the cloth, an item's corners land on the screen where a
 * ray through them hits that same point of the piece (the handles stay
 * attached while the camera turns and zooms), facing is told right, and the
 * weak places (off the cut shape, seams) fall back to the tangent plane.
 */
import { BufferAttribute, BufferGeometry, DoubleSide, Mesh, MeshBasicMaterial, PerspectiveCamera, Raycaster, Vector2, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { pieceAtUv, pieceToUv } from "../design/pattern";
import type { PatternPiece, ProductDefinition } from "../design/schema";
import { loadStandInJerseyProduct, loadStandInProduct } from "../test/fixtures";
import { loadGarmentMeshes } from "../test/garment-meshes";
import type { GarmentMesh } from "./garment-view";
import { FACING_LIMIT_DEGREES, buildSurfaceLookup, projectItem, projectPieceLine, toScreen, type ScreenCamera } from "./surface-lookup";

const MODELS: Array<{ name: string; product: ProductDefinition; meshes: GarmentMesh[] }> = [
  { name: "jersey", product: loadStandInJerseyProduct(), meshes: loadGarmentMeshes("stand-in-jersey.glb") },
  { name: "T-shirt", product: loadStandInProduct(), meshes: loadGarmentMeshes("stand-in-tshirt.glb") },
];

function bounds(meshes: GarmentMesh[]) {
  const lo = [Infinity, Infinity, Infinity];
  const hi = [-Infinity, -Infinity, -Infinity];
  for (const m of meshes) for (let k = 0; k < m.positions.length; k += 3) for (let a = 0; a < 3; a++) {
    lo[a] = Math.min(lo[a]!, m.positions[k + a]!);
    hi[a] = Math.max(hi[a]!, m.positions[k + a]!);
  }
  return { centre: lo.map((l, a) => (l + hi[a]!) / 2) as [number, number, number], size: Math.max(...hi.map((h, a) => h - lo[a]!)) };
}

/** A camera round the garment: `yaw` 0 looks at the front (from +Z), 180 at the back, 90 from the wearer's left (+X). */
function cameraAt(meshes: GarmentMesh[], yaw: number, pitch = 10, distance = 2.6, width = 390, height = 600) {
  const { centre, size } = bounds(meshes);
  const cam = new PerspectiveCamera(35, width / height, 0.01, 100);
  const r = size * distance;
  const y = (yaw * Math.PI) / 180;
  const p = (pitch * Math.PI) / 180;
  cam.position.set(centre[0] + r * Math.sin(y) * Math.cos(p), centre[1] + r * Math.sin(p), centre[2] + r * Math.cos(y) * Math.cos(p));
  cam.lookAt(...centre);
  cam.updateMatrixWorld(true);
  cam.updateProjectionMatrix();
  const vp = cam.projectionMatrix.clone().multiply(cam.matrixWorldInverse);
  const screen: ScreenCamera = { viewProjection: vp.elements, position: cam.position.toArray() as [number, number, number], width, height };
  return { cam, screen };
}

/** The garment as one Three.js mesh, for ray checks. */
function threeMesh(meshes: GarmentMesh[]): Mesh[] {
  return meshes.map((m) => {
    const g = new BufferGeometry();
    g.setAttribute("position", new BufferAttribute(Float32Array.from(m.positions), 3));
    g.setAttribute("uv", new BufferAttribute(Float32Array.from(m.uvs), 2));
    if (m.indices) g.setIndex(new BufferAttribute(Uint32Array.from(m.indices), 1));
    return new Mesh(g, new MeshBasicMaterial({ side: DoubleSide }));
  });
}

/** Where on the piece a ray through a screen point hits the cloth (mm), or null. */
function pieceUnder(model: (typeof MODELS)[number], meshes3: Mesh[], cam: PerspectiveCamera, x: number, y: number, width: number, height: number) {
  const ray = new Raycaster();
  ray.setFromCamera(new Vector2((x / width) * 2 - 1, -(y / height) * 2 + 1), cam);
  const [hit] = ray.intersectObjects(meshes3, false);
  if (!hit?.uv) return null;
  return pieceAtUv(model.product, { u: hit.uv.x, v: hit.uv.y });
}

const pieceOf = (product: ProductDefinition, id: string) => product.pieces.find((p) => p.id === id)!;
const presetOf = (product: ProductDefinition, id: string) => product.placements.find((p) => p.id === id)!;

describe.each(MODELS)("the UV-to-surface lookup, $name", (model) => {
  const lookup = buildSurfaceLookup(model.meshes);
  const meshes3 = threeMesh(model.meshes);

  it("is built once, quickly, from every triangle", () => {
    expect(lookup.triangles).toBeGreaterThan(1000);
    // Generous for a slow test machine; the performance log reports the real figure.
    expect(lookup.buildMs).toBeLessThan(3000);
  });

  it("finds every triangle's middle again (position within a hair)", () => {
    const m = model.meshes[0]!;
    const tris = (m.indices ? m.indices.length : m.positions.length / 3) / 3;
    let checked = 0;
    for (let k = 0; k < tris; k += Math.max(1, Math.floor(tris / 400))) {
      const idx = [0, 1, 2].map((c) => (m.indices ? m.indices[k * 3 + c]! : k * 3 + c));
      const u = idx.reduce((s, i) => s + m.uvs[i * 2]!, 0) / 3;
      const v = idx.reduce((s, i) => s + m.uvs[i * 2 + 1]!, 0) / 3;
      const area = (m.uvs[idx[1]! * 2]! - m.uvs[idx[0]! * 2]!) * (m.uvs[idx[2]! * 2 + 1]! - m.uvs[idx[0]! * 2 + 1]!) - (m.uvs[idx[2]! * 2]! - m.uvs[idx[0]! * 2]!) * (m.uvs[idx[1]! * 2 + 1]! - m.uvs[idx[0]! * 2 + 1]!);
      if (Math.abs(area) < 1e-12) continue;
      const hit = lookup.at(u, v);
      expect(hit).not.toBeNull();
      for (let a = 0; a < 3; a++) {
        const expected = idx.reduce((s, i) => s + m.positions[i * 3 + a]!, 0) / 3;
        expect(Math.abs(hit!.position[a]! - expected)).toBeLessThan(1e-4);
      }
      checked++;
    }
    expect(checked).toBeGreaterThan(100);
  });

  it("puts the front's presets on the front of the garment and the back's on the back, normals outwards", () => {
    const front = pieceOf(model.product, model.product.views.front);
    const back = pieceOf(model.product, model.product.views.back);
    const { centre } = bounds(model.meshes);
    const f = presetOf(model.product, "chest-centre").centre;
    const b = presetOf(model.product, "back-number").centre;
    const fuv = pieceToUv(front, f);
    const buv = pieceToUv(back, b);
    const fs = lookup.at(fuv.u, fuv.v)!;
    const bs = lookup.at(buv.u, buv.v)!;
    expect(fs.position[2]).toBeGreaterThan(centre[2]);
    expect(bs.position[2]).toBeLessThan(centre[2]);
    expect(fs.normal[2]).toBeGreaterThan(0.5);
    expect(bs.normal[2]).toBeLessThan(-0.5);
  });

  it("projects like Three.js does", () => {
    const { cam, screen } = cameraAt(model.meshes, 30, 15);
    const p = new Vector3(0.05, 0.4, 0.1);
    const ours = toScreen(screen, [p.x, p.y, p.z])!;
    const theirs = p.clone().project(cam);
    expect(ours.x).toBeCloseTo(((theirs.x + 1) / 2) * screen.width, 6);
    expect(ours.y).toBeCloseTo(((1 - theirs.y) / 2) * screen.height, 6);
  });

  // Handles stay attached: the screen point of each corner and the centre is where a ray hits that same
  // point of the piece, from the front, turned, zoomed in and out, on the chest, the back and a sleeve.
  const cases: Array<{ preset: string; yaw: number; pitch: number; distance: number }> = [
    { preset: "chest-centre", yaw: 0, pitch: 10, distance: 2.6 },
    { preset: "chest-centre", yaw: 35, pitch: 25, distance: 2.6 },
    { preset: "left-chest", yaw: -25, pitch: 0, distance: 1.6 },
    { preset: "left-chest", yaw: 20, pitch: 10, distance: 4 },
    { preset: "back-number", yaw: 180, pitch: 10, distance: 2.6 },
    { preset: "back-number", yaw: 150, pitch: -15, distance: 1.8 },
    { preset: "sleeve-left", yaw: 90, pitch: 10, distance: 2.6 },
    { preset: "sleeve-right", yaw: -80, pitch: 20, distance: 2 },
  ];
  it.each(cases)("keeps $preset's box on the cloth from yaw $yaw, pitch $pitch, distance $distance", ({ preset, yaw, pitch, distance }) => {
    const p = presetOf(model.product, preset);
    const piece = pieceOf(model.product, p.pieceId);
    const layer = { position: p.centre, size: { width: Math.min(p.maxSize.width, 120), height: Math.min(p.maxSize.height, 70) }, rotation: 0 };
    const { cam, screen } = cameraAt(model.meshes, yaw, pitch, distance);
    const on = projectItem(lookup, piece, layer, screen)!;
    expect(on).not.toBeNull();
    expect(on.facing).toBe(true);
    const at = pieceUnder(model, meshes3, cam, on.centre.x, on.centre.y, screen.width, screen.height);
    expect(at?.piece.id).toBe(piece.id);
    expect(Math.hypot(at!.point.x - layer.position.x, at!.point.y - layer.position.y)).toBeLessThan(4);
    // Corners on the cloth: a ray through each finds the same corner of the piece (a few mm off at most).
    let surfaceCorners = 0;
    const cornersMm = [
      { x: layer.position.x - layer.size.width / 2, y: layer.position.y - layer.size.height / 2 },
      { x: layer.position.x + layer.size.width / 2, y: layer.position.y - layer.size.height / 2 },
      { x: layer.position.x + layer.size.width / 2, y: layer.position.y + layer.size.height / 2 },
      { x: layer.position.x - layer.size.width / 2, y: layer.position.y + layer.size.height / 2 },
    ];
    on.corners.forEach((c, k) => {
      if (on.cornerSources[k] !== "surface") return;
      const hit = pieceUnder(model, meshes3, cam, c.x, c.y, screen.width, screen.height);
      if (!hit || hit.piece.id !== piece.id) return; // hidden behind another part from this side: allowed
      expect(Math.hypot(hit.point.x - cornersMm[k]!.x, hit.point.y - cornersMm[k]!.y)).toBeLessThan(6);
      surfaceCorners++;
    });
    expect(surfaceCorners).toBeGreaterThanOrEqual(2);
    expect(on.outline.length).toBeGreaterThan(16);
    expect(on.pxPerMm).toBeGreaterThan(0);
  });

  it("says an item faces away when the camera is on the other side, and how far", () => {
    const p = presetOf(model.product, "chest-centre");
    const piece = pieceOf(model.product, p.pieceId);
    const layer = { position: p.centre, size: { width: 100, height: 50 }, rotation: 0 };
    const fromBack = projectItem(lookup, piece, layer, cameraAt(model.meshes, 180).screen)!;
    expect(fromBack.facing).toBe(false);
    expect(fromBack.angle).toBeGreaterThan(FACING_LIMIT_DEGREES);
    const fromFront = projectItem(lookup, piece, layer, cameraAt(model.meshes, 0).screen)!;
    expect(fromFront.angle).toBeLessThan(30);
  });

  it("knows which way the piece is seen, so a turn handle turns the right way", () => {
    // From the outside, every piece reads the right way round (not mirrored): +x then +y is clockwise on screen.
    for (const [preset, yaw] of [["chest-centre", 0], ["back-number", 180], ["sleeve-left", 90], ["sleeve-right", -90]] as const) {
      const p = presetOf(model.product, preset);
      const on = projectItem(lookup, pieceOf(model.product, p.pieceId), { position: p.centre, size: { width: 60, height: 40 }, rotation: 0 }, cameraAt(model.meshes, yaw).screen)!;
      const ex = { x: on.corners[1]!.x - on.corners[0]!.x, y: on.corners[1]!.y - on.corners[0]!.y };
      const ey = { x: on.corners[3]!.x - on.corners[0]!.x, y: on.corners[3]!.y - on.corners[0]!.y };
      expect(on.mirrored).toBe(ex.x * ey.y - ex.y * ey.x < 0);
    }
  });

  it("places a corner off the cut shape on the tangent plane, and draws a line along the cloth", () => {
    const front = pieceOf(model.product, model.product.views.front);
    // A big item at the top corner of the piece's box: part of it is past the neckline and the shoulder.
    const layer = { position: { x: front.width * 0.2, y: 40 }, size: { width: 200, height: 120 }, rotation: 0 };
    const on = projectItem(lookup, front, layer, cameraAt(model.meshes, 0).screen);
    expect(on).not.toBeNull();
    expect(on!.cornerSources).toContain("plane");
    const runs = projectPieceLine(lookup, front, { x: front.width / 2, y: 0 }, { x: front.width / 2, y: front.height }, cameraAt(model.meshes, 0).screen);
    expect(runs.length).toBeGreaterThanOrEqual(1);
    // A vertical centre line looks vertical from the front.
    const all = runs.flat();
    const xs = all.map((p) => p.x);
    expect(Math.max(...xs) - Math.min(...xs)).toBeLessThan(12);
    expect(Math.max(...all.map((p) => p.y)) - Math.min(...all.map((p) => p.y))).toBeGreaterThan(150);
  });

  it("answers a lookup in microseconds (no cost per frame worth measuring)", () => {
    const front = pieceOf(model.product, model.product.views.front) as PatternPiece;
    const t0 = performance.now();
    for (let k = 0; k < 2000; k++) {
      const uv = pieceToUv(front, { x: (k % 50) * (front.width / 50), y: Math.floor(k / 50) * (front.height / 40) });
      lookup.at(uv.u, uv.v);
    }
    expect((performance.now() - t0) / 2000).toBeLessThan(0.2);
  });
});
