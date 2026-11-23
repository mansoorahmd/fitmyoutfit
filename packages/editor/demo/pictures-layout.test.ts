import { describe, expect, it } from "vitest";
import { PICTURE_FILL, PICTURE_GARMENTS, PICTURE_SIZE, alphaBox, layoutPictures, pictureFileName, qualitySteps } from "./pictures-layout";

describe("pictureFileName", () => {
  it("names a picture by garment and side", () => {
    expect(pictureFileName("jersey-vneck", "front")).toBe("jersey-vneck-front.webp");
    expect(pictureFileName("tshirt", "back")).toBe("tshirt-back.webp");
  });
  it("gives the six files the store expects", () => {
    const names = PICTURE_GARMENTS.flatMap((g) => (["front", "back"] as const).map((s) => pictureFileName(g.name, s)));
    expect(names).toEqual(["jersey-vneck-front.webp", "jersey-vneck-back.webp", "jersey-round-front.webp", "jersey-round-back.webp", "tshirt-front.webp", "tshirt-back.webp"]);
  });
});

describe("alphaBox", () => {
  it("finds the box of the opaque pixels", () => {
    const w = 6;
    const h = 5;
    const data = new Uint8ClampedArray(w * h * 4);
    for (const [x, y] of [[1, 1], [3, 2]] as const) data[(y * w + x) * 4 + 3] = 255;
    expect(alphaBox(data, w, h)).toEqual({ left: 1, top: 1, right: 4, bottom: 3 });
  });
  it("ignores almost transparent pixels and returns null for an empty image", () => {
    const data = new Uint8ClampedArray(4 * 4 * 4);
    data[3] = 3;
    expect(alphaBox(data, 4, 4)).toBeNull();
  });
});

describe("layoutPictures", () => {
  it("fills the fill share of the height with the tallest garment, centred", () => {
    const { scale, placements } = layoutPictures([{ left: 100, top: 200, right: 900, bottom: 1000 }], 1800);
    expect(scale).toBeCloseTo((PICTURE_FILL * PICTURE_SIZE) / 800);
    const p = placements[0]!;
    expect(p.x + ((100 + 900) / 2) * scale).toBeCloseTo(PICTURE_SIZE / 2);
    expect(p.y + ((200 + 1000) / 2) * scale).toBeCloseTo(PICTURE_SIZE / 2);
    expect(p.width).toBeCloseTo(1800 * scale);
  });
  it("uses one scale for the set", () => {
    const { placements } = layoutPictures(
      [
        { left: 0, top: 0, right: 500, bottom: 1000 },
        { left: 0, top: 0, right: 500, bottom: 800 },
      ],
      1800,
    );
    expect(placements[0]!.width).toBe(placements[1]!.width);
  });
  it("keeps a wide garment off the edge", () => {
    const { scale } = layoutPictures([{ left: 0, top: 0, right: 1000, bottom: 500 }], 1800);
    expect(1000 * scale).toBeLessThanOrEqual(PICTURE_SIZE * 0.92 + 1e-6);
  });
  it("refuses an empty set", () => {
    expect(() => layoutPictures([], 1800)).toThrow();
  });
});

describe("qualitySteps", () => {
  it("goes down from the start to the floor", () => {
    const steps = [...qualitySteps()];
    expect(steps[0]).toBe(0.92);
    expect(steps.at(-1)!).toBeGreaterThanOrEqual(0.5);
    expect(steps.every((q, i) => i === 0 || q < steps[i - 1]!)).toBe(true);
  });
});
