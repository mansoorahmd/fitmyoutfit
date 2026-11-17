/** E3d, 07-editor-review 4.5: the selection box's drawing rule (R31 to R35). */
import { describe, expect, it } from "vitest";
import { BOX_OUTSET, MIN_BOX, boundsOf, clipRunsOutside, cornerHit, ensureMinBox, insideQuad, outsetQuad, selectionFrame, type Rect } from "./selection-box";
import type { Pt } from "./handles";

const rect = (x: number, y: number, w: number, h: number): Pt[] => [
  { x, y },
  { x: x + w, y },
  { x: x + w, y: y + h },
  { x, y: y + h },
];
const intersects = (a: Rect, b: Rect) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
/** A handle's visible square (14 px). */
const handleSquare = (c: Pt): Rect => ({ x: c.x - 7, y: c.y - 7, width: 14, height: 14 });
const circleHits = (c: Pt, r: number, b: Rect) => {
  const dx = Math.max(b.x - c.x, 0, c.x - (b.x + b.width));
  const dy = Math.max(b.y - c.y, 0, c.y - (b.y + b.height));
  return dx * dx + dy * dy < r * r;
};

describe("R31: four straight lines between four corners", () => {
  it("the frame has exactly four corners, and the handles are those corners", () => {
    const f = selectionFrame(rect(100, 100, 300, 40), { x: 250, y: 120 });
    expect(f.corners).toHaveLength(4);
  });
});

describe("R32: outset 8 px; handles never on the item", () => {
  it("each edge moves out by 8 px (an upright box grows 8 on every side)", () => {
    const out = outsetQuad(rect(100, 100, 300, 40), BOX_OUTSET);
    expect(boundsOf(out)).toEqual({ x: 92, y: 92, width: 316, height: 56 });
  });
  it("a turned (and a perspective-skewed) box keeps every edge 8 px out, and no handle square touches the item", () => {
    const turned = [
      { x: 200, y: 80 },
      { x: 380, y: 140 },
      { x: 360, y: 200 },
      { x: 180, y: 140 },
    ];
    const f = selectionFrame(turned, { x: 280, y: 140 });
    const item = boundsOf(turned);
    for (const c of f.corners) expect(insideQuad(c, turned, 0)).toBe(false);
    // Each handle square is outside the item's quad (sampled on its corners and centre).
    for (const c of f.corners) for (const p of [c, { x: c.x - 7, y: c.y - 7 }, { x: c.x + 7, y: c.y + 7 }, { x: c.x - 7, y: c.y + 7 }, { x: c.x + 7, y: c.y - 7 }]) expect(insideQuad(p, turned, 0)).toBe(false);
    expect(item.width).toBeGreaterThan(0);
  });
  it("text that fills its box: the corner squares stay off the first and last letters", () => {
    const text = rect(100, 100, 300, 40);
    const f = selectionFrame(text, { x: 250, y: 120 });
    for (const c of f.corners) expect(intersects(handleSquare(c), boundsOf(text))).toBe(false);
  });
  it("a small item gets a box of at least 44 px a side, about its centre", () => {
    const logo = rect(200, 200, 20, 20);
    const f = selectionFrame(logo, { x: 210, y: 210 });
    const b = boundsOf(f.corners);
    expect(b.width).toBeGreaterThanOrEqual(MIN_BOX - 0.01);
    expect(b.height).toBeGreaterThanOrEqual(MIN_BOX - 0.01);
    expect(b.x + b.width / 2).toBeCloseTo(210, 5);
    for (const c of f.corners) expect(intersects(handleSquare(c), boundsOf(logo))).toBe(false);
  });
  it("a box seen edge-on still gets a box", () => {
    const flat = [
      { x: 10, y: 10 },
      { x: 50, y: 10 },
      { x: 50, y: 10 },
      { x: 10, y: 10 },
    ];
    expect(ensureMinBox(outsetQuad(flat, 8), { x: 30, y: 10 }, 44)).toHaveLength(4);
  });
});

describe("R33, R34: the turn handle", () => {
  it("is above the top edge's middle by default, and its hit circle never overlaps a corner's hit area", () => {
    for (const w of [20, 44, 80, 300]) {
      const f = selectionFrame(rect(100, 300, w, 40), { x: 100 + w / 2, y: 320 });
      expect(f.turnPlace).toBe("top");
      expect(f.turn.y).toBeLessThan(f.stemFrom.y);
      for (const c of f.corners) expect(circleHits(f.turn, 22, cornerHit(c)), `width ${w}`).toBe(false);
    }
  });
  it("moves below the box when it would land on another item (the number under the player's name)", () => {
    const number = rect(200, 200, 200, 150);
    const name: Rect = { x: 190, y: 120, width: 220, height: 60 };
    const f = selectionFrame(number, { x: 300, y: 275 }, [name]);
    expect(f.turnPlace).toBe("bottom");
    expect(circleHits(f.turn, 22, name)).toBe(false);
  });
  it("moves to the end side when the top and the bottom are both blocked (the top row, another item)", () => {
    const item = rect(200, 60, 100, 60);
    const topRow: Rect = { x: 0, y: 0, width: 1000, height: 40 };
    const below: Rect = { x: 150, y: 140, width: 200, height: 80 };
    const f = selectionFrame(item, { x: 250, y: 90 }, [topRow, below]);
    expect(f.turnPlace).toBe("end");
    expect(f.turn.x).toBeGreaterThan(300);
  });
});

describe("R35: guides not inside the moved item's box", () => {
  it("a centre line through the box is cut where it enters, with a 4 px gap", () => {
    const box = rect(100, 100, 200, 40);
    const runs = clipRunsOutside([[{ x: 200, y: 0 }, { x: 200, y: 300 }]], box, 4);
    expect(runs).toHaveLength(2);
    for (const run of runs) for (const p of run) expect(insideQuad(p, box, 4)).toBe(false);
    expect(Math.max(...runs[0]!.map((p) => p.y))).toBeLessThanOrEqual(96);
    expect(Math.min(...runs[1]!.map((p) => p.y))).toBeGreaterThanOrEqual(144);
  });
  it("a guide that misses the box is kept whole", () => {
    const runs = clipRunsOutside([[{ x: 400, y: 0 }, { x: 400, y: 300 }]], rect(100, 100, 200, 40), 4);
    expect(runs).toHaveLength(1);
  });
});
