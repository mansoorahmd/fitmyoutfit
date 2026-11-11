import { describe, expect, it } from "vitest";
import { decideUvScale, medianEdgeRatio } from "./scale";

/** A grid of n x n squares, `size` position units wide, laid in UV at `uvSize`; `stretchX` stretches the 3D copy across. */
function grid(n: number, size: number, uvSize: number, stretchX = 1) {
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  for (let j = 0; j <= n; j++) {
    for (let i = 0; i <= n; i++) {
      positions.push(((i / n) * size) * stretchX, (j / n) * size, 0);
      uvs.push((i / n) * uvSize, (j / n) * uvSize);
    }
  }
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const a = j * (n + 1) + i;
      indices.push(a, a + 1, a + n + 2, a, a + n + 2, a + n + 1);
    }
  }
  const triangles = Array.from({ length: indices.length / 3 }, (_, t) => t);
  return { positions, uvs, indices, triangles };
}

describe("medianEdgeRatio", () => {
  it("measures position units per UV unit from the 3D surface against its UV layout", () => {
    // 0.5 m of cloth laid out as 0.31 UV units: 1.613 m per UV unit (the jersey's layout is about that).
    const g = grid(8, 0.5, 0.31);
    expect(medianEdgeRatio(g.positions, g.uvs, g.indices, g.triangles)).toBeCloseTo(0.5 / 0.31, 9);
  });

  it("is not thrown by a few stretched triangles (the drape stretches cloth here and there)", () => {
    const g = grid(8, 0.5, 0.31);
    // Pull one vertex far out of the plane: its triangles' edges get much longer.
    g.positions[40 * 3 + 2] = 0.2;
    expect(medianEdgeRatio(g.positions, g.uvs, g.indices, g.triangles)).toBeCloseTo(0.5 / 0.31, 9);
  });

  it("skips edges with no UV length, and gives NaN when nothing is left", () => {
    expect(medianEdgeRatio([0, 0, 0, 1, 0, 0, 0, 1, 0], [0, 0, 0, 0, 0, 0], [0, 1, 2], [0])).toBeNaN();
  });
});

describe("decideUvScale", () => {
  const islands = [
    { id: "front", ratio: 1612, weight: 2900 },
    { id: "back", ratio: 1613, weight: 2700 },
    { id: "sleeve_left", ratio: 1650, weight: 530 },
    { id: "collar_stripe", ratio: 1760, weight: 25 }, // a thin strip, stretched round the neck
  ];

  it("finds one scale when every island that counts agrees within the tolerance", () => {
    const d = decideUvScale(islands, 0.04);
    expect(d.oneScale).toBe(true);
    // Weighted median: the front holds 2900 of 6155, so half the weight is reached at the back's ratio.
    expect(d.common).toBe(1613);
    expect([...d.scales.values()]).toEqual([1613, 1613, 1613, 1613]);
    expect(d.deciding).toEqual(["front", "back", "sleeve_left"]);
    expect(d.deviations.get("collar_stripe")).toBeCloseTo(1760 / 1613 - 1, 12);
  });

  it("gives each island its own scale when a large island differs (a layout with islands at different sizes)", () => {
    const d = decideUvScale([...islands.slice(0, 2), { id: "sleeve_left", ratio: 1200, weight: 530 }], 0.04);
    expect(d.oneScale).toBe(false);
    expect(d.scales.get("front")).toBe(1612);
    expect(d.scales.get("sleeve_left")).toBe(1200);
  });

  it("lets a small island decide when the share for deciding is lowered", () => {
    expect(decideUvScale(islands, 0.04, 0.001).oneScale).toBe(false);
  });

  it("refuses unusable input", () => {
    expect(() => decideUvScale([], 0.04)).toThrow(/no islands/);
    expect(() => decideUvScale([{ id: "a", ratio: Number.NaN, weight: 1 }], 0.04)).toThrow(/no usable scale/);
    expect(() => decideUvScale([{ id: "a", ratio: 1, weight: -1 }], 0.04)).toThrow(/negative/);
  });
});
