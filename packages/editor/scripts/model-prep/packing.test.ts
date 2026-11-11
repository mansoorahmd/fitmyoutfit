import { describe, expect, it } from "vitest";
import { DEFAULT_PACK_OPTIONS, packPieces, TEXTURE_BLEED_UV, type PackInput, type UvRect } from "./packing";

// The stand-in T-shirt's pieces (mm), as traced from its source model.
const TSHIRT: PackInput[] = [
  { id: "front", width: 520.37, height: 712.64 },
  { id: "back", width: 522.2, height: 738.74 },
  { id: "sleeve_left", width: 417.8, height: 182.71 },
  { id: "sleeve_right", width: 417.8, height: 182.71 },
  { id: "neck_band_back", width: 196.3, height: 26.01 },
  { id: "neck_band_left", width: 164.2, height: 26 },
  { id: "neck_band_right", width: 164.2, height: 26 },
];

/** Distance between two rectangles (0 when they touch or overlap). */
function separation(a: UvRect, b: UvRect): number {
  const dx = Math.max(0, b.x - (a.x + a.width), a.x - (b.x + b.width));
  const dy = Math.max(0, b.y - (a.y + a.height), a.y - (b.y + b.height));
  return Math.hypot(dx, dy);
}

describe("packPieces", () => {
  it("uses one scale for every piece, so a millimetre is the same in the texture on every piece", () => {
    const { scale, rects } = packPieces(TSHIRT);
    for (const piece of TSHIRT) {
      const r = rects.get(piece.id)!;
      expect(r.width / piece.width).toBeCloseTo(scale, 12);
      expect(r.height / piece.height).toBeCloseTo(scale, 12);
    }
  });

  it("never overlaps two pieces and keeps the gap between them", () => {
    const { rects } = packPieces(TSHIRT);
    const list = [...rects.entries()];
    for (let a = 0; a < list.length; a++) {
      for (let b = a + 1; b < list.length; b++) {
        const gap = separation(list[a]![1], list[b]![1]);
        expect(gap, `${list[a]![0]} and ${list[b]![0]}`).toBeGreaterThanOrEqual(DEFAULT_PACK_OPTIONS.gap - 1e-12);
      }
    }
  });

  it("keeps the border to the texture's edges", () => {
    const { rects } = packPieces(TSHIRT);
    const b = DEFAULT_PACK_OPTIONS.border;
    for (const r of rects.values()) {
      expect(r.x).toBeGreaterThanOrEqual(b - 1e-12);
      expect(r.y).toBeGreaterThanOrEqual(b - 1e-12);
      expect(r.x + r.width).toBeLessThanOrEqual(1 - b + 1e-12);
      expect(r.y + r.height).toBeLessThanOrEqual(1 - b + 1e-12);
    }
  });

  it("leaves room for the bleed of both neighbours: a gap of two bleeds, a border of one", () => {
    // The texture drawing paints each piece 1/128 of the texture past its box (pattern-texture.ts: size / 128).
    expect(TEXTURE_BLEED_UV).toBe(1 / 128);
    expect(DEFAULT_PACK_OPTIONS.gap).toBe(2 * TEXTURE_BLEED_UV);
    expect(DEFAULT_PACK_OPTIONS.border).toBe(TEXTURE_BLEED_UV);
  });

  it("finds the largest scale: for the T-shirt, front and back side by side fill the width", () => {
    const { scale, rects } = packPieces(TSHIRT);
    // Width-bound: border, back, gap, front, border.
    const expected = (1 - 2 * DEFAULT_PACK_OPTIONS.border - DEFAULT_PACK_OPTIONS.gap) / (520.37 + 522.2);
    expect(scale).toBeLessThanOrEqual(expected);
    expect(scale / expected).toBeGreaterThan(0.999999);
    const right = Math.max(...[...rects.values()].map((r) => r.x + r.width));
    expect(right).toBeGreaterThan(1 - DEFAULT_PACK_OPTIONS.border - 1e-6);
  });

  it("scales a single piece to fill the space, keeping its proportions", () => {
    const { scale, rects } = packPieces([{ id: "a", width: 200, height: 100 }], { gap: 0, border: 0 });
    expect(scale).toBeCloseTo(1 / 200, 9);
    expect(rects.get("a")).toEqual({ x: 0, y: 0, width: expect.closeTo(1, 6), height: expect.closeTo(0.5, 6) });
  });

  it("refuses input it cannot pack", () => {
    expect(() => packPieces([])).toThrow(RangeError);
    expect(() => packPieces([{ id: "a", width: 0, height: 10 }])).toThrow(/no usable size/);
    expect(() => packPieces([{ id: "a", width: Number.NaN, height: 10 }])).toThrow(/no usable size/);
    expect(() => packPieces([{ id: "a", width: 1, height: 1 }, { id: "a", width: 1, height: 1 }])).toThrow(/twice/);
    expect(() => packPieces([{ id: "a", width: 1, height: 1 }], { gap: 0, border: 0.5 })).toThrow(/no room/);
  });
});
