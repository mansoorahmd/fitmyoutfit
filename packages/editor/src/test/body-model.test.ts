import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { NodeIO } from "@gltf-transform/core";
import { Mesh, MeshStandardMaterial, BoxGeometry, Group, Raycaster, Vector3 } from "three";
import { beforeAll, describe, expect, it } from "vitest";
import { validateProductDefinition } from "../design/validate";
import { BODY_FLAG, disposeBody, makeBody } from "../react/body-model";
import { frameInFreeArea } from "../react/camera";
import { KHRMeshQuantization } from "../../scripts/model-prep/quantize";
import { compactPrimitive, keptMaterials, packUvs } from "../../scripts/model-prep/body";

const root = resolve(import.meta.dirname, "../..");
const product = (id: string): unknown => JSON.parse(readFileSync(resolve(root, "samples/products", `${id}.json`), "utf8"));

describe("the product's body field", () => {
  const base = product("match-jersey-vneck") as { body?: Record<string, unknown> };
  it("is valid on the match jersey and names a model file that exists", () => {
    const checked = validateProductDefinition(base);
    expect(checked.ok).toBe(true);
    expect(base.body?.url).toBe("/models/body-male.glb");
    expect(statSync(resolve(root, "samples/models/body-male.glb")).size).toBeGreaterThan(100_000);
  });
  it("is optional: the T-shirt and the stand-in jersey have none and stay valid", () => {
    for (const id of ["stand-in-tshirt", "stand-in-jersey"]) {
      const json = product(id) as { body?: unknown };
      expect(json.body).toBeUndefined();
      expect(validateProductDefinition(json).ok).toBe(true);
    }
  });
  it.each([
    ["no url", { ...base.body, url: "" }],
    ["a format other than glb", { ...base.body, format: "obj" }],
    ["no frameAbove", { url: "/x.glb", format: "glb", frameBelow: 0.1 }],
    ["a negative frameBelow", { ...base.body, frameBelow: -1 }],
    ["an unknown field", { ...base.body, colour: "red" }],
  ])("refuses %s", (_name, body) => {
    expect(validateProductDefinition({ ...base, body }).ok).toBe(false);
  });
});

describe("the body model file", () => {
  const counts = { meshes: 0, triangles: 0 };
  beforeAll(async () => {
    const doc = await new NodeIO().registerExtensions([KHRMeshQuantization]).readBinary(readFileSync(resolve(root, "samples/models/body-male.glb")));
    for (const mesh of doc.getRoot().listMeshes()) {
      counts.meshes++;
      for (const prim of mesh.listPrimitives()) counts.triangles += prim.getIndices()!.getCount() / 3;
    }
  });
  it("is small: under 1 MB, about 35,000 triangles", () => {
    expect(statSync(resolve(root, "samples/models/body-male.glb")).size).toBeLessThan(1_000_000);
    expect(counts.triangles).toBeGreaterThan(30_000);
    expect(counts.triangles).toBeLessThan(40_000);
    expect(counts.meshes).toBe(8);
  });
  it("says in its notice and its source record that it is a development stand-in, licence not checked", () => {
    const notice = readFileSync(resolve(root, "samples/models/body-male.LICENSE.txt"), "utf8");
    const record = readFileSync(resolve(root, "samples/models/body-male.source.json"), "utf8");
    expect(notice).toMatch(/DEVELOPMENT STAND-IN ONLY/);
    expect(notice).toMatch(/NOT CHECKED/);
    expect(record).toMatch(/DEVELOPMENT STAND-IN ONLY/);
    expect(record).toMatch(/NOT CHECKED/);
  });
});

describe("the body's script functions", () => {
  it("keeps the materials not dropped, in order", () => {
    expect(keptMaterials(["a", "b", "c"], ["b"])).toEqual(["a", "c"]);
  });
  it("compacts a primitive to the vertices its triangles use, in order of first use", () => {
    const positions = [0, 0, 0, 1, 0, 0, 2, 0, 0, 3, 0, 0, 4, 0, 0];
    const normals = positions.map(() => 0);
    const uvs = [0, 0, 0.1, 0, 0.2, 0, 0.3, 0, 0.4, 0];
    const c = compactPrimitive(positions, normals, uvs, [3, 1, 4, 1, 3, 4]);
    expect([...c.indices]).toEqual([0, 1, 2, 1, 0, 2]);
    expect([...c.positions]).toEqual([3, 0, 0, 1, 0, 0, 4, 0, 0]);
    expect([...c.uvs]).toEqual([0.3, 0, 0.1, 0, 0.4, 0]);
  });
  it("packs UVs as 16-bit integers when inside 0 to 1, as floats otherwise", () => {
    expect(packUvs([0, 0.5, 1]).normalized).toBe(true);
    expect([...packUvs([0, 0.5, 1]).array]).toEqual([0, 32768, 65535]);
    expect(packUvs([0, 1.5]).normalized).toBe(false);
  });
});

describe("the body in the canvas", () => {
  const scene = new Group();
  scene.add(new Mesh(new BoxGeometry(1, 1, 1), new MeshStandardMaterial()));
  const original = scene.children[0] as Mesh;
  it("is a clone that no ray hits, with materials of its own, so picking and hovering never see it", () => {
    const body = makeBody(scene);
    const mesh = body.children[0] as Mesh;
    expect(mesh).not.toBe(original);
    expect(mesh.material).not.toBe(original.material);
    expect(mesh.userData[BODY_FLAG]).toBe(true);
    const ray = new Raycaster(new Vector3(0, 0, 5), new Vector3(0, 0, -1));
    expect(ray.intersectObject(body, true)).toHaveLength(0);
    expect(ray.intersectObject(scene, true).length).toBeGreaterThan(0);
    disposeBody(body);
  });
  it("frames the garment and the head above it, but zooms no less close than without a body", () => {
    const garment: [number, number, number] = [0.69, 0.64, 0.29];
    const stage: [number, number, number] = [0.69, 1.06, 0.29];
    const viewport = { width: 1366, height: 700 };
    const without = frameInFreeArea(garment, 35, viewport);
    const withBody = frameInFreeArea(stage, 35, viewport, undefined, garment);
    expect(withBody.fit).toBeGreaterThan(without.fit);
    expect(withBody.minDistance).toBeCloseTo(without.minDistance, 6);
    expect(withBody.maxDistance).toBeGreaterThan(without.maxDistance);
  });
});
