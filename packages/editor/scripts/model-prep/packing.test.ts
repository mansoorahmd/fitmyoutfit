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

// The stand-in jersey's pieces (mm): two large body pieces and many thin trims and strips.
const JERSEY: PackInput[] = [
  { id: "front", width: 670.89, height: 717.98 },
  { id: "back", width: 491.44, height: 719.7 },
  { id: "sleeve_left", width: 371.23, height: 212.19 },
  { id: "sleeve_right", width: 371.23, height: 212.19 },
  { id: "side_panel_left", width: 151.48, height: 330.42 },
  { id: "side_panel_right", width: 151.48, height: 330.42 },
  { id: "collar", width: 473.89, height: 12.92 },
  { id: "collar_strip", width: 460.97, height: 2.59 },
  { id: "collar_stripe", width: 458.39, height: 5.17 },
  { id: "cuff_left", width: 319.53, height: 35.3 },
  { id: "cuff_right", width: 319.53, height: 35.29 },
  { id: "sleeve_strip_left", width: 312.42, height: 24.81 },
  { id: "sleeve_strip_right", width: 312.42, height: 24.81 },
  { id: "cuff_stripe_left", width: 311, height: 27.37 },
  { id: "cuff_stripe_right", width: 311, height: 27.37 },
  { id: "side_strip_left_1", width: 114.47, height: 202.07 },
  { id: "side_strip_left_2", width: 68.56, height: 120.4 },
  { id: "side_strip_right_1", width: 114.47, height: 202.07 },
  { id: "side_strip_right_2", width: 68.56, height: 120.4 },
  { id: "side_stripe_left_1", width: 80.06, height: 145.53 },
  { id: "side_stripe_left_2", width: 71.31, height: 126.55 },
  { id: "side_stripe_left_3", width: 67.15, height: 128.43 },
  { id: "side_stripe_left_4", width: 57.74, height: 115.8 },
  { id: "side_stripe_right_1", width: 80.06, height: 145.53 },
  { id: "side_stripe_right_2", width: 71.31, height: 126.55 },
  { id: "side_stripe_right_3", width: 67.15, height: 128.43 },
  { id: "side_stripe_right_4", width: 57.74, height: 115.8 },
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

  describe("skyline packing (the jersey: many thin trims)", () => {
    const skyline = { ...DEFAULT_PACK_OPTIONS, method: "skyline" as const };

    it("keeps one scale, no overlap, the gap and the border", () => {
      const { scale, rects } = packPieces(JERSEY, skyline);
      const list = [...rects.entries()];
      expect(list).toHaveLength(JERSEY.length);
      for (const piece of JERSEY) {
        const r = rects.get(piece.id)!;
        expect(r.width / piece.width).toBeCloseTo(scale, 12);
        expect(r.height / piece.height).toBeCloseTo(scale, 12);
        expect(r.x).toBeGreaterThanOrEqual(DEFAULT_PACK_OPTIONS.border - 1e-12);
        expect(r.y).toBeGreaterThanOrEqual(DEFAULT_PACK_OPTIONS.border - 1e-12);
        expect(r.x + r.width).toBeLessThanOrEqual(1 - DEFAULT_PACK_OPTIONS.border + 1e-12);
        expect(r.y + r.height).toBeLessThanOrEqual(1 - DEFAULT_PACK_OPTIONS.border + 1e-12);
      }
      for (let a = 0; a < list.length; a++) {
        for (let b = a + 1; b < list.length; b++) {
          expect(separation(list[a]![1], list[b]![1]), `${list[a]![0]} and ${list[b]![0]}`).toBeGreaterThanOrEqual(DEFAULT_PACK_OPTIONS.gap - 1e-12);
        }
      }
    });

    it("fits the jersey at a larger scale than the shelves: 1.576 against 1.475 texture pixels per mm at 2048", () => {
      const shelf = packPieces(JERSEY).scale;
      const sky = packPieces(JERSEY, skyline).scale;
      expect(shelf * 2048).toBeCloseTo(1.475, 3);
      expect(sky * 2048).toBeCloseTo(1.576, 3);
      expect(packPieces(JERSEY, { ...DEFAULT_PACK_OPTIONS, method: "best" }).scale).toBe(sky);
    });

    it("with 'best', keeps the shelves where they are better or equal", () => {
      expect(packPieces(TSHIRT, { ...DEFAULT_PACK_OPTIONS, method: "best" }).scale).toBe(packPieces(TSHIRT).scale);
    });
  });

  it("packs with the shelf method unless asked otherwise (the T-shirt's committed layout depends on it)", () => {
    expect(packPieces(TSHIRT).scale).toBe(packPieces(TSHIRT, { ...DEFAULT_PACK_OPTIONS, method: "shelf" }).scale);
    expect(packPieces(TSHIRT).scale).toBe(0.000929194202);
  });

  it("refuses input it cannot pack", () => {
    expect(() => packPieces([])).toThrow(RangeError);
    expect(() => packPieces([{ id: "a", width: 0, height: 10 }])).toThrow(/no usable size/);
    expect(() => packPieces([{ id: "a", width: Number.NaN, height: 10 }])).toThrow(/no usable size/);
    expect(() => packPieces([{ id: "a", width: 1, height: 1 }, { id: "a", width: 1, height: 1 }])).toThrow(/twice/);
    expect(() => packPieces([{ id: "a", width: 1, height: 1 }], { gap: 0, border: 0.5 })).toThrow(/no room/);
  });
});
