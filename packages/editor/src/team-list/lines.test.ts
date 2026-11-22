/** The lines of the team list: add, edit, remove, reorder, sort, the count and the flags (08-team-list.md section 4). */
import { buildSizeTable } from "@fitmyoutfit/team-rules";
import { describe, expect, it } from "vitest";
import { addLine, cleanField, convertAllDigits, filledLines, isEmptyLine, makeLineId, moveLine, newLine, removeLine, setCount, setField, setFlag, setSizeCountLines, sortLines, withIds } from "./lines.js";
import { DEFAULT_TEAM_SIZES, type EditorLine } from "./types.js";

const line = (id: string, name = "", number = "", size = "", extra: Partial<EditorLine> = {}): EditorLine => ({ id, name, number, size, count: 1, noName: false, noNumber: false, ...extra });
const table = buildSizeTable(DEFAULT_TEAM_SIZES);
const ids = (lines: readonly EditorLine[]) => lines.map((l) => l.id);

describe("a line", () => {
  it("is new and empty, with an id of its own that is never reused", () => {
    const made = new Set(Array.from({ length: 500 }, () => makeLineId()));
    expect(made.size).toBe(500);
    expect(newLine("a")).toEqual({ id: "a", name: "", number: "", size: "", count: 1, noName: false, noNumber: false });
    expect(isEmptyLine(newLine())).toBe(true);
    expect(isEmptyLine(line("a", "", "", "", { noName: true }))).toBe(false);
    expect(isEmptyLine(line("a", "", "", "", { count: 2 }))).toBe(false);
  });
  it("saved lines keep their ids; a line without one, or a repeated one, gets a new one", () => {
    const out = withIds([{ id: "keep", name: "A", number: "1", size: "M", count: 1, noName: false, noNumber: false }, { name: "B", number: "", size: "", count: 1, noName: false, noNumber: false }, { id: "keep", name: "C", number: "", size: "", count: 1, noName: false, noNumber: false }]);
    expect(out[0]!.id).toBe("keep");
    expect(new Set(ids(out)).size).toBe(3);
  });
});

describe("adding, editing and removing", () => {
  it("adds a line at the end and does not change the list it was given", () => {
    const before = [line("a", "Ali")];
    const after = addLine(before, newLine("b"));
    expect(ids(after)).toEqual(["a", "b"]);
    expect(ids(before)).toEqual(["a"]);
  });
  it("edits one field of one line, keeping the others and every other line the same object", () => {
    const a = line("a", "Ali", "10", "M");
    const b = line("b", "Bilal", "7", "L");
    const out = setField([a, b], "b", "number", "8");
    expect(out[0]).toBe(a);
    expect(out[1]).toEqual({ ...b, number: "8" });
    expect(setField([a], "a", "name", "Ali")[0]).toBe(a);
  });
  it("sets the count and the two flags", () => {
    const out = setFlag(setCount([line("a", "Ali")], "a", 3), "a", "noName", true);
    expect(out[0]).toMatchObject({ count: 3, noName: true, noNumber: false });
  });
  it("removes a line by id", () => {
    expect(ids(removeLine([line("a"), line("b"), line("c")], "b"))).toEqual(["a", "c"]);
  });
  it("leaves out the empty scratch lines when counting", () => {
    expect(ids(filledLines([line("a", "Ali"), newLine("b"), line("c", "", "", "M")]))).toEqual(["a", "c"]);
  });
});

describe("reordering and sorting", () => {
  const list = [line("a", "Zain", "11", "L"), line("b", "Ali", "7", "XL"), line("c", "", "", ""), line("d", "Bilal", "٣", "S")];
  it("moves a line up or down by one; nothing happens at the ends", () => {
    expect(ids(moveLine(list, "b", -1))).toEqual(["b", "a", "c", "d"]);
    expect(ids(moveLine(list, "b", 1))).toEqual(["a", "c", "b", "d"]);
    expect(ids(moveLine(list, "a", -1))).toEqual(["a", "b", "c", "d"]);
    expect(ids(moveLine(list, "d", 1))).toEqual(["a", "b", "c", "d"]);
  });
  it("sorts by number by value (Arabic digits too), lines without a number last", () => {
    expect(ids(sortLines(list, "number", { sizes: DEFAULT_TEAM_SIZES }))).toEqual(["d", "b", "a", "c"]);
  });
  it("sorts by name, no name last; by size in the product's order, no size last; and back to the order entered", () => {
    expect(ids(sortLines(list, "name", { sizes: DEFAULT_TEAM_SIZES }))).toEqual(["b", "d", "a", "c"]);
    expect(ids(sortLines(list, "size", { sizes: DEFAULT_TEAM_SIZES }))).toEqual(["d", "a", "b", "c"]);
    const sorted = sortLines(list, "name", { sizes: DEFAULT_TEAM_SIZES });
    expect(ids(sortLines(sorted, "entered", { sizes: DEFAULT_TEAM_SIZES, entered: ids(list) }))).toEqual(ids(list));
  });
  it("keeps lines that tie in their order", () => {
    const ties = [line("a", "A", "5"), line("b", "B", "05"), line("c", "C", "5")];
    expect(ids(sortLines(ties, "number", { sizes: DEFAULT_TEAM_SIZES }))).toEqual(["a", "b", "c"]);
  });
});

describe("what happens on leaving a field", () => {
  it("trims, makes runs of spaces one, and writes the size in the product's spelling; nothing else", () => {
    const l = [line("a", "  Ali   Raza ", " 07 ", "xxl")];
    expect(cleanField(l, "a", "name", table)[0]!.name).toBe("Ali Raza");
    expect(cleanField(l, "a", "number", table)[0]!.number).toBe("07");
    expect(cleanField(l, "a", "size", table)[0]!.size).toBe("2XL");
  });
  it("leaves a size this product does not make as typed, and a lower-case name as typed", () => {
    expect(cleanField([line("a", "ali", "", "4xl")], "a", "size", table)[0]!.size).toBe("4xl");
    expect(cleanField([line("a", "ali")], "a", "name", table)[0]!.name).toBe("ali");
  });
  it("returns the same list when nothing changed", () => {
    const l = [line("a", "Ali", "10", "M")];
    expect(cleanField(l, "a", "name", table)).toBe(l);
  });
});

describe("digits", () => {
  it("writes every number in one digit system, keeping a leading zero and other characters", () => {
    const l = [line("a", "", "07"), line("b", "", "٧"), line("c", "", "۱۰"), line("d", "", "")];
    expect(convertAllDigits(l, "arabic-indic").map((x) => x.number)).toEqual(["٠٧", "٧", "١٠", ""]);
    expect(convertAllDigits(l, "western").map((x) => x.number)).toEqual(["07", "7", "10", ""]);
  });
});

describe("by size (a design with neither a name nor a number)", () => {
  const opts = { table, maxCount: 10 };
  it("makes lines without a name, one per size, each with its quantity", () => {
    const out = setSizeCountLines([], "M", 6, opts);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ size: "M", count: 6, name: "", number: "" });
  });
  it("splits a quantity over the per-line limit into more lines of that size", () => {
    const out = setSizeCountLines([], "L", 23, opts);
    expect(out.map((l) => l.count)).toEqual([10, 10, 3]);
    expect(out.every((l) => l.size === "L")).toBe(true);
  });
  it("changes the lines of that size in place and removes them at 0, leaving the others alone", () => {
    const start = setSizeCountLines(setSizeCountLines([], "S", 2, opts), "M", 3, opts);
    const more = setSizeCountLines(start, "S", 5, opts);
    expect(more.map((l) => `${l.size}${l.count}`)).toEqual(["S5", "M3"]);
    expect(more[0]!.id).toBe(start[0]!.id);
    expect(setSizeCountLines(more, "S", 0, opts).map((l) => l.size)).toEqual(["M"]);
  });
  it("counts the lines that have a name towards the size's total", () => {
    const named = [line("a", "Ali", "", "M", { count: 2 })];
    const out = setSizeCountLines(named, "M", 5, opts);
    expect(out.reduce((n, l) => n + l.count, 0)).toBe(5);
    expect(out[0]).toBe(named[0]);
  });
});

describe("G4: one digit table, and a name order that does not depend on the browser's locale", () => {
  it("converts every digit system of the package's rules (western, Arabic-Indic, Extended Arabic-Indic) both ways", () => {
    const list = [line("a", "A", "٧٨"), line("b", "B", "۱۲"), line("c", "C", "07x")];
    expect(convertAllDigits(list, "western").map((l) => l.number)).toEqual(["78", "12", "07x"]);
    expect(convertAllDigits(list, "arabic-indic").map((l) => l.number)).toEqual(["٧٨", "١٢", "٠٧x"]);
  });
  it("sorts names without asking the runtime's own locale (String.prototype.localeCompare is not used)", () => {
    const original = String.prototype.localeCompare;
    String.prototype.localeCompare = () => {
      throw new Error("the locale of the browser was asked");
    };
    try {
      const out = sortLines([line("a", "Zain"), line("b", "ali"), line("c", "Émile"), line("d", "Bilal")], "name", { sizes: DEFAULT_TEAM_SIZES });
      expect(ids(out)).toEqual(["b", "d", "c", "a"]);
    } finally {
      String.prototype.localeCompare = original;
    }
  });
});
