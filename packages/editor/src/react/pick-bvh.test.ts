/**
 * Picking on the model through a bounding-volume hierarchy (E3c, S1): the same
 * nearest hit, triangle and UV as testing every triangle, on a crumpled sheet
 * of many triangles seen from many directions.
 */
import { describe, expect, it } from "vitest";
import { buildPickBvh, pickBvh } from "./pick-bvh";

function sheet(n: number) {
  // An n x n grid, bent and wrinkled, so rays meet it at many angles, front and back.
  const positions: number[] = [];
  const uvs: number[] = [];
  for (let j = 0; j <= n; j++) {
    for (let i = 0; i <= n; i++) {
      const x = i / n - 0.5;
      const y = j / n - 0.5;
      positions.push(x, y, 0.2 * Math.sin(6 * x) * Math.cos(4 * y) + 0.05 * Math.sin(40 * x * y));
      uvs.push(i / n, j / n);
    }
  }
  const index: number[] = [];
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const a = j * (n + 1) + i;
      index.push(a, a + 1, a + n + 1, a + 1, a + n + 2, a + n + 1);
    }
  }
  return { positions: new Float32Array(positions), uvs: new Float32Array(uvs), index };
}

function brute(positions: Float32Array, index: number[], o: number[], d: number[]) {
  let best = Infinity;
  let tri = -1;
  for (let t = 0; t < index.length / 3; t++) {
    const [a, b, c] = [index[3 * t]! * 3, index[3 * t + 1]! * 3, index[3 * t + 2]! * 3];
    const e1 = [0, 1, 2].map((k) => positions[b + k]! - positions[a + k]!);
    const e2 = [0, 1, 2].map((k) => positions[c + k]! - positions[a + k]!);
    const p = [d[1]! * e2[2]! - d[2]! * e2[1]!, d[2]! * e2[0]! - d[0]! * e2[2]!, d[0]! * e2[1]! - d[1]! * e2[0]!];
    const det = e1[0]! * p[0]! + e1[1]! * p[1]! + e1[2]! * p[2]!;
    if (Math.abs(det) < 1e-14) continue;
    const s = [0, 1, 2].map((k) => o[k]! - positions[a + k]!);
    const u = (s[0]! * p[0]! + s[1]! * p[1]! + s[2]! * p[2]!) / det;
    if (u < 0 || u > 1) continue;
    const q = [s[1]! * e1[2]! - s[2]! * e1[1]!, s[2]! * e1[0]! - s[0]! * e1[2]!, s[0]! * e1[1]! - s[1]! * e1[0]!];
    const v = (d[0]! * q[0]! + d[1]! * q[1]! + d[2]! * q[2]!) / det;
    if (v < 0 || u + v > 1) continue;
    const dist = (e2[0]! * q[0]! + e2[1]! * q[1]! + e2[2]! * q[2]!) / det;
    if (dist >= 0 && dist < best) {
      best = dist;
      tri = t;
    }
  }
  return tri < 0 ? null : { distance: best, triangle: tri };
}

describe("picking through a bounding-volume hierarchy", () => {
  it("finds the same nearest triangle as testing every one, from the front and the back", () => {
    const { positions, uvs, index } = sheet(60);
    const bvh = buildPickBvh(positions, index, uvs);
    let hits = 0;
    let seed = 7;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let k = 0; k < 400; k++) {
      const back = k % 2 === 1;
      const o = [rand() - 0.5, rand() - 0.5, back ? -2 : 2];
      const target = [rand() * 0.9 - 0.45, rand() * 0.9 - 0.45, 0];
      const d = [target[0]! - o[0]!, target[1]! - o[1]!, target[2]! - o[2]!];
      const fast = pickBvh(bvh, o, d);
      const slow = brute(positions, index, o, d);
      expect(fast === null).toBe(slow === null);
      if (!fast || !slow) continue;
      hits++;
      expect(fast.distance).toBeCloseTo(slow.distance, 5);
      expect(fast.uv!.x).toBeGreaterThanOrEqual(0);
      expect(fast.uv!.x).toBeLessThanOrEqual(1);
    }
    expect(hits).toBeGreaterThan(300);
  }, 60_000);

  it("gives the UV at the hit, and nothing for a ray that misses", () => {
    const { positions, uvs, index } = sheet(4);
    const flat = new Float32Array(positions);
    for (let k = 2; k < flat.length; k += 3) flat[k] = 0;
    const bvh = buildPickBvh(flat, index, uvs);
    const hit = pickBvh(bvh, [0.25, -0.1, 1], [0, 0, -1])!;
    expect(hit.uv!.x).toBeCloseTo(0.75, 5);
    expect(hit.uv!.y).toBeCloseTo(0.4, 5);
    expect(hit.distance).toBeCloseTo(1, 5);
    expect(pickBvh(bvh, [3, 3, 1], [0, 0, -1])).toBeNull();
    expect(pickBvh(buildPickBvh(new Float32Array(0), [], null), [0, 0, 1], [0, 0, -1])).toBeNull();
  });
});
