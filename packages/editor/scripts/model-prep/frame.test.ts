import { describe, expect, it } from "vitest";
import { applyFrame, pieceFrame } from "./frame";

// A quad on the garment seen from outside: vertices 0 top-left, 1 top-right, 2 bottom-right,
// 3 bottom-left as the viewer sees them, wound counter-clockwise for the viewer (0, 3, 2 and 0, 2, 1).
const indices = [0, 3, 2, 0, 2, 1];
const heights = [1, 1, 0, 0]; // top row higher on the garment

/** The shoelace sum of the triangles in piece coordinates (negative = not mirrored with Y down). */
function shoelace(points: Array<{ x: number; y: number }>): number {
  let sum = 0;
  for (let t = 0; t < indices.length; t += 3) {
    const [a, b, c] = [points[indices[t]!]!, points[indices[t + 1]!]!, points[indices[t + 2]!]!];
    sum += (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  }
  return sum;
}

describe("pieceFrame", () => {
  it("leaves an upright, unmirrored source alone (U right, V down as seen from outside)", () => {
    const uvs = [0, 0, 10, 0, 10, 20, 0, 20];
    expect(pieceFrame(uvs, heights, indices)).toEqual({ mirror: false, halfTurn: false });
  });

  it("mirrors a source drawn as seen from the inside", () => {
    const uvs = [10, 0, 0, 0, 0, 20, 10, 20];
    const frame = pieceFrame(uvs, heights, indices);
    expect(frame).toEqual({ mirror: true, halfTurn: false });
    const points = [0, 1, 2, 3].map((v) => applyFrame(frame, uvs[v * 2]!, uvs[v * 2 + 1]!));
    expect(shoelace(points)).toBeLessThan(0);
    // The top-left vertex is now left of the top-right one, and above the bottom row.
    expect(points[0]!.x).toBeLessThan(points[1]!.x);
    expect(points[0]!.y).toBeLessThan(points[3]!.y);
  });

  it("turns an upside-down source half round", () => {
    const uvs = [10, 20, 0, 20, 0, 0, 10, 0];
    const frame = pieceFrame(uvs, heights, indices);
    expect(frame).toEqual({ mirror: false, halfTurn: true });
    const points = [0, 1, 2, 3].map((v) => applyFrame(frame, uvs[v * 2]!, uvs[v * 2 + 1]!));
    expect(points[0]!.x).toBeLessThan(points[1]!.x);
    expect(points[0]!.y).toBeLessThan(points[3]!.y);
    expect(shoelace(points)).toBeLessThan(0);
  });

  it("never scales: distances between points stay the same", () => {
    const frame = { mirror: true, halfTurn: true };
    const a = applyFrame(frame, 3, 4);
    const b = applyFrame(frame, 0, 0);
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBe(5);
  });
});
