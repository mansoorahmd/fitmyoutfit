import { describe, expect, it } from "vitest";
import {
  alignToNormal,
  bakeOcclusion,
  cosineHemisphere,
  seamSmoothNormals,
  seededRandom,
  shareAcrossSeams,
  sideHitRates,
  smoothOverMesh,
  TriangleGrid,
  vertexNormals,
  weldSeams,
  type MeshData,
} from "./mesh3d";

/** A flat grid in the plane z = `z`, x and y from 0 to `size`, counter-clockwise seen from +Z. */
function plane(n: number, size: number, z = 0, place: (x: number, y: number) => [number, number, number] = (x, y) => [x, y, z]): MeshData {
  const positions: number[] = [];
  for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) positions.push(...place((i / n) * size, (j / n) * size));
  const indices: number[] = [];
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const a = j * (n + 1) + i;
      indices.push(a, a + 1, a + n + 2, a, a + n + 2, a + n + 1);
    }
  }
  return { positions: new Float64Array(positions), indices: new Uint32Array(indices) };
}

/** An open tube round the Y axis, radius r, wound so its normals point `outwards` or inwards. */
function tube(r: number, height: number, outwards: boolean, segments = 32, rows = 8): MeshData {
  const positions: number[] = [];
  for (let j = 0; j <= rows; j++) {
    for (let i = 0; i < segments; i++) {
      const a = (i / segments) * 2 * Math.PI;
      positions.push(r * Math.cos(a), (j / rows) * height, r * Math.sin(a));
    }
  }
  const indices: number[] = [];
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < segments; i++) {
      const a = j * segments + i;
      const b = j * segments + ((i + 1) % segments);
      const c = a + segments;
      const d = b + segments;
      // Counter-clockwise seen from outside: a, c, b and b, c, d (going round by +angle, up by +Y).
      if (outwards) indices.push(a, c, b, b, c, d);
      else indices.push(a, b, c, b, d, c);
    }
  }
  return { positions: new Float64Array(positions), indices: new Uint32Array(indices) };
}

const at = (a: ArrayLike<number>, v: number) => [a[v * 3]!, a[v * 3 + 1]!, a[v * 3 + 2]!];

describe("vertexNormals", () => {
  it("points along the winding's normal, unit length", () => {
    const normals = vertexNormals(plane(2, 1));
    for (let v = 0; v < 9; v++) expect(at(normals, v)).toEqual([0, 0, 1]);
  });

  it("points out of a tube wound outwards, and in when wound inwards", () => {
    const out = vertexNormals(tube(0.1, 0.2, true));
    const into = vertexNormals(tube(0.1, 0.2, false));
    const p = at(tube(0.1, 0.2, true).positions, 40);
    const radial = [p[0]!, 0, p[2]!];
    const dot = (n: number[]) => n[0]! * radial[0]! + n[2]! * radial[2]!;
    expect(dot(at(out, 40))).toBeGreaterThan(0);
    expect(dot(at(into, 40))).toBeLessThan(0);
  });
});

describe("weldSeams", () => {
  it("moves boundary vertices that nearly touch to their common centre, and leaves the rest", () => {
    const a = plane(1, 1);
    const b = plane(1, 1, 0, (x, y) => [x + 1.0003, y, 0]); // 0.3 mm to the right (units: metres)
    // Boundary: all four corners of each square.
    const result = weldSeams([a, b], [[0, 1, 2, 3], [0, 1, 2, 3]], 0.0008);
    expect(result.groups).toBe(2);
    expect(result.maxMove).toBeCloseTo(0.00015, 9);
    expect(at(a.positions, 1)).toEqual(at(b.positions, 0)); // a's right edge meets b's left edge
    expect(at(a.positions, 3)).toEqual(at(b.positions, 2));
    expect(at(a.positions, 0)).toEqual([0, 0, 0]); // far corners untouched
    expect(at(b.positions, 1)[0]).toBeCloseTo(2.0003, 12);
  });

  it("closes a seam between two edges of the same piece (a sleeve's underarm)", () => {
    const m = plane(1, 1);
    m.positions[3] = 0.0002; // vertex 1 moved next to vertex 0
    m.positions[4] = 0;
    const result = weldSeams([m], [[0, 1]], 0.0008);
    expect(result.groups).toBe(1);
    expect(at(m.positions, 0)).toEqual(at(m.positions, 1));
  });
});

describe("seamSmoothNormals", () => {
  // Two planes meeting at a fold along x = 1, the second turned up by `degrees`.
  const fold = (degrees: number) => {
    const t = (degrees * Math.PI) / 180;
    const left = plane(2, 1);
    const right = plane(2, 1, 0, (x, y) => [1 + x * Math.cos(t), y, x * Math.sin(t)]);
    return [left, right];
  };

  it("averages the normals across a gentle fold, so the seam does not show", () => {
    const meshes = fold(20);
    const [left, right] = seamSmoothNormals(meshes, 1e-6, 60);
    // Vertex 2 of the left plane (x = 1, y = 0) and vertex 0 of the right are the same point.
    expect(at(left!, 2)[0]).toBeCloseTo(at(right!, 0)[0]!, 9);
    expect(at(left!, 2)[2]).toBeCloseTo(at(right!, 0)[2]!, 9);
    expect(Math.hypot(...at(left!, 2))).toBeCloseTo(1, 6);
  });

  it("keeps a sharp crease sharp", () => {
    const meshes = fold(90);
    const [left, right] = seamSmoothNormals(meshes, 1e-6, 60);
    expect(at(left!, 2)).toEqual(at(vertexNormals(meshes[0]!), 2));
    expect(at(right!, 0)).toEqual(at(vertexNormals(meshes[1]!), 0));
  });
});

describe("TriangleGrid", () => {
  const meshes = [plane(4, 1, 0), plane(4, 1, 0.5)];
  const grid = new TriangleGrid(meshes, 0.1);

  it("finds the nearest hit along a ray and which triangle it is", () => {
    const hit = grid.cast([0.3, 0.3, 1], [0, 0, -1], 0, 10);
    expect(hit?.t).toBeCloseTo(0.5, 9);
    expect(grid.owner[hit!.triangle]![0]).toBe(1); // the upper plane
    const lower = grid.cast([0.3, 0.3, 0.25], [0, 0, -1], 0, 10);
    expect(lower?.t).toBeCloseTo(0.25, 9);
  });

  it("misses past the end of the ray, outside the meshes, and skips what it is told to", () => {
    expect(grid.cast([0.3, 0.3, 1], [0, 0, -1], 0, 0.4)).toBeNull();
    expect(grid.cast([2, 2, 1], [0, 0, -1], 0, 10)).toBeNull();
    expect(grid.cast([0.3, 0.3, 1], [0, 0, 1], 0, 10)).toBeNull();
    const skipUpper = grid.cast([0.3, 0.3, 1], [0, 0, -1], 0, 10, (t) => grid.owner[t]![0] === 1);
    expect(skipUpper?.t).toBeCloseTo(1, 9);
  });

  it("agrees with testing every triangle, for slanted rays", () => {
    const random = seededRandom(3);
    for (let k = 0; k < 200; k++) {
      const o: [number, number, number] = [random(), random(), 1.2];
      const d: [number, number, number] = [random() - 0.5, random() - 0.5, -1];
      const hit = grid.cast(o, d, 0, 10);
      // Brute force: the planes are z = 0.5 and z = 0, inside 0..1 in x and y.
      const len = Math.hypot(...d);
      let expected: number | null = null;
      for (const z of [0.5, 0]) {
        const s = (z - o[2]) / d[2];
        const x = o[0] + s * d[0];
        const y = o[1] + s * d[1];
        if (x >= 0 && x <= 1 && y >= 0 && y <= 1) {
          expected = s * len;
          break;
        }
      }
      if (expected === null) expect(hit).toBeNull();
      else expect(hit?.t).toBeCloseTo(expected, 9);
    }
  });
});

describe("sideHitRates: which surface of a two-layer cloth faces outwards", () => {
  // A sleeve-like tube exported with thickness: outer layer wound outwards, inner layer 1 mm in, wound inwards.
  const outer = tube(0.06, 0.2, true);
  const inner = tube(0.059, 0.2, false);
  const grid = new TriangleGrid([outer, inner], 0.02);
  const options = { samples: 200, maxDistance: 1, offset: 0.0001, seed: 1 };

  it("the outer layer's outward side sees open space; its other side meets the inner layer", () => {
    const rates = sideHitRates(grid, 0, outer, options);
    expect(rates.front).toBe(0);
    expect(rates.back).toBe(1);
  });

  it("the inner layer's inward side meets the tube's opposite wall", () => {
    const rates = sideHitRates(grid, 1, inner, options);
    expect(rates.front).toBe(1);
    expect(Math.min(rates.front, rates.back)).toBeGreaterThan(0.9);
  });
});

describe("bakeOcclusion", () => {
  it("is fully open on both sides of a lone plane", () => {
    const m = plane(2, 1);
    const grid = new TriangleGrid([m], 0.2);
    const { outer, inner } = bakeOcclusion(grid, m, vertexNormals(m), { rays: 32, maxDistance: 1, offset: 0.001, seed: 1 });
    expect([...outer].every((v) => v === 1)).toBe(true);
    expect([...inner].every((v) => v === 1)).toBe(true);
  });

  it("darkens the inside of a tube more than its outside", () => {
    const m = tube(0.06, 0.3, true);
    const grid = new TriangleGrid([m], 0.02);
    const { outer, inner } = bakeOcclusion(grid, m, vertexNormals(m), { rays: 64, maxDistance: 0.35, offset: 0.0005, seed: 1 });
    const middle = 4 * 32 + 5; // a vertex half way up
    expect(outer[middle]).toBe(1);
    expect(inner[middle]).toBeLessThan(0.5);
  });

  it("is reproducible: the same seed gives the same values", () => {
    const m = tube(0.06, 0.3, true);
    const grid = new TriangleGrid([m], 0.02);
    const run = () => bakeOcclusion(grid, m, vertexNormals(m), { rays: 16, maxDistance: 0.35, offset: 0.0005, seed: 9 }).inner;
    expect(run()).toEqual(run());
  });
});

describe("hemisphere sampling", () => {
  it("gives unit directions on the +Z side, turned onto any normal", () => {
    const dirs = cosineHemisphere(64, seededRandom(5));
    for (const d of dirs) {
      expect(Math.hypot(...d)).toBeCloseTo(1, 9);
      expect(d[2]).toBeGreaterThanOrEqual(0);
      const turned = alignToNormal(d, [0, -1, 0]);
      expect(turned[1]).toBeCloseTo(-d[2], 9);
    }
  });
});

describe("smoothOverMesh and shareAcrossSeams", () => {
  it("keeps a constant constant and flattens a spike", () => {
    const m = plane(4, 1);
    const flat = smoothOverMesh(m.indices, new Float32Array(25).fill(0.7), 3);
    for (const v of flat) expect(v).toBeCloseTo(0.7, 6);
    const spike = new Float32Array(25);
    spike[12] = 1;
    const smoothed = smoothOverMesh(m.indices, spike, 2);
    expect(smoothed[12]).toBeLessThan(0.5);
    expect(smoothed[11]).toBeGreaterThan(0);
  });

  it("gives vertices welded at a seam their mean value", () => {
    const a = plane(1, 1);
    const b = plane(1, 1, 0, (x, y) => [x + 1, y, 0]);
    const values = [new Float32Array([0, 1, 0, 1]), new Float32Array([0, 0, 0, 0])];
    shareAcrossSeams([a, b], values);
    expect(values[0]![1]).toBe(0.5);
    expect(values[1]![0]).toBe(0.5);
    expect(values[0]![0]).toBe(0);
  });
});
