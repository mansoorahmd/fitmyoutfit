import { Document, NodeIO } from "@gltf-transform/core";
import { describe, expect, it } from "vitest";
import { readGlb } from "./glb";
import { KHRMeshQuantization, quantizationFrame, quantizeNormals, quantizePositions, quantizeUvs } from "./quantize";

describe("quantizePositions", () => {
  const positions = new Float32Array([-0.27, 0, -0.14, 0.27, 0.69, 0.15, 0.1, 0.3, 0.02, 0.1, 0.3, 0.02]);
  const q = quantizePositions(positions);
  const back = (k: number) => (q.values[k]! / 32767) * q.scale + q.translation[k % 3]!;

  it("stores positions as 16-bit integers that the node's scale and translation turn back into metres, within 0.02 mm", () => {
    expect(q.values).toBeInstanceOf(Int16Array);
    expect(q.translation[1]).toBeCloseTo(0.345, 6);
    expect(q.scale).toBeCloseTo(0.345, 6); // half the largest extent (Y)
    for (let k = 0; k < positions.length; k++) expect(Math.abs(back(k) - positions[k]!)).toBeLessThan(0.00002);
    // The largest extent reaches the ends of the integer range.
    expect(Math.min(...q.values)).toBe(-32767);
    expect(Math.max(...q.values)).toBe(32767);
  });

  it("keeps equal positions equal, so welded seams stay closed", () => {
    expect([...q.values.slice(6, 9)]).toEqual([...q.values.slice(9, 12)]);
  });

  it("uses one scale for every axis, so normals need no correction (the shallow Z axis does not fill the range)", () => {
    const zs = [2, 5, 8, 11].map((k) => Math.abs(q.values[k]!));
    expect(Math.max(...zs)).toBe(Math.round((0.145 / 0.345) * 32767));
  });

  it("refuses nothing to quantize", () => {
    expect(() => quantizePositions([])).toThrow(RangeError);
  });
});

describe("quantizationFrame: one grid for several meshes (G3, a garment in nine meshes)", () => {
  // Two pieces that share a welded seam vertex (0.1, 0.3, 0.02), each with a box of its own.
  const a = [-0.27, 0, -0.14, 0.1, 0.3, 0.02, 0.05, 0.2, 0.01];
  const b = [0.1, 0.3, 0.02, 0.27, 0.69, 0.15, 0.2, 0.5, 0.1];

  it("holds every set: the centre of their common box and half its longest side", () => {
    const f = quantizationFrame([a, b]);
    expect(f.translation[0]).toBeCloseTo(0, 9);
    expect(f.translation[1]).toBeCloseTo(0.345, 9);
    expect(f.scale).toBeCloseTo(0.345, 9);
  });

  it("puts a seam vertex shared by two meshes on the same integers (in frames of their own it would not be)", () => {
    const frame = quantizationFrame([a, b]);
    const qa = quantizePositions(a, frame);
    const qb = quantizePositions(b, frame);
    expect([...qa.values.slice(3, 6)]).toEqual([...qb.values.slice(0, 3)]);
    const own = (q: ReturnType<typeof quantizePositions>, k: number) => [0, 1, 2].map((i) => (q.values[k * 3 + i]! / 32767) * q.scale + q.translation[i]!);
    const sa = own(quantizePositions(a), 1);
    const sb = own(quantizePositions(b), 0);
    expect(sa.some((x, i) => x !== sb[i])).toBe(true);
  });

  it("refuses a position outside the frame, and no positions at all", () => {
    expect(() => quantizePositions(b, quantizationFrame([a]))).toThrow(/outside the quantization frame/);
    expect(() => quantizationFrame([[]])).toThrow(RangeError);
  });
});

describe("quantizeNormals and quantizeUvs", () => {
  it("stores unit vectors as 8-bit integers", () => {
    expect([...quantizeNormals([0, 1, 0, -1, 0, 0, 0.6, 0.8, 0])]).toEqual([0, 127, 0, -127, 0, 0, 76, 102, 0]);
  });

  it("stores UVs as unsigned 16-bit integers, to 1/65535 (0.03 texture pixels at 2048)", () => {
    const uv = quantizeUvs([0, 1, 0.5, 0.25]);
    expect([...uv]).toEqual([0, 65535, 32768, 16384]);
    expect(Math.abs(uv[2]! / 65535 - 0.5)).toBeLessThan(1 / 65535);
    expect(() => quantizeUvs([1.01])).toThrow(/outside 0 to 1/);
    expect(() => quantizeUvs([Number.NaN])).toThrow(/outside 0 to 1/);
  });
});

describe("KHRMeshQuantization", () => {
  it("declares KHR_mesh_quantization as required in the file, and lets NodeIO read such a file back", async () => {
    const doc = new Document();
    doc.createExtension(KHRMeshQuantization).setRequired(true);
    const buffer = doc.createBuffer();
    const q = quantizePositions([0, 0, 0, 1, 0, 0, 0, 1, 0]);
    const position = doc.createAccessor().setType("VEC3").setArray(q.values).setNormalized(true).setBuffer(buffer);
    const prim = doc.createPrimitive().setAttribute("POSITION", position);
    doc.createScene().addChild(doc.createNode("m").setScale([q.scale, q.scale, q.scale]).setTranslation(q.translation).setMesh(doc.createMesh().addPrimitive(prim)));
    const io = new NodeIO().registerExtensions([KHRMeshQuantization]);
    const bytes = await io.writeBinary(doc);
    const json = readGlb(bytes).json;
    expect(json.extensionsUsed).toEqual(["KHR_mesh_quantization"]);
    expect(json.extensionsRequired).toEqual(["KHR_mesh_quantization"]);
    const read = await io.readBinary(bytes);
    const node = read.getRoot().listNodes()[0]!;
    const accessor = node.getMesh()!.listPrimitives()[0]!.getAttribute("POSITION")!;
    expect(accessor.getNormalized()).toBe(true);
    // Back in metres: the vertex at (1, 0, 0).
    const local = accessor.getElement(1, [0, 0, 0]);
    const m = node.getWorldMatrix();
    expect(m[0]! * local[0]! + m[12]!).toBeCloseTo(1, 4);
  });
});
