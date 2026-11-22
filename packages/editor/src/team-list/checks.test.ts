/** The checks beside the line: when each shows (6.2), the next problem (6.4), the shirt for a line (7.1), saving and restoring. */
import { describe, expect, it } from "vitest";
import { createDesign } from "../design/create.js";
import { loadStandInJerseyProduct } from "../test/fixtures.js";
import { analyseList, designWithPlayer, isShown, nextToFix, playerForShirt, shownProblems, toSavedList } from "./checks.js";
import { newLine, printsOf } from "./lines.js";
import { readSavedList } from "./saved.js";
import { DEFAULT_TEAM_SIZES, type EditorLine } from "./types.js";

const line = (id: string, name = "", number = "", size = "", extra: Partial<EditorLine> = {}): EditorLine => ({ id, name, number, size, count: 1, noName: false, noNumber: false, ...extra });
const settings = { prints: { name: true, number: true }, sizes: DEFAULT_TEAM_SIZES };
const codes = (analysis: ReturnType<typeof analyseList>, id: string, seen = {}, reveal = false, lines: EditorLine[] = []) =>
  shownProblems(analysis, lines.find((l) => l.id === id)!, seen, reveal).map((p) => p.code);

describe("numbers already taken (a late joiner's add-on, S3)", () => {
  const lines = [line("a", "Ali", "07", "M"), line("b", "Bilal", "8", "L")];
  const taken = [{ number: "7", source: "first-order" as const, name: "Hamza" }, { number: "8", source: "add-on" as const }];
  it("a taken number is a problem on its line, compared as a number, and shows once the number field was left", () => {
    const a = analyseList(lines, { ...settings, taken });
    expect(a.byLine.get("a")!.map((p) => p.code)).toEqual(["number-taken-first-order"]);
    expect(a.byLine.get("b")!.map((p) => p.code)).toEqual(["number-taken-add-on"]);
    expect(a.toFix).toEqual(["a", "b"]);
    expect(codes(a, "a", {}, false, lines)).toEqual([]);
    expect(codes(a, "a", { a: { number: true } }, false, lines)).toEqual(["number-taken-first-order"]);
    expect(codes(a, "b", {}, true, lines)).toEqual(["number-taken-add-on"]);
  });
  it("without taken (or an empty list) nothing is taken", () => {
    expect(analyseList(lines, settings).toFix).toEqual([]);
    expect(analyseList(lines, { ...settings, taken: [] }).toFix).toEqual([]);
  });
});

describe("the analysis", () => {
  it("counts only the lines somebody typed into (a new empty line is not a player and is never flagged)", () => {
    const lines = [line("a", "Ali", "10", "M"), newLine("b")];
    const a = analyseList(lines, settings);
    expect(a.report.summary.players).toBe(1);
    expect(a.toFix).toEqual([]);
    expect(a.byLine.get("b")).toBeUndefined();
  });
  it("puts each problem on its line by id, and a duplicate on every line involved", () => {
    const lines = [line("a", "Ali", "7", "M"), line("b", "Bilal", "٧", "L"), line("c", "Usman", "23", "")];
    const a = analyseList(lines, settings);
    expect(a.byLine.get("a")!.map((p) => p.code)).toEqual(["number-duplicate"]);
    expect(a.byLine.get("b")!.map((p) => p.code)).toEqual(["number-duplicate"]);
    expect(a.byLine.get("c")!.map((p) => p.code)).toEqual(["size-missing"]);
    expect(a.toFix).toEqual(["a", "b", "c"]);
  });
  it("tells the summary the minimum in pieces, and counts a count of 2 as two pieces", () => {
    const a = analyseList([line("a", "Ali", "1", "M", { count: 2 }), line("b", "B", "2", "M")], { ...settings, minimum: 10 });
    expect(a.report.summary.pieces).toBe(3);
    expect(a.report.summary.minimum).toEqual({ required: 10, missing: 7, met: false });
  });
});

describe("when a check shows (6.2)", () => {
  const lines = [line("a", "Ali", "7", "M"), line("b", "Bilal", "7", ""), line("c", "Zain", "100", "4xl"), line("d", "Imran", "1", "S")];
  const a = analyseList(lines, settings);
  it("at once, while typing: a number that more typing cannot fix (100), never a missing value", () => {
    expect(codes(a, "c", {}, false, lines)).toEqual(["number-too-long"]);
    expect(codes(a, "b", {}, false, lines)).toEqual([]);
  });
  it("a missing value shows once the line is left, and a duplicate once its number field was left", () => {
    expect(codes(a, "b", { b: { left: true } }, false, lines)).toEqual(["size-missing"]);
    expect(codes(a, "b", { b: { left: true, number: true } }, false, lines)).toEqual(["number-duplicate", "size-missing"]);
  });
  it("an unknown size shows once its field was left", () => {
    expect(codes(a, "c", {}, false, lines)).not.toContain("size-unknown");
    expect(codes(a, "c", { c: { size: true } }, false, lines)).toContain("size-unknown");
  });
  it("everything shows after Next to fix or Done", () => {
    expect(codes(a, "b", {}, true, lines)).toEqual(["number-duplicate", "size-missing"]);
  });
  it("typing 1 then 0 never shows an error between the keys; 100 shows on the third; a mixed number at once", () => {
    for (const [typed, expected] of [["1", []], ["10", []], ["100", ["number-too-long"]], ["1٢", ["number-mixed-digits"]], ["7a", ["number-not-digits"]]] as const) {
      const l = [line("x", "Ali", typed, "M")];
      expect(codes(analyseList(l, settings), "x", {}, false, l), typed).toEqual(expect.arrayContaining([...expected]));
      if (expected.length === 0) expect(codes(analyseList(l, settings), "x", {}, false, l), typed).toEqual([]);
    }
  });
  it("a problem goes on the keystroke that fixes it, on both lines of a clash", () => {
    const clash = [line("a", "Ali", "7", "M"), line("b", "Bilal", "7", "L")];
    const seen = { a: { left: true, number: true }, b: { left: true, number: true } };
    expect(codes(analyseList(clash, settings), "a", seen, false, clash)).toEqual(["number-duplicate"]);
    const fixed = [clash[0]!, { ...clash[1]!, number: "8" }];
    expect(codes(analyseList(fixed, settings), "a", seen, false, fixed)).toEqual([]);
    expect(codes(analyseList(fixed, settings), "b", seen, false, fixed)).toEqual([]);
  });
  it("0 and 00 are the same number, as are 7, 07 and ٧", () => {
    const l = [line("a", "A", "0", "M"), line("b", "B", "00", "M"), line("c", "C", "07", "M"), line("d", "D", "٧", "M")];
    const an = analyseList(l, settings);
    expect(an.byLine.get("a")!.map((p) => p.code)).toEqual(["number-duplicate"]);
    expect(an.byLine.get("c")!.map((p) => p.code)).toEqual(["number-duplicate"]);
    expect(an.byLine.get("d")!.map((p) => p.code)).toEqual(["number-duplicate"]);
  });
  it("isShown says the same without the analysis", () => {
    const missing = { code: "name-missing", index: 0, field: "name" } as const;
    expect(isShown(missing, undefined, false)).toBe(false);
    expect(isShown(missing, { left: true }, false)).toBe(true);
    expect(isShown(missing, undefined, true)).toBe(true);
  });
});

describe("the next line to fix (6.4)", () => {
  const lines = ["a", "b", "c", "d", "e"].map((id) => line(id));
  it("goes forward from the chosen line, wrapping to the top", () => {
    expect(nextToFix(lines, ["b", "d"], "a")).toBe("b");
    expect(nextToFix(lines, ["b", "d"], "b")).toBe("d");
    expect(nextToFix(lines, ["b", "d"], "d")).toBe("b");
    expect(nextToFix(lines, ["b", "d"], null)).toBe("b");
  });
  it("goes back for Shift+F8, wrapping to the bottom", () => {
    expect(nextToFix(lines, ["b", "d"], "d", -1)).toBe("b");
    expect(nextToFix(lines, ["b", "d"], "b", -1)).toBe("d");
  });
  it("is null when nothing is left, and visits every problem once in order", () => {
    expect(nextToFix(lines, [], "a")).toBeNull();
    const visited: string[] = [];
    let at: string | null = "e";
    for (let k = 0; k < 3; k++) {
      at = nextToFix(lines, ["a", "c", "d"], at);
      visited.push(at!);
    }
    expect(visited).toEqual(["a", "c", "d"]);
  });
});

describe("the shirt for a line (7.1)", () => {
  const prints = { name: true, number: true };
  it("shows the name and number as they would print", () => {
    expect(playerForShirt(line("a", "Ali Raza", "10"), prints)).toEqual({ name: "Ali Raza", number: "10" });
    expect(playerForShirt(line("a", "محمد علی", "٧"), prints)).toEqual({ name: "محمد علی", number: "٧" });
  });
  it("draws no number when it is invalid, and leaves out a character that cannot print", () => {
    expect(playerForShirt(line("a", "Ali ★", "100"), prints)).toEqual({ name: "Ali ", number: "" });
    expect(playerForShirt(line("a", "Ali", "1٢"), prints).number).toBe("");
  });
  it("draws nothing for a spare shirt's missing name or number, or for what the design does not print", () => {
    expect(playerForShirt(line("a", "Ali", "10", "", { noName: true, noNumber: true }), prints)).toEqual({ name: "", number: "" });
    expect(playerForShirt(line("a", "Ali", "10"), { name: false, number: true })).toEqual({ name: "", number: "10" });
  });
  it("is the design with that player in every name and number item, and never writes the sample", () => {
    const product = loadStandInJerseyProduct();
    const design = createDesign(product, { samplePlayer: { name: "PLAYER", number: "10" } });
    const shown = designWithPlayer(design, { name: "Ali", number: "" });
    expect(design.samplePlayer).toEqual({ name: "PLAYER", number: "10" });
    expect(shown.layers.filter((l) => l.role === "player-name").every((l) => l.kind === "text" && l.value === "Ali")).toBe(true);
    expect(shown.layers.filter((l) => l.role === "player-number").every((l) => l.kind === "number" && l.value === "")).toBe(true);
    expect(designWithPlayer(shown, { name: "Ali", number: "" })).toBe(shown);
  });
  it("the design says what it prints", () => {
    const product = loadStandInJerseyProduct();
    const none = createDesign(product, { samplePlayer: { name: "", number: "" } });
    expect(printsOf({ layers: [] })).toEqual({ name: false, number: false });
    expect(typeof printsOf(none).name).toBe("boolean");
  });
});

describe("saving and restoring", () => {
  it("hands over the filled lines, cleaned, with what the design prints and the product's id", () => {
    const saved = toSavedList([line("a", " Ali  Raza ", "10", "m"), newLine("b")], "p1", settings);
    expect(saved).toEqual({ version: 1, productId: "p1", prints: { name: true, number: true }, lines: [{ id: "a", name: "Ali Raza", number: "10", size: "M", count: 1, noName: false, noNumber: false }] });
  });
  it("brings the list back for the same product only, keeping ids and the order", () => {
    const saved = toSavedList([line("a", "Ali", "10", "M"), line("b", "Bilal", "7", "L", { count: 2, noNumber: true })], "p1", settings);
    const back = readSavedList(JSON.parse(JSON.stringify(saved)), { productId: "p1" });
    expect(back.map((l) => l.id)).toEqual(["a", "b"]);
    expect(back[1]).toMatchObject({ count: 2, noNumber: true });
    expect(readSavedList(saved, { productId: "other" })).toEqual([]);
  });
  it("is an empty list for nothing, a wrong version or a malformed list (never an exception)", () => {
    for (const bad of [null, undefined, 5, "x", { version: 2, productId: "p1", lines: [] }, { version: 1, productId: "p1", lines: "no" }, { version: 1, productId: "p1", lines: [5] }]) {
      expect(readSavedList(bad, { productId: "p1" })).toEqual([]);
    }
  });
  it("keeps the first lines of a list over the host's line limit (G4: it no longer drops the whole list; the rest is reported)", () => {
    const many = { version: 1, productId: "p1", lines: Array.from({ length: 5 }, (_, i) => ({ name: `P${i}` })) };
    expect(readSavedList(many, { productId: "p1", limits: { maxLines: 3 } }).map((l) => l.name)).toEqual(["P0", "P1", "P2"]);
    expect(readSavedList(many, { productId: "p1", limits: { maxLines: 5 } })).toHaveLength(5);
  });
});
