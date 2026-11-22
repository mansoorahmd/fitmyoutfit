import { describe, expect, it } from "vitest";
import { readPastedList, toRosterLine } from "./read.js";
import { analyzeRoster } from "./check.js";

const SIZES = ["YS", "YM", "YL", "YXL", "XS", "S", "M", "L", "XL", "2XL", "3XL"];

/** Reads text and returns each line as [name, number, size] for a short comparison. */
function triples(text: string, sizes: readonly string[] = SIZES) {
  const result = readPastedList(text, { sizes });
  return result.lines.map((l) => [l.name, l.number, l.size]);
}

describe("the sample texts of docs/design/08-team-list.md, 5.5", () => {
  it.each([
    ["WhatsApp, numbered", "1. Ali Raza 10 M", ["Ali Raza", "10", "M"]],
    ["WhatsApp, number first", "10 - Ali Raza - M", ["Ali Raza", "10", "M"]],
    ["commas", "Bilal Ahmed, 7, L", ["Bilal Ahmed", "7", "L"]],
    ["Urdu name, Arabic digits", "محمد علی ٧ XL", ["محمد علی", "٧", "XL"]],
    ["hash and words", "#4 Hamza small", ["Hamza", "4", "S"]],
    ["size first", "M Ali Raza 10", ["Ali Raza", "10", "M"]],
    ["initial in the name", "Ali S Khan 9 L", ["Ali S Khan", "9", "L"]],
    ["no size", "Imran 5", ["Imran", "5", ""]],
    ["size not made", "Zain 11 4XL", ["Zain", "11", "4XL"]],
  ])("%s: %s", (_label, text, expected) => {
    expect(triples(text)).toEqual([expected]);
  });

  it("Excel copy: a header line sets the columns, and the size is put in the product's spelling", () => {
    const result = readPastedList("Name\tNo\tSize\nUsman Tariq\t23\txl", { sizes: SIZES });
    expect(result.columns).toEqual(["name", "number", "size"]);
    expect(result.lines.map((l) => [l.name, l.number, l.size, l.lineNumber])).toEqual([["Usman Tariq", "23", "XL", 2]]);
    expect(result.notAdded).toEqual([]);
  });

  it("two numbers: the number is left empty and the line says why", () => {
    const result = readPastedList("7 Ali 10 M", { sizes: SIZES });
    expect(result.lines).toHaveLength(1);
    const line = result.lines[0]!;
    expect([line.name, line.number, line.size]).toEqual(["Ali", "", "M"]);
    expect(line.notes).toEqual([{ code: "two-numbers", values: ["7", "10"] }]);
  });

  it("not a player: listed apart, not added", () => {
    const result = readPastedList("Squad for Saturday:", { sizes: SIZES });
    expect(result.lines).toEqual([]);
    expect(result.notAdded).toEqual([{ lineNumber: 1, text: "Squad for Saturday:", reason: "not-a-player" }]);
  });
});

describe("reading in general", () => {
  it("skips empty lines without a word, and counts them in the line numbers", () => {
    const result = readPastedList("\n\nAli 7 M\n   \nBilal 8 L\n", { sizes: SIZES });
    expect(result.lines.map((l) => l.lineNumber)).toEqual([3, 5]);
    expect(result.notAdded).toEqual([]);
  });

  it("a line of only decoration has nothing to read", () => {
    const result = readPastedList("Ali 7 M\n👍\n", { sizes: SIZES });
    expect(result.lines).toHaveLength(1);
    expect(result.notAdded).toEqual([{ lineNumber: 2, text: "👍", reason: "nothing-to-read" }]);
  });

  it("removes bullets, emoji, counting marks and a WhatsApp prefix", () => {
    expect(triples("\u2022 Ali Raza 10 M")).toEqual([["Ali Raza", "10", "M"]]);
    expect(triples("- Ali Raza 10 M ✅")).toEqual([["Ali Raza", "10", "M"]]);
    expect(triples("12) Ali Raza 10 M")).toEqual([["Ali Raza", "10", "M"]]);
    expect(triples("[10:42, 17/11/2026] Imran: Imran Khan 5 L")).toEqual([["Imran Khan", "5", "L"]]);
    expect(triples("17/11/2026, 10:42 - Imran: Imran Khan 5 L")).toEqual([["Imran Khan", "5", "L"]]);
    expect(triples("1\uFE0F\u20E3 Ali Raza 10 M")).toEqual([["Ali Raza", "10", "M"]]);
  });

  it("splits by tabs, commas, semicolons, pipes and the Arabic comma, and by spaces", () => {
    for (const text of ["Ali Raza\t10\tM", "Ali Raza,10,M", "Ali Raza;10;M", "Ali Raza|10|M", "Ali Raza\u060C10\u060CM", "Ali Raza 10 M"]) {
      expect(triples(text)).toEqual([["Ali Raza", "10", "M"]]);
    }
  });

  it("keeps a comma inside quotes in the field", () => {
    expect(triples('"Raza, Ali",10,M')).toEqual([["Raza, Ali", "10", "M"]]);
  });

  it("recognises the parts in any order", () => {
    expect(triples("10, M, Ali Raza")).toEqual([["Ali Raza", "10", "M"]]);
    expect(triples("L 7 Bilal Ahmed")).toEqual([["Bilal Ahmed", "7", "L"]]);
  });

  it("reads No. 7 and #7 and keeps a leading zero as written", () => {
    expect(triples("Ali No. 7 M")).toEqual([["Ali", "7", "M"]]);
    expect(triples("Ali #07 M")).toEqual([["Ali", "07", "M"]]);
    expect(triples("Ali no7 M")).toEqual([["Ali", "7", "M"]]);
  });

  it("keeps a three-digit number as written, for the checks to flag", () => {
    expect(triples("Ali 100 M")).toEqual([["Ali", "100", "M"]]);
  });

  it("reads Extended Arabic-Indic digits and Urdu names, comma separated", () => {
    expect(triples("علی رضا\u060C ۱۰\u060C M")).toEqual([["علی رضا", "۱۰", "M"]]);
  });

  it("reads a quantity: x2, 2 pcs, qty 2", () => {
    for (const text of ["Ali 7 M x2", "Ali 7 M 2 pcs", "Ali 7 M qty 2", "Ali 7 M \u00D72"]) {
      const line = readPastedList(text, { sizes: SIZES }).lines[0]!;
      expect([line.name, line.number, line.size, line.count]).toEqual(["Ali", "7", "M", 2]);
    }
    expect(readPastedList("Ali 7 M", { sizes: SIZES }).lines[0]!.count).toBe(1);
  });

  it("does not guess: two sizes leave the size empty", () => {
    const line = readPastedList("M Ali L", { sizes: SIZES }).lines[0]!;
    expect([line.name, line.size]).toEqual(["Ali", ""]);
    expect(line.notes).toEqual([{ code: "two-sizes", values: ["M", "L"] }]);
  });

  it("reads two-word sizes at the end or the start", () => {
    expect(triples("Ali Raza 7 youth small")).toEqual([["Ali Raza", "7", "YS"]]);
    expect(triples("extra large Ali Raza 7")).toEqual([["Ali Raza", "7", "XL"]]);
    expect(triples("Ali Raza, 7, x-large")).toEqual([["Ali Raza", "7", "XL"]]);
  });

  it("a size word in the middle of a name stays in the name", () => {
    expect(triples("Ali M Khan 9")).toEqual([["Ali M Khan", "9", ""]]);
  });

  it("reads a line with a name only", () => {
    expect(triples("Hamza")).toEqual([["Hamza", "", ""]]);
  });

  it("a header can be in any order and use Urdu words, with commas", () => {
    const result = readPastedList("سائز,نمبر,نام\nM,7,Ali", { sizes: SIZES });
    expect(result.columns).toEqual(["size", "number", "name"]);
    expect(result.lines.map((l) => [l.name, l.number, l.size])).toEqual([["Ali", "7", "M"]]);
  });

  it("a header with a quantity column", () => {
    const result = readPastedList("Name,No.,Size,Qty\nAli,7,M,2\nBilal,8,L,", { sizes: SIZES });
    expect(result.columns).toEqual(["name", "number", "size", "count"]);
    expect(result.lines.map((l) => l.count)).toEqual([2, 1]);
  });

  it("a header row is only the first line: later 'Name' lines are players", () => {
    const result = readPastedList("Ali 7 M\nName 8 L", { sizes: SIZES });
    expect(result.columns).toBeNull();
    expect(result.lines).toHaveLength(2);
  });

  it("a row with more parts than the header's columns is read by what it looks like", () => {
    const result = readPastedList("Name,No\nAli,7,M", { sizes: SIZES });
    expect(result.lines.map((l) => [l.name, l.number, l.size])).toEqual([["Ali", "7", "M"]]);
  });

  it("a count that is not a number in a count column is noted and left at 1", () => {
    const result = readPastedList("Name,Qty\nAli,two", { sizes: SIZES });
    expect(result.lines[0]!.count).toBe(1);
    expect(result.lines[0]!.notes).toEqual([{ code: "count-unclear", value: "two" }]);
  });

  it("a long line with no number or size is not a player", () => {
    const result = readPastedList("please send the sizes by tomorrow evening", { sizes: SIZES });
    expect(result.notAdded.map((n) => n.reason)).toEqual(["not-a-player"]);
  });

  it("handles any line ending and a byte-order mark", () => {
    const result = readPastedList("\uFEFFAli 7 M\r\nBilal 8 L\rUsman 9 S", { sizes: SIZES });
    expect(result.lines.map((l) => l.name)).toEqual(["Ali", "Bilal", "Usman"]);
  });

  it("adds only what fits and says how many did not", () => {
    const text = Array.from({ length: 5 }, (_, i) => `P${i} ${i + 1} M`).join("\n");
    const result = readPastedList(text, { sizes: SIZES, room: 3 });
    expect(result.lines).toHaveLength(3);
    expect(result.overLimit).toBe(2);
  });

  it("uses the list limit for the room when none is given", () => {
    const text = Array.from({ length: 12 }, (_, i) => `P${i} ${i + 1} M`).join("\n");
    const result = readPastedList(text, { sizes: SIZES, limits: { maxLines: 10 } });
    expect(result.lines).toHaveLength(10);
    expect(result.overLimit).toBe(2);
  });

  it("never throws for odd text", () => {
    for (const text of ["", "   ", "\t\t", ",,,", "\"", "#", "x", "\u202E\u202C", "0".repeat(5000), "\0"]) {
      expect(() => readPastedList(text, { sizes: SIZES })).not.toThrow();
    }
  });

  it("a product with other sizes brings its own words", () => {
    const result = readPastedList("Ali 7 big", {
      sizes: [{ code: "S" }, { code: "BIG", words: ["big", "huge"] }],
    });
    expect(result.lines[0]!.size).toBe("BIG");
  });
});

describe("a pasted list of 20 players goes through the checks", () => {
  const text = [
    "Name\tNo\tSize",
    ...Array.from({ length: 20 }, (_, i) => `Player ${String.fromCharCode(65 + i)}\t${i + 1}\t${SIZES[4 + (i % 7)]}`),
  ].join("\n");

  it("reads 20 lines and the checks find nothing wrong", () => {
    const read = readPastedList(text, { sizes: SIZES });
    expect(read.lines).toHaveLength(20);
    const lines = read.lines.map(toRosterLine);
    const analysis = analyzeRoster(lines, { prints: { name: true, number: true }, sizes: SIZES });
    // "Player A" has a letter only: fine. Digits are in the number column.
    expect(analysis.problems).toEqual([]);
    expect(analysis.summary.pieces).toBe(20);
  });
});
