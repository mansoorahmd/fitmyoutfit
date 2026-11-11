import { Document, NodeIO } from "@gltf-transform/core";
import { beforeAll, describe, expect, it } from "vitest";
import { readAccessor, readGlb, worldMatrices, type Glb } from "./glb";

/** A small GLB written by glTF-Transform: a parent node moved and turned, a child with one triangle. */
async function sample(): Promise<Uint8Array> {
  const doc = new Document();
  const buffer = doc.createBuffer();
  const position = doc.createAccessor("p").setType("VEC3").setArray(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0])).setBuffer(buffer);
  const uv = doc.createAccessor("uv").setType("VEC2").setArray(new Float32Array([0, 0, 100, 0, 0, 50])).setBuffer(buffer);
  const shade = doc.createAccessor("o").setType("VEC2").setArray(new Uint16Array([0, 65535, 32768, 0, 65535, 65535])).setNormalized(true).setBuffer(buffer);
  const indices = doc.createAccessor("i").setType("SCALAR").setArray(new Uint16Array([0, 1, 2])).setBuffer(buffer);
  const prim = doc.createPrimitive().setAttribute("POSITION", position).setAttribute("TEXCOORD_0", uv).setAttribute("_OCCLUSION", shade).setIndices(indices);
  const child = doc.createNode("piece").setMesh(doc.createMesh("piece").addPrimitive(prim)).setTranslation([0, 0, 1]);
  // Parent: moved by (1, 2, 3) and turned 90 degrees about Y.
  const parent = doc.createNode("garment").setTranslation([1, 2, 3]).setRotation([0, Math.SQRT1_2, 0, Math.SQRT1_2]).addChild(child);
  doc.createScene().addChild(parent);
  return new NodeIO().writeBinary(doc);
}

let bytes: Uint8Array;
let glb: Glb;
beforeAll(async () => {
  bytes = await sample();
  glb = readGlb(bytes);
});

describe("readGlb and readAccessor", () => {
  it("reads the JSON and the binary chunk", () => {
    expect(glb.json.meshes?.[0]?.name).toBe("piece");
    expect(glb.bin.byteLength).toBeGreaterThan(0);
  });

  it("reads accessors as numbers, scaling normalized integers to 0..1", () => {
    const prim = glb.json.meshes![0]!.primitives[0]!;
    expect([...readAccessor(glb, prim.attributes.POSITION!).values]).toEqual([0, 0, 0, 1, 0, 0, 0, 1, 0]);
    expect([...readAccessor(glb, prim.attributes.TEXCOORD_0!).values]).toEqual([0, 0, 100, 0, 0, 50]);
    const occlusion = readAccessor(glb, prim.attributes._OCCLUSION!);
    expect(occlusion.size).toBe(2);
    expect(occlusion.values[1]).toBe(1);
    expect(occlusion.values[2]).toBeCloseTo(0.5, 4);
    expect([...readAccessor(glb, prim.indices!).values]).toEqual([0, 1, 2]);
  });

  it("refuses files that are not GLB, truncated or that point elsewhere", () => {
    expect(() => readGlb(new Uint8Array(8))).toThrow(/too short/);
    const wrong = bytes.slice();
    wrong[0] = 0;
    expect(() => readGlb(wrong)).toThrow(/magic/);
    expect(() => readGlb(bytes.slice(0, bytes.length - 8))).toThrow(/more bytes|past the end/);
    const external: Glb = { json: { ...glb.json, buffers: [{ byteLength: 4, uri: "https://example.com/x.bin" }] }, bin: glb.bin };
    const json = new TextEncoder().encode(JSON.stringify(external.json));
    const padded = new Uint8Array(Math.ceil(json.length / 4) * 4).fill(0x20);
    padded.set(json);
    const file = new Uint8Array(12 + 8 + padded.length);
    const view = new DataView(file.buffer);
    view.setUint32(0, 0x46546c67, true);
    view.setUint32(4, 2, true);
    view.setUint32(8, file.length, true);
    view.setUint32(12, padded.length, true);
    view.setUint32(16, 0x4e4f534a, true);
    file.set(padded, 20);
    expect(() => readGlb(file)).toThrow(/external file/);
  });

  it("refuses an accessor that runs past its data", () => {
    const broken: Glb = { json: structuredClone(glb.json), bin: glb.bin };
    broken.json.accessors![0]!.count = 1_000_000;
    expect(() => readAccessor(broken, 0)).toThrow(/runs past/);
    expect(() => readAccessor(glb, 99)).toThrow(/no accessor/);
  });
});

describe("worldMatrices", () => {
  it("combines each node's transform with its parents'", () => {
    const worlds = worldMatrices(glb.json);
    const childIndex = glb.json.nodes!.findIndex((n) => n.name === "piece");
    const m = worlds.get(childIndex)!;
    // The child's origin: its own (0, 0, 1) turned 90 degrees about Y is (1, 0, 0), plus the parent's (1, 2, 3).
    expect(m[12]).toBeCloseTo(2, 9);
    expect(m[13]).toBeCloseTo(2, 9);
    expect(m[14]).toBeCloseTo(3, 9);
    // Its X axis is turned to -Z.
    expect(m[0]).toBeCloseTo(0, 9);
    expect(m[2]).toBeCloseTo(-1, 9);
  });

  it("refuses a cycle in the node hierarchy", () => {
    const json = structuredClone(glb.json);
    const childIndex = json.nodes!.findIndex((n) => n.name === "piece");
    const parentIndex = json.nodes!.findIndex((n) => n.name === "garment");
    json.nodes![childIndex]!.children = [parentIndex];
    expect(() => worldMatrices(json)).toThrow(/cycle/);
  });
});
