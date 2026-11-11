import { describe, expect, it } from "vitest";
import { centroid, mergeParts, orientationProblems, type MeshPart } from "./assemble";

describe("orientationProblems", () => {
  const size: [number, number, number] = [0.54, 0.69, 0.29];
  const ok = { front: [0, 0.6, 0.07] as [number, number, number], back: [0, 0.6, -0.12] as [number, number, number], left: [0.21, 0.6, 0] as [number, number, number], right: [-0.21, 0.6, 0] as [number, number, number] };

  it("accepts a garment that stands Y up, faces +Z, with the wearer's left at +X", () => {
    expect(orientationProblems(ok, size)).toEqual([]);
    expect(orientationProblems({ front: ok.front, back: ok.back }, size)).toEqual([]);
  });

  it("names what is wrong: lying down, facing backwards, sides swapped", () => {
    expect(orientationProblems(ok, [0.54, 0.29, 0.69])[0]).toMatch(/Y is not up/);
    expect(orientationProblems({ ...ok, front: ok.back, back: ok.front }, size)).toEqual(["the front is not in front of the back (+Z)"]);
    expect(orientationProblems({ ...ok, left: ok.right, right: ok.left }, size)).toEqual(["the left sleeve is not on the wearer's left (+X)"]);
  });
});

describe("centroid", () => {
  it("is the mean of the vertices", () => {
    expect(centroid([0, 0, 0, 2, 4, 6])).toEqual([1, 2, 3]);
  });
});

function part(vertices: number, indices: number[], tag: number): MeshPart {
  return {
    positions: new Float32Array(vertices * 3).fill(tag),
    normals: new Float32Array(vertices * 3).fill(tag),
    uvs: new Float32Array(vertices * 2).fill(tag / 10),
    occlusion: new Uint16Array(vertices * 2).fill(tag),
    indices,
  };
}

describe("mergeParts", () => {
  it("puts pieces one after the other in one mesh (one draw call), moving each piece's indices", () => {
    const merged = mergeParts([part(3, [0, 1, 2], 1), part(4, [0, 1, 2, 0, 2, 3], 2)]);
    expect([...merged.indices]).toEqual([0, 1, 2, 3, 4, 5, 3, 5, 6]);
    expect(merged.indices).toBeInstanceOf(Uint16Array);
    expect([...merged.positions.slice(0, 9)]).toEqual(Array(9).fill(1));
    expect([...merged.positions.slice(9)]).toEqual(Array(12).fill(2));
    expect(merged.uvs).toHaveLength(14);
    expect([...merged.occlusion.slice(6)]).toEqual(Array(8).fill(2));
  });

  it("uses 32-bit indices only when the vertices need them", () => {
    expect(mergeParts([part(65535, [0, 1, 65534], 1)]).indices).toBeInstanceOf(Uint16Array);
    expect(mergeParts([part(65535, [0, 1, 2], 1), part(1, [0, 0, 0], 2)]).indices).toBeInstanceOf(Uint32Array);
  });

  it("refuses broken parts", () => {
    expect(() => mergeParts([])).toThrow(/nothing/);
    expect(() => mergeParts([part(3, [0, 1, 3], 1)])).toThrow(/out of range/);
    expect(() => mergeParts([{ ...part(3, [0, 1, 2], 1), uvs: new Float32Array(2) }])).toThrow(/different vertex counts/);
  });
});
