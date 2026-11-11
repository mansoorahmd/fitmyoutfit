import { describe, expect, it } from "vitest";
import { parseSvgPath } from "../../src/design/svg-path";
import {
  boundaryLoops,
  bounds,
  columnExtent,
  polygonToSvgPath,
  roundTo,
  rowExtent,
  signedArea,
  simplifyClosed,
} from "./outline";

/** A grid of (n + 1) x (n + 1) vertices, two counter-clockwise triangles per cell (Y up). */
function grid(n: number, skip?: (i: number, j: number) => boolean): { points: Array<{ x: number; y: number }>; indices: number[] } {
  const points: Array<{ x: number; y: number }> = [];
  for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) points.push({ x: i, y: j });
  const indices: number[] = [];
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      if (skip?.(i, j)) continue;
      const a = j * (n + 1) + i;
      indices.push(a, a + 1, a + n + 2, a, a + n + 2, a + n + 1);
    }
  }
  return { points, indices };
}

describe("boundaryLoops", () => {
  it("finds the one loop round a mesh, in the triangles' winding", () => {
    const { points, indices } = grid(2);
    const loops = boundaryLoops(indices);
    expect(loops).toHaveLength(1);
    expect(loops[0]).toHaveLength(8);
    expect(new Set(loops[0])).not.toContain(4); // the centre vertex is inside
    expect(signedArea(loops[0]!.map((v) => points[v]!))).toBeGreaterThan(0); // counter-clockwise, like the triangles
  });

  it("finds a hole as a second loop", () => {
    const { indices } = grid(3, (i, j) => i === 1 && j === 1);
    expect(boundaryLoops(indices)).toHaveLength(2);
  });

  it("does not see a boundary where the mesh is only split (same key on both sides)", () => {
    // Two triangles of a square, the shared edge's vertices duplicated (2 -> 4, 0 -> 5).
    const positions = [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
      [1, 1],
      [0, 0],
    ];
    const indices = [0, 1, 2, 5, 4, 3];
    expect(boundaryLoops(indices)).toHaveLength(2);
    const welded = boundaryLoops(indices, (v) => positions[v]!.join(","));
    expect(welded).toHaveLength(1);
    expect(welded[0]).toHaveLength(4);
  });

  it("refuses a boundary that is not a set of simple loops", () => {
    // Two triangles touching at one vertex (a bow tie): two boundary edges leave vertex 0.
    expect(() => boundaryLoops([0, 1, 2, 0, 3, 4])).toThrow(/not simple/);
    expect(() => boundaryLoops([0, 1])).toThrow(RangeError);
  });
});

describe("simplifyClosed", () => {
  const square = [
    { x: 0, y: 0 },
    { x: 5, y: 0.01 },
    { x: 10, y: 0 },
    { x: 10, y: 5 },
    { x: 10, y: 10 },
    { x: 5, y: 10 },
    { x: 0, y: 10 },
    { x: 0.02, y: 5 },
  ];

  it("drops points on straight runs and keeps the corners", () => {
    const out = simplifyClosed(square, 0.1);
    expect(out).toHaveLength(4);
    expect(out).toEqual(expect.arrayContaining([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }]));
  });

  it("keeps every dropped point within the tolerance of the result, and keeps only input points", () => {
    const circle = Array.from({ length: 200 }, (_, k) => ({ x: 100 * Math.cos((k / 200) * 2 * Math.PI), y: 100 * Math.sin((k / 200) * 2 * Math.PI) }));
    const tolerance = 0.25;
    const out = simplifyClosed(circle, tolerance);
    expect(out.length).toBeLessThan(circle.length);
    for (const p of out) expect(circle).toContainEqual(p);
    const dist = (p: { x: number; y: number }) => {
      let best = Infinity;
      for (let k = 0; k < out.length; k++) {
        const a = out[k]!;
        const b = out[(k + 1) % out.length]!;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy)));
        best = Math.min(best, Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy));
      }
      return best;
    };
    for (const p of circle) expect(dist(p)).toBeLessThanOrEqual(tolerance + 1e-9);
  });

  it("leaves tiny polygons alone", () => {
    const tri = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }];
    expect(simplifyClosed(tri, 10)).toEqual(tri);
  });
});

describe("polygonToSvgPath", () => {
  it("writes straight lines only, rounded, which the editor's path parser reads back", () => {
    const d = polygonToSvgPath([{ x: 0, y: 0 }, { x: 10.123, y: -0.001 }, { x: 5, y: 7.5 }]);
    expect(d).toBe("M 0 0 L 10.12 0 L 5 7.5 Z");
    const parsed = parseSvgPath(d);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(new Set(parsed.commands.map((c) => c.type))).toEqual(new Set(["M", "L", "Z"]));
  });

  it("refuses fewer than three points", () => {
    expect(() => polygonToSvgPath([{ x: 0, y: 0 }, { x: 1, y: 1 }])).toThrow(RangeError);
  });

  it("rounds without negative zero", () => {
    expect(Object.is(roundTo(-0.001, 2), 0)).toBe(true);
    expect(roundTo(1.005, 1)).toBe(1);
  });
});

describe("rowExtent and columnExtent", () => {
  // A trapezoid, wider at the bottom (Y down): top edge 2..8 at y = 0, bottom edge 0..10 at y = 10.
  const trapezoid = [{ x: 2, y: 0 }, { x: 8, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }];

  it("gives the left and right edge of a row", () => {
    expect(rowExtent(trapezoid, 5)).toEqual({ left: 1, right: 9 });
    expect(rowExtent(trapezoid, 0)).toEqual({ left: 2, right: 8 });
    expect(rowExtent(trapezoid, 11)).toBeNull();
  });

  it("gives the top and bottom edge of a column", () => {
    expect(columnExtent(trapezoid, 5)).toEqual({ top: 0, bottom: 10 });
    expect(columnExtent(trapezoid, 1)).toEqual({ top: 5, bottom: 10 });
    expect(columnExtent(trapezoid, -1)).toBeNull();
  });

  it("bounds", () => {
    expect(bounds(trapezoid)).toEqual({ minX: 0, minY: 0, maxX: 10, maxY: 10 });
  });
});
