/** The keyboard path of the team list (08-team-list.md 4.3): what Enter, Shift+Enter, the arrows, Alt, Esc and Backspace do. */
import { describe, expect, it } from "vitest";
import { fieldsOf, keyAction, type KeyContext } from "./keys.js";
import type { EditorLine } from "./types.js";

const line = (id: string, name = "", number = "", size = "", extra: Partial<EditorLine> = {}): EditorLine => ({ id, name, number, size, count: 1, noName: false, noNumber: false, ...extra });
const three = [line("a", "Ali", "10", "M"), line("b", "Bilal", "7", "L"), line("c", "Usman", "23", "S")];

function ctx(overrides: Partial<KeyContext> & Pick<KeyContext, "field" | "lineId">): KeyContext {
  return { visible: three, showNumber: true, wide: true, listOpen: false, active: -1, listLength: 11, atLimit: false, valueAtFocus: null, value: "x", ...overrides };
}

describe("the fields of a line", () => {
  it("are name, number and size in the tab order; a tag takes the place of its field; no number column without numbers", () => {
    expect(fieldsOf(line("a"), true)).toEqual(["name", "number", "size"]);
    expect(fieldsOf(line("a", "", "", "", { noName: true }), true)).toEqual(["number", "size"]);
    expect(fieldsOf(line("a", "", "", "", { noNumber: true }), true)).toEqual(["name", "size"]);
    expect(fieldsOf(line("a"), false)).toEqual(["name", "size"]);
  });
});

describe("Enter", () => {
  it("goes Name to No. to Size, then to the next line's Name", () => {
    expect(keyAction({ key: "Enter" }, ctx({ field: "name", lineId: "a" }))).toEqual({ type: "go", id: "a", field: "number" });
    expect(keyAction({ key: "Enter" }, ctx({ field: "number", lineId: "a" }))).toEqual({ type: "go", id: "a", field: "size" });
    expect(keyAction({ key: "Enter" }, ctx({ field: "size", lineId: "a" }))).toEqual({ type: "go-first", id: "b" });
  });
  it("skips the number when the design has none, and a field a tag replaced", () => {
    expect(keyAction({ key: "Enter" }, ctx({ field: "name", lineId: "a", showNumber: false }))).toEqual({ type: "go", id: "a", field: "size" });
    const spare = [line("a", "", "5", "M", { noName: true }), line("b", "Bilal", "7", "L")];
    expect(keyAction({ key: "Enter" }, ctx({ field: "number", lineId: "a", visible: spare }))).toEqual({ type: "go", id: "a", field: "size" });
    expect(keyAction({ key: "Enter" }, ctx({ field: "size", lineId: "a", visible: spare }))).toEqual({ type: "go-first", id: "b" });
  });
  it("in the last Size adds a line, and at the list's limit says so instead", () => {
    expect(keyAction({ key: "Enter" }, ctx({ field: "size", lineId: "c" }))).toEqual({ type: "add" });
    expect(keyAction({ key: "Enter" }, ctx({ field: "size", lineId: "c", atLimit: true }))).toEqual({ type: "limit" });
  });
  it("in the first field of a new, still empty line removes it and ends typing", () => {
    const withEmpty = [...three, line("d")];
    expect(keyAction({ key: "Enter" }, ctx({ field: "name", lineId: "d", visible: withEmpty }))).toEqual({ type: "remove-empty" });
    // Not in the number of an empty line, nor in the name of a line with something in it.
    expect(keyAction({ key: "Enter" }, ctx({ field: "number", lineId: "d", visible: withEmpty }))).toEqual({ type: "go", id: "d", field: "size" });
    expect(keyAction({ key: "Enter" }, ctx({ field: "name", lineId: "d", visible: [...three, line("d", "", "", "M")] }))).toEqual({ type: "go", id: "d", field: "number" });
  });
  it("with the size list open chooses the highlighted size first, and only if the organizer moved to one", () => {
    expect(keyAction({ key: "Enter" }, ctx({ field: "size", lineId: "a", listOpen: true, active: 2 }))).toEqual({ type: "choose-active", then: { type: "go-first", id: "b" } });
    expect(keyAction({ key: "Enter" }, ctx({ field: "size", lineId: "a", listOpen: true, active: -1 }))).toEqual({ type: "go-first", id: "b" });
  });
  it("Shift+Enter goes to the previous field, and from the first to the previous line's last", () => {
    expect(keyAction({ key: "Enter", shift: true }, ctx({ field: "size", lineId: "b" }))).toEqual({ type: "go", id: "b", field: "number" });
    expect(keyAction({ key: "Enter", shift: true }, ctx({ field: "name", lineId: "b" }))).toEqual({ type: "go", id: "a", field: "size" });
    expect(keyAction({ key: "Enter", shift: true }, ctx({ field: "name", lineId: "a" }))).toBeNull();
  });
  it("twenty players are twenty times name, Enter, number, Enter, size, Enter", () => {
    let lines: EditorLine[] = [line("l0")];
    let at = { id: "l0", field: "name" as const } as { id: string; field: "name" | "number" | "size" };
    let presses = 0;
    for (let guard = 0; guard < 200 && lines.length < 21; guard++) {
      const action = keyAction({ key: "Enter" }, ctx({ field: at.field, lineId: at.id, visible: lines.map((l) => (l.id === at.id ? { ...l, name: "x", number: "1", size: "M" } : l)) }));
      presses++;
      if (action?.type === "go") at = { id: action.id, field: action.field };
      else if (action?.type === "go-first") at = { id: action.id, field: "name" };
      else if (action?.type === "add") {
        const next = line(`l${lines.length}`);
        lines = [...lines, next];
        at = { id: next.id, field: "name" };
      }
    }
    expect(lines).toHaveLength(21);
    expect(presses).toBe(60);
  });
});

describe("the arrows", () => {
  it("move to the same field of the line above or below, as in a spreadsheet, and stop at the ends", () => {
    expect(keyAction({ key: "ArrowDown" }, ctx({ field: "number", lineId: "a" }))).toEqual({ type: "go-same", id: "b", field: "number" });
    expect(keyAction({ key: "ArrowUp" }, ctx({ field: "name", lineId: "b" }))).toEqual({ type: "go-same", id: "a", field: "name" });
    expect(keyAction({ key: "ArrowUp" }, ctx({ field: "name", lineId: "a" }))).toBeNull();
    expect(keyAction({ key: "ArrowDown" }, ctx({ field: "size", lineId: "c" }))).toBeNull();
  });
  it("in the Size field move in the list while it is open, and Alt+Down opens it", () => {
    expect(keyAction({ key: "ArrowDown" }, ctx({ field: "size", lineId: "a", listOpen: true, active: -1 }))).toEqual({ type: "move-active", to: 0 });
    expect(keyAction({ key: "ArrowDown" }, ctx({ field: "size", lineId: "a", listOpen: true, active: 10 }))).toEqual({ type: "move-active", to: 10 });
    expect(keyAction({ key: "ArrowUp" }, ctx({ field: "size", lineId: "a", listOpen: true, active: 0 }))).toEqual({ type: "move-active", to: 0 });
    expect(keyAction({ key: "ArrowDown", alt: true }, ctx({ field: "size", lineId: "a" }))).toEqual({ type: "open-list" });
  });
  it("Alt+Up and Alt+Down in Name or No. move the line", () => {
    expect(keyAction({ key: "ArrowUp", alt: true }, ctx({ field: "name", lineId: "b" }))).toEqual({ type: "move-line", delta: -1 });
    expect(keyAction({ key: "ArrowDown", alt: true }, ctx({ field: "number", lineId: "b" }))).toEqual({ type: "move-line", delta: 1 });
  });
  it("a phone (no listbox) moves between lines in the Size field too", () => {
    expect(keyAction({ key: "ArrowDown" }, ctx({ field: "size", lineId: "a", wide: false }))).toEqual({ type: "go-same", id: "b", field: "size" });
  });
});

describe("Escape and Backspace", () => {
  it("Esc closes the size list when it is open, else puts back the value the field had", () => {
    expect(keyAction({ key: "Escape" }, ctx({ field: "size", lineId: "a", listOpen: true }))).toEqual({ type: "close-list" });
    expect(keyAction({ key: "Escape" }, ctx({ field: "name", lineId: "a", valueAtFocus: "Ali", value: "Alix" }))).toEqual({ type: "restore", value: "Ali" });
    expect(keyAction({ key: "Escape" }, ctx({ field: "name", lineId: "a", valueAtFocus: "Ali", value: "Ali" }))).toBeNull();
  });
  it("Backspace in the empty first field of an empty line removes it and goes to the end of the line before", () => {
    const withEmpty = [...three, line("d")];
    expect(keyAction({ key: "Backspace" }, ctx({ field: "name", lineId: "d", visible: withEmpty, value: "" }))).toEqual({ type: "remove-empty-back", id: "c", field: "size" });
    expect(keyAction({ key: "Backspace" }, ctx({ field: "name", lineId: "a", visible: [line("a")], value: "" }))).toBeNull();
    expect(keyAction({ key: "Backspace" }, ctx({ field: "name", lineId: "d", visible: [...three, line("d", "A")], value: "A" }))).toBeNull();
  });
  it("leaves typing, Tab and everything else to the browser", () => {
    for (const key of ["a", "Tab", "Home", "F8"]) expect(keyAction({ key }, ctx({ field: "name", lineId: "a" }))).toBeNull();
  });
});
