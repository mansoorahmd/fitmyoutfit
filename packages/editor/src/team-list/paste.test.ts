/** The paste flow's state (08-team-list.md 5): what is read, what the preview says, what is added, and the one undo step. */
import { describe, expect, it } from "vitest";
import { createDesign } from "../design/create.js";
import { loadStandInJerseyProduct } from "../test/fixtures.js";
import { commitLines, createEditorHistory } from "../state/editor-history.js";
import { canRedo, redo, undo, undoLabel } from "../state/history.js";
import { changeWords, EDITOR_WORDING } from "../ui/content.js";
import { previewMessages } from "../ui/team-list-words.js";
import { applyPaste, countTextLines, pastedLines, readPaste, roomFor, type PasteContext } from "./paste.js";
import { newLine } from "./lines.js";
import { TWENTY } from "./paste-samples.js";
import { DEFAULT_TEAM_SIZES, type EditorLine } from "./types.js";

const W = EDITOR_WORDING;
const line = (id: string, name: string, number: string, size: string): EditorLine => ({ ...newLine(id), name, number, size });
const ctx = (over: Partial<PasteContext> = {}): PasteContext => ({ sizes: DEFAULT_TEAM_SIZES, prints: { name: true, number: true }, existing: [], mode: "add", maxLines: 100, ...over });
const words = (preview: ReturnType<typeof readPaste>, existing: readonly EditorLine[] = []) =>
  preview.rows.map((r) => previewMessages(r, { wording: W, lines: [...existing, ...preview.rows.map((x) => x.line)], sizes: DEFAULT_TEAM_SIZES, noun: { one: "jersey", many: "jerseys" } }).map((m) => m.text));


describe("reading a pasted list: the package reads, the editor shows", () => {
  it("shows the players found, in order, with name, number and size", () => {
    const p = readPaste(TWENTY, ctx());
    expect(p.rows).toHaveLength(20);
    expect(p.notAdded).toEqual([]);
    expect(p.textLines).toBe(20);
    expect(p.rows.slice(0, 5).map((r) => [r.line.name, r.line.number, r.line.size])).toEqual([
      ["Ali Raza", "10", "M"],
      ["Bilal Ahmed", "10", "L"],
      ["Usman Tariq", "23", "XL"],
      ["محمد علی", "٧", "XL"],
      ["Hamza", "4", "S"],
    ]);
    expect(p.rows.every((r) => r.line.id !== "")).toBe(true);
    expect(new Set(p.rows.map((r) => r.line.id)).size).toBe(20);
  });
  it("marks the lines that need a look: the same number twice shows on both, in the list's own words", () => {
    const p = readPaste(TWENTY, ctx());
    const messages = words(p);
    // Ali Raza and Bilal Ahmed both have 10; Talha Butt and Rizwan Ahmed both have 16.
    expect(messages[0]!.join(" ")).toContain("Same number as");
    expect(messages[1]!.join(" ")).toContain("Same number as");
    expect(p.needLook).toBe(4);
    expect(p.rows[2]!.problems).toEqual([]);
  });
  it("says what could not be read: two numbers leave the number empty, a missing size is said once", () => {
    const p = readPaste("7 Ali 10 M\nImran 5", ctx());
    expect(p.rows.map((r) => [r.line.name, r.line.number, r.line.size])).toEqual([
      ["Ali", "", "M"],
      ["Imran", "5", ""],
    ]);
    const messages = words(p);
    expect(messages[0]).toEqual(["Two numbers here: 7 and 10. Type the shirt number."]);
    expect(messages[1]).toEqual(["No size found. You can add it after."]);
  });
  it("a size this product does not make is kept and flagged by the normal check", () => {
    const p = readPaste("Zain 11 4XL", ctx());
    expect(p.rows[0]!.line.size).toBe("4XL");
    expect(words(p)[0]![0]).toBe("We don't make “4XL” in this jersey. Sizes: YS to 3XL.");
  });
  it("lists the lines that are not players apart, with the reason, and never adds them by itself", () => {
    const p = readPaste("Squad for Saturday:\nAli Raza 10 M\n👍\n\nBilal 7 L", ctx());
    expect(p.rows).toHaveLength(2);
    expect(p.notAdded.map((n) => [n.text, n.reason])).toEqual([
      ["Squad for Saturday:", "not-a-player"],
      ["👍", "nothing-to-read"],
    ]);
  });
  it("adds a line that is not a player, as a line with the text as its name, when the organizer asks (in the text's order)", () => {
    const p = readPaste("Squad for Saturday:\nAli Raza 10 M\n👍", ctx(), [1]);
    expect(p.rows.map((r) => [r.line.name, r.fromNotAdded])).toEqual([
      ["Squad for Saturday:", true],
      ["Ali Raza", false],
    ]);
    expect(p.notAdded.map((n) => n.text)).toEqual(["👍"]);
    expect(p.rows[0]!.problems.map((x) => x.code)).toContain("number-missing");
  });
  it("uses the header line for the columns and says so", () => {
    const p = readPaste("Name\tNo\tSize\nUsman Tariq\t23\txl", ctx());
    expect(p.columns).toEqual(["name", "number", "size"]);
    expect(p.rows.map((r) => [r.line.name, r.line.number, r.line.size])).toEqual([["Usman Tariq", "23", "XL"]]);
  });
  it("reads Urdu and Arabic names and digits as typed", () => {
    const p = readPaste("محمد علی ٧ XL\nعبدالله الهاشمي ۷ M", ctx());
    expect(p.rows.map((r) => [r.line.name, r.line.number])).toEqual([
      ["محمد علی", "٧"],
      ["عبدالله الهاشمي", "۷"],
    ]);
  });
  it("runs the list's checks against the lines already there when adding, not when replacing", () => {
    const existing = [line("x", "Old Seven", "7", "M")];
    const adding = readPaste("Ali 7 M", ctx({ existing }));
    expect(adding.rows[0]!.problems.map((x) => x.code)).toEqual(["number-duplicate"]);
    expect(words(adding, existing)[0]![0]).toContain("Old Seven");
    const replacing = readPaste("Ali 7 M", ctx({ existing, mode: "replace" }));
    expect(replacing.rows[0]!.problems).toEqual([]);
  });
  it("leaves out the fields the design does not print (no number on this design: nothing about numbers)", () => {
    const p = readPaste("Ali Raza M", ctx({ prints: { name: true, number: false } }));
    expect(p.rows[0]!.problems).toEqual([]);
  });
  it("counts the text's lines without the empty ones", () => {
    expect(countTextLines("a\n\n b \r\n\r\n")).toBe(2);
    expect(countTextLines("")).toBe(0);
  });
});

describe("100 lines, 500 lines and the limit (5.3 step 9)", () => {
  const many = (n: number) => Array.from({ length: n }, (_, i) => `Player${String.fromCharCode(65 + (i % 26))}${String.fromCharCode(97 + (Math.floor(i / 26) % 26))} ${i % 100} M`).join("\n");
  it("reads 100 lines and adds all 100, none over", () => {
    const p = readPaste(many(100), ctx());
    expect(p.rows).toHaveLength(100);
    expect(p.overLimit).toBe(0);
  });
  it("reads 500 lines quickly, adds the first 100 and says how many did not fit", () => {
    const started = performance.now();
    const p = readPaste(many(500), ctx());
    const took = performance.now() - started;
    expect(p.rows).toHaveLength(100);
    expect(p.overLimit).toBe(400);
    expect(took).toBeLessThan(1000);
  });
  it("counts the room left by the list when adding, and all of it when replacing", () => {
    const existing = Array.from({ length: 95 }, (_, i) => line(`e${i}`, `E${i}`, String(i), "M"));
    expect(roomFor(existing, "add", 100)).toBe(5);
    expect(roomFor(existing, "replace", 100)).toBe(100);
    const p = readPaste(many(20), ctx({ existing }));
    expect(p.rows).toHaveLength(5);
    expect(p.overLimit).toBe(15);
    expect(p.room).toBe(5);
  });
  it("a full list leaves no room", () => {
    const existing = Array.from({ length: 100 }, (_, i) => line(`e${i}`, `E${i}`, String(i), "M"));
    const p = readPaste("Ali 1 M", ctx({ existing }));
    expect(p.rows).toHaveLength(0);
    expect(p.overLimit).toBe(1);
  });
});

describe("accepting: add or replace, in one undo step", () => {
  const design = createDesign(loadStandInJerseyProduct(), { teamName: "LIONS", samplePlayer: { name: "PLAYER", number: "10" } });
  const four = [line("a", "A", "1", "M"), line("b", "B", "2", "M"), line("c", "C", "3", "M"), line("d", "D", "4", "M")];
  it("adds the pasted lines at the end, after the lines that are there (an empty scratch line is dropped)", () => {
    const added = pastedLines(readPaste("Ali 7 M\nBilal 8 L", ctx({ existing: four })));
    const next = applyPaste([...four, newLine("scratch")], added, "add", 100);
    expect(next.map((l) => l.name)).toEqual(["A", "B", "C", "D", "Ali", "Bilal"]);
  });
  it("replaces the list when asked, and never goes over the limit", () => {
    const added = pastedLines(readPaste("Ali 7 M\nBilal 8 L", ctx({ existing: four, mode: "replace" })));
    expect(applyPaste(four, added, "replace", 100).map((l) => l.name)).toEqual(["Ali", "Bilal"]);
    expect(applyPaste(four, added, "add", 5).map((l) => l.name)).toEqual(["A", "B", "C", "D", "Ali"]);
  });
  it("is ONE undo step with a label, and redo brings every pasted line back", () => {
    let h = createEditorHistory({ design, lines: four });
    const added = pastedLines(readPaste(TWENTY, ctx({ existing: four })));
    h = commitLines(h, (ls) => applyPaste(ls as EditorLine[], added, "add", 100), "list-paste|20 players");
    expect(h.present.lines).toHaveLength(24);
    expect(changeWords(W, undoLabel(h))).toBe("Pasted 20 players");
    h = undo(h);
    expect(h.present.lines).toHaveLength(4);
    expect(canRedo(h)).toBe(true);
    h = redo(h);
    expect(h.present.lines).toHaveLength(24);
    expect(h.present.lines[4]!.name).toBe("Ali Raza");
  });
  it("a second paste adds to the first, with the two lines that are not players listed apart", () => {
    let h = createEditorHistory({ design, lines: [] });
    h = commitLines(h, (ls) => applyPaste(ls as EditorLine[], pastedLines(readPaste(TWENTY, ctx())), "add", 100), "list-paste|20 players");
    const second = readPaste("Squad for Saturday:\nNew One 30 M\n👍\nAnother 31 L", ctx({ existing: h.present.lines }));
    expect(second.notAdded).toHaveLength(2);
    expect(second.rows).toHaveLength(2);
    h = commitLines(h, (ls) => applyPaste(ls as EditorLine[], pastedLines(second), "add", 100), "list-paste|2 players");
    expect(h.present.lines).toHaveLength(22);
  });
});
