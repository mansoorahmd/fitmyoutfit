import { describe, expect, it } from "vitest";
import { clipAtY } from "./body.js";

describe("clipAtY (the shorts' straight lower edge)", () => {
  // One tall triangle from y 0 to y 1 and one above the plane.
  const positions = [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 2, 0, 1, 2, 0, 0, 3, 0];
  const normals = [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1];
  const uvs = [0, 0, 1, 0, 0, 1, 0, 2, 1, 2, 0, 3];
  it("splits a crossing triangle on the plane, keeps its area, and leaves a triangle on one side alone", () => {
    const out = clipAtY(positions, normals, uvs, [0, 1, 2, 3, 4, 5], 0.5);
    expect(out.indices.length).toBe(4 * 3);
    const area = (a: number, b: number, c: number) => Math.abs((out.positions[b * 3]! - out.positions[a * 3]!) * (out.positions[c * 3 + 1]! - out.positions[a * 3 + 1]!) - (out.positions[c * 3]! - out.positions[a * 3]!) * (out.positions[b * 3 + 1]! - out.positions[a * 3 + 1]!)) / 2;
    let total = 0;
    for (let t = 0; t < 3 * 3; t += 3) total += area(out.indices[t]!, out.indices[t + 1]!, out.indices[t + 2]!);
    expect(total).toBeCloseTo(0.5, 9);
    for (let t = 0; t < 9; t += 3) {
      const ys = [0, 1, 2].map((k) => out.positions[out.indices[t + k]! * 3 + 1]!);
      expect(ys.every((y) => y >= 0.5 - 1e-9) || ys.every((y) => y <= 0.5 + 1e-9)).toBe(true);
    }
    expect(out.indices.slice(9)).toEqual([3, 4, 5]);
  });
  it("interpolates the UVs on the new corners", () => {
    const out = clipAtY(positions, normals, uvs, [0, 1, 2], 0.5);
    const added = out.uvs.slice(positions.length / 3 * 2);
    expect(added).toEqual([0, 0.5, 0.5, 0.5]);
  });
});
