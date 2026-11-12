import { describe, expect, it } from "vitest";
import { ciede2000, colourDifference, contrastRatio, hexToLab, hexToRgb, parseColourCode, relativeLuminance } from "./colour";

// G. Sharma, W. Wu, E. N. Dalal (2005), "The CIEDE2000 color-difference formula: implementation
// notes, supplementary test data, and mathematical observations", Table 1: all 34 pairs
// (L1, a1, b1, L2, a2, b2, ΔE00), published to 4 decimals.
const SHARMA_PAIRS: Array<[number, number, number, number, number, number, number]> = [
  [50.0, 2.6772, -79.7751, 50.0, 0.0, -82.7485, 2.0425],
  [50.0, 3.1571, -77.2803, 50.0, 0.0, -82.7485, 2.8615],
  [50.0, 2.8361, -74.02, 50.0, 0.0, -82.7485, 3.4412],
  [50.0, -1.3802, -84.2814, 50.0, 0.0, -82.7485, 1.0],
  [50.0, -1.1848, -84.8006, 50.0, 0.0, -82.7485, 1.0],
  [50.0, -0.9009, -85.5211, 50.0, 0.0, -82.7485, 1.0],
  [50.0, 0.0, 0.0, 50.0, -1.0, 2.0, 2.3669],
  [50.0, -1.0, 2.0, 50.0, 0.0, 0.0, 2.3669],
  [50.0, 2.49, -0.001, 50.0, -2.49, 0.0009, 7.1792],
  [50.0, 2.49, -0.001, 50.0, -2.49, 0.001, 7.1792],
  [50.0, 2.49, -0.001, 50.0, -2.49, 0.0011, 7.2195],
  [50.0, 2.49, -0.001, 50.0, -2.49, 0.0012, 7.2195],
  [50.0, -0.001, 2.49, 50.0, 0.0009, -2.49, 4.8045],
  [50.0, -0.001, 2.49, 50.0, 0.001, -2.49, 4.8045],
  [50.0, -0.001, 2.49, 50.0, 0.0011, -2.49, 4.7461],
  [50.0, 2.5, 0.0, 50.0, 0.0, -2.5, 4.3065],
  [50.0, 2.5, 0.0, 73.0, 25.0, -18.0, 27.1492],
  [50.0, 2.5, 0.0, 61.0, -5.0, 29.0, 22.8977],
  [50.0, 2.5, 0.0, 56.0, -27.0, -3.0, 31.903],
  [50.0, 2.5, 0.0, 58.0, 24.0, 15.0, 19.4535],
  [50.0, 2.5, 0.0, 50.0, 3.1736, 0.5854, 1.0],
  [50.0, 2.5, 0.0, 50.0, 3.2972, 0.0, 1.0],
  [50.0, 2.5, 0.0, 50.0, 1.8634, 0.5757, 1.0],
  [50.0, 2.5, 0.0, 50.0, 3.2592, 0.335, 1.0],
  [60.2574, -34.0099, 36.2677, 60.4626, -34.1751, 39.4387, 1.2644],
  [63.0109, -31.0961, -5.8663, 62.8187, -29.7946, -4.0864, 1.263],
  [61.2901, 3.7196, -5.3901, 61.4292, 2.248, -4.962, 1.8731],
  [35.0831, -44.1164, 3.7933, 35.0232, -40.0716, 1.5901, 1.8645],
  [22.7233, 20.0904, -46.694, 23.0331, 14.973, -42.5619, 2.0373],
  [36.4612, 47.858, 18.3852, 36.2715, 50.5065, 21.2231, 1.4146],
  [90.8027, -2.0831, 1.441, 91.1528, -1.6435, 0.0447, 1.4441],
  [90.9257, -0.5406, -0.9208, 88.6381, -0.8985, -0.7239, 1.5381],
  [6.7747, -0.2908, -2.4247, 5.8714, -0.0985, -2.2286, 0.6377],
  [2.0776, 0.0795, -1.135, 0.9033, -0.0636, -0.5514, 0.9082],
];

describe("ciede2000", () => {
  it("matches all 34 test pairs of Sharma, Wu and Dalal (2005) to their 4 published decimals", () => {
    SHARMA_PAIRS.forEach(([L1, a1, b1, L2, a2, b2, expected], k) => {
      const value = ciede2000({ L: L1, a: a1, b: b1 }, { L: L2, a: a2, b: b2 });
      expect(Math.abs(value - expected), `pair ${k + 1}: got ${value}, published ${expected}`).toBeLessThan(0.00006);
    });
  });

  it("is symmetric and zero for the same colour", () => {
    for (const [L1, a1, b1, L2, a2, b2] of SHARMA_PAIRS) {
      const p = { L: L1, a: a1, b: b1 };
      const q = { L: L2, a: a2, b: b2 };
      expect(ciede2000(p, q)).toBeCloseTo(ciede2000(q, p), 10);
      expect(ciede2000(p, p)).toBe(0);
    }
  });
});

describe("hexToLab", () => {
  // Bruce Lindbloom's calculator (sRGB, D65, http://www.brucelindbloom.com/ColorCalculator.html).
  it.each([
    ["#FFFFFF", 100, 0, 0],
    ["#000000", 0, 0, 0],
    ["#FF0000", 53.2408, 80.0925, 67.2032],
    ["#00FF00", 87.7347, -86.1827, 83.1793],
    ["#0000FF", 32.297, 79.1875, -107.8602],
    ["#808080", 53.585, 0, 0],
  ])("%s is L %f, a %f, b %f", (hex, L, a, b) => {
    const lab = hexToLab(hex);
    expect(lab.L).toBeCloseTo(L, 2);
    expect(lab.a).toBeCloseTo(a, 2);
    expect(lab.b).toBeCloseTo(b, 2);
  });

  it("gives a difference of 0 between a code and itself, and orders near and far colours", () => {
    expect(colourDifference("#1A5FB4", "#1a5fb4")).toBe(0);
    expect(colourDifference("#1A5FB4", "#1F4E9C")).toBeLessThan(colourDifference("#1A5FB4", "#C8102E"));
  });
});

describe("parseColourCode", () => {
  it("accepts 3 or 6 digits, with or without #, in any case, with spaces around", () => {
    expect(parseColourCode("#1A5FB4")).toBe("#1A5FB4");
    expect(parseColourCode("1a5fb4")).toBe("#1A5FB4");
    expect(parseColourCode("  #1a5fb4 ")).toBe("#1A5FB4");
    expect(parseColourCode("#1af")).toBe("#11AAFF");
    expect(parseColourCode("FFF")).toBe("#FFFFFF");
  });

  it.each(["", "#", "#12", "#1234", "#12345", "#1234567", "#GGGGGG", "1A5F B4", "##1A5FB4", "rgb(1,2,3)", "red", "#1A5FB4;"])(
    "refuses %j",
    (input) => expect(parseColourCode(input)).toBeNull(),
  );

  it("refuses what is not a string", () => {
    for (const input of [null, undefined, 0x1a5fb4, {}, []]) expect(parseColourCode(input)).toBeNull();
  });

  it("hexToRgb reads the channels and refuses a non-code", () => {
    expect(hexToRgb("#1A5FB4")).toEqual({ r: 0x1a, g: 0x5f, b: 0xb4 });
    expect(() => hexToRgb("blue")).toThrow(RangeError);
  });
});

describe("contrastRatio (WCAG 2.2)", () => {
  it("is 21 for black on white, 1 for a colour on itself, and symmetric", () => {
    expect(contrastRatio("#000000", "#FFFFFF")).toBeCloseTo(21, 6);
    expect(contrastRatio("#1B2A5C", "#1B2A5C")).toBe(1);
    expect(contrastRatio("#C8102E", "#FFFFFF")).toBeCloseTo(contrastRatio("#FFFFFF", "#C8102E"), 12);
  });

  it("matches known values: #777777 on white is 4.48, white on navy #1B2A5C passes 3:1, navy on navy does not", () => {
    expect(contrastRatio("#777777", "#FFFFFF")).toBeCloseTo(4.48, 2);
    expect(relativeLuminance("#FFFFFF")).toBe(1);
    expect(contrastRatio("#FFFFFF", "#1B2A5C")).toBeGreaterThan(3);
    expect(contrastRatio("#1B2A5C", "#1B2A5C")).toBeLessThan(3);
  });
});
