/** One undo history for the design and the team list (08-team-list.md 4.7, D-TL2). */
import { describe, expect, it } from "vitest";
import { createDesign } from "../design/create.js";
import { setTeamName } from "../design/roles.js";
import { loadStandInJerseyProduct } from "../test/fixtures.js";
import { newLine, setField } from "../team-list/lines.js";
import type { EditorLine } from "../team-list/types.js";
import { commitDesign, commitLines, createEditorHistory, previewLines } from "./editor-history.js";
import { beginGesture, canUndo, endGesture, redo, redoLabel, undo, undoLabel } from "./history.js";
import { changeWords, EDITOR_WORDING } from "../ui/content.js";

const product = loadStandInJerseyProduct();
const design = createDesign(product, { teamName: "TIGERS", samplePlayer: { name: "PLAYER", number: "10" } });
const line = (id: string, name: string): EditorLine => ({ ...newLine(id), name });

describe("one history for the design and the list", () => {
  it("starts with nothing to undo", () => {
    const h = createEditorHistory({ design, lines: [] });
    expect(canUndo(h)).toBe(false);
  });
  it("undoes list steps and design steps in the order they were made, with one pair of buttons", () => {
    let h = createEditorHistory({ design, lines: [] });
    h = commitLines(h, [line("a", "Ali")], "list-add");
    h = commitDesign(h, setTeamName(design, "LIONS"), "team-name");
    h = commitLines(h, (lines) => setField(lines, "a", "number", "10"), "list-number|Ali");
    expect(h.present.design.teamName).toBe("LIONS");
    expect(h.present.lines[0]!.number).toBe("10");
    h = undo(h);
    expect(h.present.lines[0]!.number).toBe("");
    expect(h.present.design.teamName).toBe("LIONS");
    h = undo(h);
    expect(h.present.design.teamName).toBe("TIGERS");
    expect(h.present.lines).toHaveLength(1);
    h = undo(h);
    expect(h.present.lines).toHaveLength(0);
    h = redo(redo(redo(h)));
    expect(h.present.lines[0]!.number).toBe("10");
    expect(h.present.design.teamName).toBe("LIONS");
  });
  it("a design step leaves the lines alone, and a list step leaves the design alone (the same objects)", () => {
    const lines = [line("a", "Ali")];
    let h = createEditorHistory({ design, lines });
    h = commitDesign(h, setTeamName(design, "LIONS"), "team-name");
    expect(h.present.lines).toBe(lines);
    const d = h.present.design;
    h = commitLines(h, [...lines, line("b", "Bilal")], "list-add");
    expect(h.present.design).toBe(d);
  });
  it("typing in a field is one step however many keys, labelled with the player, and nothing when nothing changed", () => {
    let h = createEditorHistory({ design, lines: [line("a", "")] });
    h = beginGesture(h, "list-name|player 1");
    for (const typed of ["A", "Al", "Ali"]) h = previewLines(h, (lines) => setField(lines, "a", "name", typed));
    expect(h.present.lines[0]!.name).toBe("Ali");
    expect(h.past).toHaveLength(0);
    h = endGesture(h);
    expect(h.past).toHaveLength(1);
    expect(undoLabel(h)).toBe("list-name|player 1");
    expect(changeWords(EDITOR_WORDING, undoLabel(h))).toBe("Name of player 1");
    h = beginGesture(h, "list-name|Ali");
    h = previewLines(h, (lines) => setField(lines, "a", "name", "Ali"));
    expect(endGesture(h).past).toHaveLength(1);
  });
  it("an added line and the first name typed into it are one step", () => {
    let h = createEditorHistory({ design, lines: [] });
    h = beginGesture(h, "list-add");
    h = previewLines(h, (lines) => [...lines, line("a", "")]);
    h = beginGesture(h, "list-name|player 1"); // ignored: the first gesture stays open
    h = previewLines(h, (lines) => setField(lines, "a", "name", "Ali"));
    h = endGesture(h);
    expect(h.past).toHaveLength(1);
    expect(undoLabel(h)).toBe("list-add");
    expect(undo(h).present.lines).toHaveLength(0);
  });
  it("an empty line added and taken away again leaves no step", () => {
    let h = createEditorHistory({ design, lines: [] });
    h = beginGesture(h, "list-add");
    h = previewLines(h, (lines) => [...lines, line("a", "")]);
    h = previewLines(h, () => []);
    expect(endGesture(h).past).toHaveLength(0);
  });
  it("a removal can be undone to put the line back in its place, and redone", () => {
    const lines = [line("a", "Ali"), line("b", "Bilal"), line("c", "Zain")];
    let h = createEditorHistory({ design, lines });
    h = commitLines(h, (ls) => ls.filter((l) => l.id !== "b"), "list-remove|Bilal");
    expect(h.present.lines.map((l) => l.id)).toEqual(["a", "c"]);
    expect(changeWords(EDITOR_WORDING, undoLabel(h))).toBe("Removed Bilal");
    h = undo(h);
    expect(h.present.lines.map((l) => l.id)).toEqual(["a", "b", "c"]);
    expect(redoLabel(h)).toBe("list-remove|Bilal");
    expect(redo(h).present.lines).toHaveLength(2);
  });
});
