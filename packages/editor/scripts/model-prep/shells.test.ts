import { describe, expect, it } from "vitest";
import { TriangleGrid, sideHitRates } from "./mesh3d";
import { isEdgeStrip, shellHoldsUv, splitShells, uvBoxesOverlap, uvTriangleArea } from "./shells";

/** A mesh built from parts, each a list of vertices (position and UV) and triangles. */
function build(parts: Array<{ vertices: Array<[number, number, number, number, number]>; triangles: number[] }>) {
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  for (const part of parts) {
    const base = positions.length / 3;
    for (const [x, y, z, u, v] of part.vertices) {
      positions.push(x, y, z);
      uvs.push(u, v);
    }
    indices.push(...part.triangles.map((i) => i + base));
  }
  return { positions: new Float64Array(positions), uvs: new Float64Array(uvs), indices: new Uint32Array(indices) };
}

/** A flat square of cloth at height z, 1 x 1 (position units), with UVs (u0, v0) to (u0 + s, v0 + s). */
function square(z: number, u0: number, v0: number, s: number, flip = false) {
  const vertices: Array<[number, number, number, number, number]> = [
    [0, 0, z, u0, v0],
    [1, 0, z, u0 + s, v0],
    [1, 1, z, u0 + s, v0 + s],
    [0, 1, z, u0, v0 + s],
  ];
  // The two triangles start at different vertices, so only their shared edge joins them.
  return { vertices, triangles: flip ? [0, 2, 1, 3, 2, 0] : [0, 1, 2, 2, 3, 0] };
}

describe("splitShells", () => {
  it("keeps the two layers of a cloth apart (same UVs, different places) and reports their winding in UV", () => {
    // The outer layer and the inner copy 0.5 mm in, wound the other way, as the jersey's trims mesh holds them.
    const mesh = build([square(0, 0.1, 0.1, 0.2), square(-0.0005, 0.1, 0.1, 0.2, true)]);
    const shells = splitShells(mesh.positions, mesh.uvs, mesh.indices);
    expect(shells).toHaveLength(2);
    expect(shells[0]!.triangles).toEqual([0, 1]);
    expect(shells[1]!.triangles).toEqual([2, 3]);
    expect(shells[0]!.uvArea).toBeCloseTo(0.04, 12);
    expect(shells[0]!.uvSignedArea).toBeCloseTo(0.04, 12);
    expect(shells[1]!.uvSignedArea).toBeCloseTo(-0.04, 12);
    expect(shells[0]!.area).toBeCloseTo(1, 12);
    expect(shells[0]!.uvBox).toEqual({ minU: 0.1, minV: 0.1, maxU: expect.closeTo(0.3, 12), maxV: expect.closeTo(0.3, 12) });
  });

  it("keeps two pieces sewn together apart (same places along the seam, different UVs)", () => {
    const left = square(0, 0, 0, 0.1);
    const right = { vertices: left.vertices.map(([x, y, z, u, v]) => [x + 1, y, z, u + 0.5, v] as [number, number, number, number, number]), triangles: left.triangles };
    const mesh = build([left, right]);
    expect(splitShells(mesh.positions, mesh.uvs, mesh.indices)).toHaveLength(2);
  });

  it("joins a piece whose vertices were split (same place and same UV), as exporters do for normals", () => {
    // Two triangles of one square, each with its own copies of the shared vertices.
    const mesh = build([
      { vertices: [[0, 0, 0, 0, 0], [1, 0, 0, 0.1, 0], [1, 1, 0, 0.1, 0.1]], triangles: [0, 1, 2] },
      { vertices: [[0, 0, 0, 0, 0], [1, 1, 0, 0.1, 0.1], [0, 1, 0, 0, 0.1]], triangles: [0, 1, 2] },
    ]);
    const shells = splitShells(mesh.positions, mesh.uvs, mesh.indices);
    expect(shells).toHaveLength(1);
    expect(shells[0]!.triangles).toEqual([0, 1]);
  });

  it("refuses inconsistent input", () => {
    expect(() => splitShells([0, 0, 0], [0, 0, 0, 0], [0, 0, 0])).toThrow(/different numbers/);
    expect(() => splitShells([0, 0, 0], [0, 0], [0, 0])).toThrow(/multiple of 3/);
    expect(() => splitShells([0, 0, 0], [0, 0], [0, 0, 1])).toThrow(/out of range/);
  });
});

describe("isEdgeStrip", () => {
  it("tells an edge strip (3D area, no UV area) from a cloth layer", () => {
    // A layer: 1 m2 of cloth over 0.39 UV units squared at 1.6 m per UV unit (a share near 1).
    expect(isEdgeStrip({ uvArea: 0.39, area: 1 }, 1.6)).toBe(false);
    // An edge strip: its UVs collapse onto the piece's outline.
    expect(isEdgeStrip({ uvArea: 0, area: 0.002 }, 1.6)).toBe(true);
    expect(isEdgeStrip({ uvArea: 1e-6, area: 0.002 }, 1.6)).toBe(true);
    // Even with a rough estimate of the scale (1 instead of 1.6) the two stay apart.
    expect(isEdgeStrip({ uvArea: 0.39, area: 1 }, 1)).toBe(false);
    // Nothing at all counts as a strip, never as a layer.
    expect(isEdgeStrip({ uvArea: 0.1, area: 0 }, 1)).toBe(true);
  });
});

describe("shellHoldsUv", () => {
  const mesh = build([square(0, 0.1, 0.1, 0.2)]);
  const [shell] = splitShells(mesh.positions, mesh.uvs, mesh.indices);

  it("finds a piece by a UV point inside it, on its edge too, and not outside", () => {
    expect(shellHoldsUv(shell!, mesh.uvs, mesh.indices, 0.2, 0.15)).toBe(true);
    expect(shellHoldsUv(shell!, mesh.uvs, mesh.indices, 0.1, 0.2)).toBe(true);
    expect(shellHoldsUv(shell!, mesh.uvs, mesh.indices, 0.31, 0.2)).toBe(false);
    expect(shellHoldsUv(shell!, mesh.uvs, mesh.indices, 0.05, 0.05)).toBe(false);
  });

  it("tests the triangles, not only the box: a point in the box of a triangular island but outside it is not found", () => {
    const tri = build([{ vertices: [[0, 0, 0, 0.1, 0.1], [1, 0, 0, 0.3, 0.1], [0, 1, 0, 0.1, 0.3]], triangles: [0, 1, 2] }]);
    const [s] = splitShells(tri.positions, tri.uvs, tri.indices);
    expect(shellHoldsUv(s!, tri.uvs, tri.indices, 0.15, 0.15)).toBe(true);
    expect(shellHoldsUv(s!, tri.uvs, tri.indices, 0.28, 0.28)).toBe(false);
  });

  it("never finds a point in an edge strip, whose UV triangles have no area", () => {
    const strip = build([{ vertices: [[0, 0, 0, 0.2, 0.2], [1, 0, 0, 0.2, 0.2], [1, 0, 1, 0.2, 0.2]], triangles: [0, 1, 2] }]);
    const [s] = splitShells(strip.positions, strip.uvs, strip.indices);
    expect(uvTriangleArea(strip.uvs, strip.indices, 0)).toBe(0);
    expect(shellHoldsUv(s!, strip.uvs, strip.indices, 0.2, 0.2)).toBe(false);
  });
});

describe("uvBoxesOverlap", () => {
  it("says when two islands' boxes share area (a trim's curved strip inside a sleeve's box), not when they only touch", () => {
    const sleeve = { minU: 0.66, minV: 0.77, maxU: 0.89, maxV: 0.9 };
    const cuff = { minU: 0.68, minV: 0.756, maxU: 0.88, maxV: 0.778 };
    expect(uvBoxesOverlap(sleeve, cuff)).toBe(true);
    expect(uvBoxesOverlap(cuff, sleeve)).toBe(true);
    expect(uvBoxesOverlap(sleeve, { minU: 0.89, minV: 0.77, maxU: 0.95, maxV: 0.9 })).toBe(false);
    expect(uvBoxesOverlap(sleeve, { minU: 0, minV: 0, maxU: 0.1, maxV: 0.1 })).toBe(false);
  });
});

describe("trims: inserted, not laid on top", () => {
  // A panel with a stripe beside it (sewn in, edge to edge), and the same stripe laid 0.1 mm over the panel.
  // The processing script refuses kept surfaces that lie this close to other cloth: they would flicker.
  const panel = build([square(0, 0, 0, 0.1)]);
  const rates = (stripeZ: number, stripeX: number) => {
    const stripe = build([{ ...square(stripeZ, 0.5, 0, 0.1), vertices: square(stripeZ, 0.5, 0, 0.1).vertices.map(([x, y, z, u, v]) => [x * 0.2 + stripeX, y, z, u, v] as [number, number, number, number, number]) }]);
    const meshes = [panel, stripe].map((m) => ({ positions: m.positions, indices: m.indices }));
    const grid = new TriangleGrid(meshes, 0.1);
    return sideHitRates(grid, 1, meshes[1]!, { samples: 50, maxDistance: 0.0002, offset: 0.00001, seed: 3 });
  };

  it("finds no other cloth within 0.2 mm of a stripe sewn in beside the panel", () => {
    const r = rates(0, 1);
    expect(r.front + r.back).toBe(0);
  });

  it("finds the panel right behind a stripe laid on top of it", () => {
    const r = rates(0.0001, 0.4);
    expect(r.back).toBe(1);
  });
});
