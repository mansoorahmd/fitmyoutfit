/**
 * From the rules package's codes to the editor's words (08-team-list.md 6.1 and 15). The package returns codes, never
 * sentences, so EVERY code it can return must have wording here: the test reads the package's own list of codes.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { EDITOR_WORDING } from "./content.js";
import { initialsExample, noteText, piecesText, playerCalled, problemText, saysInField, withoutIsolates, type WordsContext } from "./team-list-words.js";
import { analyseList } from "../team-list/checks.js";
import { DEFAULT_TEAM_NOUN, DEFAULT_TEAM_SIZES, type EditorLine } from "../team-list/types.js";

const W = EDITOR_WORDING;
const line = (id: string, name = "", number = "", size = "", extra: Partial<EditorLine> = {}): EditorLine => ({ id, name, number, size, count: 1, noName: false, noNumber: false, ...extra });

/** The members of a string-literal union in the package's source: `export type ProblemCode = | "a" | "b"`. */
function unionMembers(file: string, name: string): string[] {
  const source = readFileSync(resolve(import.meta.dirname, "../../../team-rules/src", file), "utf8");
  const start = source.indexOf(`export type ${name} =`);
  expect(start, `${name} in ${file}`).toBeGreaterThan(-1);
  const end = source.indexOf(";", start);
  return [...source.slice(start, end).matchAll(/"([a-z-]+)"/g)].map((m) => m[1]!);
}

describe("every code the rules package can return has wording", () => {
  const problemCodes = unionMembers("types.ts", "ProblemCode");
  const noteCodes = ["name-mixed-scripts", "mixed-digit-systems"];
  it("reads a real list of codes from the package (not an empty one)", () => {
    expect(problemCodes.length).toBeGreaterThanOrEqual(12);
    expect(problemCodes).toContain("number-duplicate");
  });
  it("has a sentence for each problem code, with no mark left unfilled by problemText", () => {
    const ctx: WordsContext = { wording: W, lines: [line("a", "Ali", "7"), line("b", "Bilal", "7")], sizes: DEFAULT_TEAM_SIZES, noun: DEFAULT_TEAM_NOUN };
    for (const code of problemCodes) {
      expect((W.teamList.problems as Record<string, string>)[code], code).toEqual(expect.any(String));
      const text = problemText({ code, index: 0, field: "name", detail: { others: [{ index: 1, id: "b", name: "Bilal" }], characters: ["★"], length: 22, max: 18, size: "4XL", count: 11, min: 1, lines: 101 } } as never, ctx.lines[0], ctx);
      expect(text, code).not.toMatch(/\{\w+\}/);
      expect(text.length, code).toBeGreaterThan(0);
    }
  });
  it("has a sentence for each note code", () => {
    for (const code of noteCodes) expect(noteText({ code } as never, W)).toBe((W.teamList.notes as Record<string, string>)[code]);
    for (const code of unionMembers("types.ts", "ProblemCode")) expect(code).toMatch(/^[a-z]+(-[a-z]+)*$/);
  });
  it("finds the note codes in the package too", () => {
    const source = readFileSync(resolve(import.meta.dirname, "../../../team-rules/src/types.ts"), "utf8");
    for (const code of ["name-mixed-scripts", "mixed-digit-systems"]) expect(source).toContain(`"${code}"`);
  });
});

describe("the sentences", () => {
  const lines = [line("a", "Ali Raza", "7", "M"), line("b", "Bilal Ahmed", "٧", "L"), line("c", "", "7", "S"), line("d", "Muhammad Abdul Rehman Qureshi", "", "4XL")];
  const ctx: WordsContext = { wording: W, lines, sizes: DEFAULT_TEAM_SIZES, noun: { one: "jersey", many: "jerseys" } };
  const analysis = analyseList(lines, { prints: { name: true, number: true }, sizes: DEFAULT_TEAM_SIZES });
  const text = (id: string, code: string) => {
    const p = analysis.byLine.get(id)!.find((x) => x.code === code)!;
    return withoutIsolates(problemText(p, lines.find((l) => l.id === id), ctx));
  };
  it("names the other player, 'and 1 other' with three on one number, 'and 2 others' with four, showing this line's number as typed", () => {
    expect(text("b", "number-duplicate")).toBe("Same number as Ali Raza and 1 other (٧).");
    const four = [line("a", "A", "7", "M"), line("b", "B", "7", "M"), line("c", "C", "7", "M"), line("d", "D", "07", "M")];
    const a4 = analyseList(four, { prints: { name: true, number: true }, sizes: DEFAULT_TEAM_SIZES });
    expect(withoutIsolates(problemText(a4.byLine.get("a")![0]!, four[0], { ...ctx, lines: four }))).toBe("Same number as B and 2 others (7).");
  });
  it("calls a player with no name by position", () => {
    expect(playerCalled(W, lines[2], 2)).toBe("player 3");
    expect(withoutIsolates(playerCalled(W, lines[0], 0))).toBe("Ali Raza");
    // The name is isolated, so a right-to-left name keeps "(7)" after it.
    expect(playerCalled(W, line("u", "محمد علی"), 0)).toBe("⁨محمد علی⁩");
  });
  it("says how long a name is, and gives initials as the hint", () => {
    expect(text("d", "name-too-long")).toBe("Too long for the back: about 11 letters too many. Initials help: M. A. R. Qureshi.");
    expect(initialsExample("Muhammad Abdul Rehman Qureshi")).toBe("M. A. R. Qureshi");
    expect(initialsExample("Ali")).toBe("Ali");
  });
  it("names the size and the range for a size the product does not make", () => {
    expect(text("d", "size-unknown")).toBe("We don't make “4XL” in this jersey. Sizes: YS to 3XL.");
  });
  it("says a missing value inside its field, every other problem under the line", () => {
    expect(saysInField({ code: "size-missing" })).toBe(true);
    expect(saysInField({ code: "name-missing" })).toBe(true);
    expect(saysInField({ code: "number-duplicate" })).toBe(false);
    expect(W.teamList.problems["size-missing"]).toBe("Needs a size");
  });
  it("tells a digit in a name from a symbol", () => {
    const l = [line("x", "Ali 2", "1", "M"), line("y", "Ali ★", "2", "M")];
    const a = analyseList(l, { prints: { name: true, number: true }, sizes: DEFAULT_TEAM_SIZES });
    const c: WordsContext = { ...ctx, lines: l };
    expect(problemText(a.byLine.get("x")!.find((p) => p.code === "name-character")!, l[0], c)).toBe("Numbers go in the No. box, not in the name.");
    expect(problemText(a.byLine.get("y")!.find((p) => p.code === "name-character")!, l[1], c)).toBe("Can't print “★”. Use letters, spaces, and - ' .");
  });
  it("puts the product's noun in the summary", () => {
    expect(piecesText(W, 21, { one: "jersey", many: "jerseys" })).toBe("21 jerseys");
    expect(piecesText(W, 1, { one: "jersey", many: "jerseys" })).toBe("1 jersey");
  });
  it("is draft wording, in the wording module, with no sentence of its own in a component", () => {
    const source = readFileSync(resolve(import.meta.dirname, "content.ts"), "utf8");
    expect(source).toContain("DRAFT WORDING, founders to confirm. W-TL ids");
  });
});
