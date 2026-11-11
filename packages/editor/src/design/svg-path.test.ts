import { describe, expect, it } from "vitest";
import {
  CURVE_SEGMENTS,
  distanceToPolylines,
  flattenPath,
  parseSvgPath,
  parseSvgPathOrThrow,
  pointInPolylines,
  polylineBounds,
  traceSvgPath,
  type PathCommand,
} from "./svg-path";

const commands = (d: string): PathCommand[] => {
  const result = parseSvgPath(d);
  if (!result.ok) throw new Error(result.error);
  return result.commands;
};
const error = (d: unknown): string => {
  const result = parseSvgPath(d);
  if (result.ok) throw new Error(`expected "${String(d)}" to be refused`);
  return result.error;
};

describe("parseSvgPath", () => {
  it("reads absolute commands", () => {
    expect(commands("M 0 0 L 10 0 L 10 5 Z")).toEqual([
      { type: "M", x: 0, y: 0 },
      { type: "L", x: 10, y: 0 },
      { type: "L", x: 10, y: 5 },
      { type: "Z" },
    ]);
  });

  it("turns H, V and relative commands into absolute line-tos", () => {
    expect(commands("M10 10 h5 v5 H0 V0 l1 1 z")).toEqual([
      { type: "M", x: 10, y: 10 },
      { type: "L", x: 15, y: 10 },
      { type: "L", x: 15, y: 15 },
      { type: "L", x: 0, y: 15 },
      { type: "L", x: 0, y: 0 },
      { type: "L", x: 1, y: 1 },
      { type: "Z" },
    ]);
  });

  it("treats extra pairs after a move as line-tos, and repeats other commands", () => {
    expect(commands("M0 0 10 0 10 10")).toEqual([
      { type: "M", x: 0, y: 0 },
      { type: "L", x: 10, y: 0 },
      { type: "L", x: 10, y: 10 },
    ]);
    expect(commands("m1 1 2 0 0 2")).toEqual([
      { type: "M", x: 1, y: 1 },
      { type: "L", x: 3, y: 1 },
      { type: "L", x: 3, y: 3 },
    ]);
    expect(commands("M0 0 L1 1 2 2")).toHaveLength(3);
  });

  it("reads cubic and quadratic curves, absolute and relative", () => {
    expect(commands("M0 0 C1 2 3 4 5 6 c1 1 2 2 3 3 Q 1 1 2 2 q1 0 1 1")).toEqual([
      { type: "M", x: 0, y: 0 },
      { type: "C", x1: 1, y1: 2, x2: 3, y2: 4, x: 5, y: 6 },
      { type: "C", x1: 6, y1: 7, x2: 7, y2: 8, x: 8, y: 9 },
      { type: "Q", x1: 1, y1: 1, x: 2, y: 2 },
      { type: "Q", x1: 3, y1: 2, x: 3, y: 3 },
    ]);
  });

  it("reads compact number forms: signs as separators, exponents, leading dots, commas", () => {
    expect(commands("M-1-2L.5.5L1e1,2E-1")).toEqual([
      { type: "M", x: -1, y: -2 },
      { type: "L", x: 0.5, y: 0.5 },
      { type: "L", x: 10, y: 0.2 },
    ]);
  });

  it("goes back to the subpath start after Z, for a following relative move", () => {
    expect(commands("M10 10 L20 10 Z m5 0 l1 0")).toEqual([
      { type: "M", x: 10, y: 10 },
      { type: "L", x: 20, y: 10 },
      { type: "Z" },
      { type: "M", x: 15, y: 10 },
      { type: "L", x: 16, y: 10 },
    ]);
  });

  it("refuses arcs and the smooth shorthands with a readable message", () => {
    expect(error("M0 0 A 5 5 0 0 1 10 0")).toMatch(/command 'A' .* is not supported \(use M, L, H, V, C, Q and Z\)/);
    expect(error("M0 0 S 1 1 2 2")).toMatch(/'S'/);
    expect(error("M0 0 T 2 2")).toMatch(/'T'/);
  });

  it("refuses paths that do not start with a move, or draw after Z without a move", () => {
    expect(error("L 1 1")).toMatch(/must start with a move command \(M\), found 'L'/);
    expect(error("10 10")).toMatch(/must start with a move command/);
    expect(error("M0 0 L1 0 Z L 2 2")).toMatch(/follows a close \(Z\); start the next shape with a move \(M\)/);
    expect(error("M0 0 Z 5 5")).toMatch(/after a close command/);
  });

  it("refuses missing numbers, empty input, non-strings and very long input", () => {
    expect(error("M 0")).toMatch(/needs 2 numbers/);
    expect(error("M 0 0 C 1 2 3")).toMatch(/'C' .* needs 6 numbers/);
    expect(error("")).toMatch(/empty/);
    expect(error("   ")).toMatch(/empty/);
    expect(error(42)).toMatch(/must be a string/);
    expect(error(null)).toMatch(/must be a string/);
    expect(error("M0 0" + " L1 1".repeat(5000))).toMatch(/longer than/);
    expect(error("M 0 0 L 1 x")).toMatch(/needs 2 numbers/);
  });

  it("parseSvgPathOrThrow throws a RangeError for bad data", () => {
    expect(() => parseSvgPathOrThrow("M0 0 A1 1 0 0 0 1 1")).toThrow(RangeError);
    expect(parseSvgPathOrThrow("M0 0 L1 1")).toHaveLength(2);
  });
});

describe("flattening and hit-testing", () => {
  const square = flattenPath(commands("M0 0 H10 V10 H0 Z"));

  it("flattens straight paths to their points and marks closed subpaths", () => {
    expect(square).toEqual([
      {
        points: [
          { x: 0, y: 0 },
          { x: 10, y: 0 },
          { x: 10, y: 10 },
          { x: 0, y: 10 },
        ],
        closed: true,
      },
    ]);
  });

  it("flattens curves into a fixed number of segments that end on the curve's end point", () => {
    const [line] = flattenPath(commands("M0 0 Q 5 10 10 0"));
    expect(line!.points).toHaveLength(1 + CURVE_SEGMENTS);
    expect(line!.points.at(-1)).toEqual({ x: 10, y: 0 });
    // The quadratic's peak is half way to its control point.
    const peak = Math.max(...line!.points.map((p) => p.y));
    expect(peak).toBeCloseTo(5, 5);
    const [cubic] = flattenPath(commands("M0 0 C 0 10 10 10 10 0"));
    expect(Math.max(...cubic!.points.map((p) => p.y))).toBeCloseTo(7.5, 5);
  });

  it("tests points with the non-zero rule, like the canvas fills them", () => {
    expect(pointInPolylines(square, { x: 5, y: 5 })).toBe(true);
    expect(pointInPolylines(square, { x: 15, y: 5 })).toBe(false);
    expect(pointInPolylines(square, { x: -0.01, y: 5 })).toBe(false);
    // Two separate squares in one path: both are inside.
    const two = flattenPath(commands("M0 0 H10 V10 H0 Z M20 0 H30 V10 H20 Z"));
    expect(pointInPolylines(two, { x: 25, y: 5 })).toBe(true);
    expect(pointInPolylines(two, { x: 15, y: 5 })).toBe(false);
    // A hole drawn the other way round is cut out (non-zero rule).
    const holed = flattenPath(commands("M0 0 H10 V10 H0 Z M3 3 V7 H7 V3 Z"));
    expect(pointInPolylines(holed, { x: 5, y: 5 })).toBe(false);
    expect(pointInPolylines(holed, { x: 1, y: 1 })).toBe(true);
    // An unclosed subpath is filled as if closed.
    expect(pointInPolylines(flattenPath(commands("M0 0 H10 V10")), { x: 8, y: 2 })).toBe(true);
  });

  it("measures distance to the edges and the bounding box", () => {
    expect(distanceToPolylines(square, { x: 5, y: 5 })).toBeCloseTo(5);
    expect(distanceToPolylines(square, { x: 13, y: 14 })).toBeCloseTo(5);
    expect(polylineBounds(square)).toEqual({ minX: 0, minY: 0, maxX: 10, maxY: 10 });
    expect(polylineBounds([])).toBeNull();
  });

  it("replays commands onto a canvas-like sink", () => {
    const calls: string[] = [];
    const sink = {
      moveTo: (x: number, y: number) => calls.push(`M${x},${y}`),
      lineTo: (x: number, y: number) => calls.push(`L${x},${y}`),
      bezierCurveTo: (...a: number[]) => calls.push(`C${a.join(",")}`),
      quadraticCurveTo: (...a: number[]) => calls.push(`Q${a.join(",")}`),
      closePath: () => calls.push("Z"),
    };
    traceSvgPath(sink, commands("M0 0 h1 C1 2 3 4 5 6 Q7 8 9 10 z"));
    expect(calls).toEqual(["M0,0", "L1,0", "C1,2,3,4,5,6", "Q7,8,9,10", "Z"]);
  });
});
