import { describe, expect, it } from "vitest";
import { buildSizeTable, looksLikeSize, normalizeSize, readSize, sizeKey } from "./sizes.js";

const SIZES = ["YS", "YM", "YL", "YXL", "XS", "S", "M", "L", "XL", "2XL", "3XL"];
const table = buildSizeTable(SIZES);

describe("size words (08-team-list.md, 4.5)", () => {
  it.each([
    ["ys", "YS"], ["y s", "YS"], ["y-s", "YS"], ["youth s", "YS"], ["youth small", "YS"], ["yth s", "YS"],
    ["ym", "YM"], ["youth m", "YM"], ["youth medium", "YM"],
    ["yl", "YL"], ["youth l", "YL"], ["youth large", "YL"],
    ["yxl", "YXL"], ["youth xl", "YXL"],
    ["xs", "XS"], ["x-small", "XS"], ["extra small", "XS"],
    ["s", "S"], ["sm", "S"], ["small", "S"],
    ["m", "M"], ["med", "M"], ["medium", "M"],
    ["l", "L"], ["lg", "L"], ["large", "L"],
    ["xl", "XL"], ["x-large", "XL"], ["extra large", "XL"],
    ["2xl", "2XL"], ["xxl", "2XL"], ["2x", "2XL"], ["xx-large", "2XL"],
    ["3xl", "3XL"], ["xxxl", "3XL"], ["3x", "3XL"],
    ["XL", "XL"], ["Xl", "XL"], [" xl ", "XL"],
  ])("%s means %s", (typed, code) => {
    expect(readSize(typed, table)).toBe(code);
  });

  it("does not guess from a partial word: x alone is not XL", () => {
    for (const typed of ["x", "ex", "xx", "4xl", "", "mm", "medi"]) expect(readSize(typed, table)).toBeNull();
  });

  it("a product brings its own sizes and words", () => {
    const own = buildSizeTable([{ code: "ADULT", words: ["men", "mens"] }, "KIDS"]);
    expect(readSize("mens", own)).toBe("ADULT");
    expect(readSize("kids", own)).toBe("KIDS");
    expect(readSize("M", own)).toBeNull();
  });

  it("a size the product lacks is not read as another size", () => {
    const small = buildSizeTable(["S", "M", "L"]);
    expect(readSize("xl", small)).toBeNull();
    expect(readSize("2xl", small)).toBeNull();
  });

  it("the first product size to claim a spelling keeps it, and a code always means itself", () => {
    const both = buildSizeTable([{ code: "A", words: ["x"] }, { code: "B", words: ["x", "a"] }]);
    expect(readSize("x", both)).toBe("A");
    expect(readSize("a", both)).toBe("A");
  });

  it("larger sizes get their x forms", () => {
    const big = buildSizeTable(["4XL", "5XL"]);
    expect(readSize("xxxx-large", big)).toBe("4XL");
    expect(readSize("5x", big)).toBe("5XL");
  });

  it("sizeKey ignores case, spaces, hyphens and dots", () => {
    expect(sizeKey(" Extra-Large. ")).toBe("extralarge");
  });

  it("looksLikeSize tells a size from a name, including sizes the product lacks", () => {
    for (const text of ["4XL", "xxs", "S", "youth small", "extra large", "med"]) expect(looksLikeSize(text, table)).toBe(true);
    for (const text of ["Ali", "Raza", "ex", "x", "10", "", "محمد"]) expect(looksLikeSize(text, table)).toBe(false);
  });

  it("normalizeSize gives the product spelling, or the text as typed", () => {
    expect(normalizeSize(" xxl ", table)).toBe("2XL");
    expect(normalizeSize("  4  xl ", table)).toBe("4 xl");
    expect(normalizeSize("", table)).toBe("");
  });
});
