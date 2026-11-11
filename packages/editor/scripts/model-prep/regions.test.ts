import { describe, expect, it } from "vitest";
import { parseSvgPath, flattenPath, pointInPolylines } from "../../src/design/svg-path";
import { rowExtent } from "./outline";
import { BAND_CORNER_MM, BAND_OVERSHOOT_MM, edgeBand, edgeBandPath, hemRange, underarmY } from "./regions";

// A body piece (mm, Y down), shaped like the stand-in's back: the shoulder ends at x = 0
// (as far out as the side seam), the armhole curves in to x = 30 and comes back out to the
// underarm at (0, 280); the side seam runs down to the hem at y = 700.
const body = [
  { x: 150, y: 0 },
  { x: 370, y: 0 },
  { x: 500, y: 55 },
  { x: 470, y: 150 },
  { x: 470, y: 230 },
  { x: 500, y: 280 },
  { x: 495, y: 500 },
  { x: 500, y: 700 },
  { x: 0, y: 700 },
  { x: 5, y: 500 },
  { x: 0, y: 280 },
  { x: 30, y: 230 },
  { x: 30, y: 150 },
  { x: 0, y: 55 },
];

// A sleeve: cap on top, slanted short sides, a straight hem at y = 180 from x = 25 to x = 395.
const sleeve = [
  { x: 0, y: 100 },
  { x: 210, y: 0 },
  { x: 420, y: 100 },
  { x: 395, y: 180 },
  { x: 25, y: 180 },
];

const inside = (polygon: Array<{ x: number; y: number }>, p: { x: number; y: number }) => pointInPolylines([{ points: polygon, closed: true }], p);

describe("underarmY", () => {
  it("finds where the side seam meets the armhole, even when the shoulder reaches as far out", () => {
    expect(underarmY(body, "left")).toBeCloseTo(280, 0);
    expect(underarmY(body, "right")).toBeCloseTo(280, 0);
  });
});

describe("edgeBand, left and right", () => {
  const band = edgeBand(body, { edge: "left", width: 70 });

  it("starts at the underarm and runs past the bottom", () => {
    const ys = band.map((p) => p.y);
    expect(Math.min(...ys)).toBeCloseTo(280, 0);
    expect(Math.max(...ys)).toBe(700 + BAND_OVERSHOOT_MM);
  });

  it("follows the side seam at the band's width", () => {
    for (const y of [300, 400, 500, 600]) {
      const seam = rowExtent(body, y)!.left;
      expect(inside(band, { x: seam + 69, y })).toBe(true);
      expect(inside(band, { x: seam + 71, y })).toBe(false);
    }
  });

  it("covers the piece's edge (and a little past it), never the armhole above", () => {
    expect(inside(band, { x: -BAND_OVERSHOOT_MM + 1, y: 400 })).toBe(true);
    expect(inside(band, { x: 40, y: 200 })).toBe(false);
  });

  it("goes straight down for the last few millimetres, so a rounded hem corner does not bend it", () => {
    const lastFollowed = band.find((p) => p.x > 0 && Math.abs(p.y - (700 - BAND_CORNER_MM)) < 1e-9)!;
    const below = band.filter((p) => p.x > 0 && p.y > 700 - BAND_CORNER_MM);
    expect(below.length).toBeGreaterThan(0);
    for (const p of below) expect(p.x).toBe(lastFollowed.x);
  });

  it("mirrors on the right", () => {
    const right = edgeBand(body, { edge: "right", width: 70 });
    expect(inside(right, { x: 500 - 69, y: 600 })).toBe(true);
    expect(inside(right, { x: 500 - 75, y: 600 })).toBe(false);
  });

  it("can start at a given height", () => {
    const fromTop = edgeBand(body, { edge: "left", width: 50, from: 400 });
    expect(Math.min(...fromTop.map((p) => p.y))).toBe(400);
  });
});

describe("edgeBand, bottom", () => {
  it("finds the hem: the flat part of the bottom edge", () => {
    expect(hemRange(sleeve, 35)).toEqual({ from: 25, to: 395 });
  });

  it("is the hem moved up by the band's width, and runs on level past the hem's ends", () => {
    const band = edgeBand(sleeve, { edge: "bottom", width: 35 });
    expect(inside(band, { x: 200, y: 146 })).toBe(true);
    expect(inside(band, { x: 200, y: 144 })).toBe(false);
    // Beyond the hem's ends the band's top stays at 145 instead of climbing the slanted sides.
    expect(inside(band, { x: 10, y: 146 })).toBe(true);
    expect(inside(band, { x: 10, y: 140 })).toBe(false);
  });

  it("writes the band as one closed path of straight lines", () => {
    const parsed = parseSvgPath(edgeBandPath(sleeve, { edge: "bottom", width: 35 }));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(flattenPath(parsed.commands)).toHaveLength(1);
    expect(new Set(parsed.commands.map((c) => c.type))).toEqual(new Set(["M", "L", "Z"]));
  });

  it("refuses an outline with no flat bottom edge, and a band with no width", () => {
    const diamond = [{ x: 0, y: 50 }, { x: 50, y: 0 }, { x: 100, y: 50 }, { x: 50, y: 100 }];
    expect(() => edgeBand(diamond, { edge: "bottom", width: 10 })).toThrow(/no bottom edge/);
    expect(() => edgeBand(sleeve, { edge: "bottom", width: 0 })).toThrow(/positive width/);
  });
});
