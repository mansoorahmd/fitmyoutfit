import { describe, expect, it } from "vitest";
import { isTap, pressAction, selectsFirst } from "./press-policy";

describe("the drag policy (06-editor.md 5.1, N10 dragOnlySelected)", () => {
  it("touch: a drag that starts on an unselected item turns the garment; a tap selects it", () => {
    expect(pressAction({ pointerType: "touch", hitLayerId: "team-name", selectedId: null })).toEqual({ kind: "turn", tapSelects: "team-name" });
    expect(pressAction({ pointerType: "touch", hitLayerId: "team-name", selectedId: "number" })).toEqual({ kind: "turn", tapSelects: "team-name" });
  });

  it("touch: once selected, a drag that starts on it moves it", () => {
    expect(pressAction({ pointerType: "touch", hitLayerId: "team-name", selectedId: "team-name" })).toEqual({ kind: "drag", layerId: "team-name" });
  });

  it("E3f: mouse and pen too: a drag that starts on an unselected item turns the garment; a click selects it", () => {
    expect(pressAction({ pointerType: "mouse", hitLayerId: "team-name", selectedId: null })).toEqual({ kind: "turn", tapSelects: "team-name" });
    expect(pressAction({ pointerType: "pen", hitLayerId: "logo", selectedId: "team-name" })).toEqual({ kind: "turn", tapSelects: "logo" });
    // Once selected, a drag that starts on it moves it, with a mouse as on touch.
    expect(pressAction({ pointerType: "mouse", hitLayerId: "team-name", selectedId: "team-name" })).toEqual({ kind: "drag", layerId: "team-name" });
  });

  it("the earlier mouse rule (press and drag at once) is still there for a host that asks for it", () => {
    expect(pressAction({ pointerType: "mouse", hitLayerId: "team-name", selectedId: null, dragOnlySelected: "touch" })).toEqual({ kind: "drag", layerId: "team-name" });
  });

  it("a press on empty fabric or the stage turns the garment, and a tap there deselects", () => {
    expect(pressAction({ pointerType: "touch", hitLayerId: null, selectedId: "team-name" })).toEqual({ kind: "turn", tapSelects: null });
    expect(pressAction({ pointerType: "mouse", hitLayerId: null, selectedId: "team-name" })).toEqual({ kind: "turn", tapSelects: null });
  });

  it("the Colours tool: a press never drags or selects (a tap chooses the zone)", () => {
    expect(pressAction({ pointerType: "mouse", hitLayerId: "team-name", selectedId: "team-name", pickZones: true })).toEqual({ kind: "turn", tapSelects: null });
  });

  it("the policy can be set for every pointer, and a host without dragging still selects", () => {
    expect(selectsFirst("mouse", true)).toBe(true);
    expect(selectsFirst("touch", false)).toBe(false);
    expect(selectsFirst("touch")).toBe(true);
    expect(selectsFirst("mouse")).toBe(true);
    expect(selectsFirst("mouse", "touch")).toBe(false);
    expect(pressAction({ pointerType: "mouse", hitLayerId: "a", selectedId: null, dragOnlySelected: true })).toEqual({ kind: "turn", tapSelects: "a" });
    expect(pressAction({ pointerType: "touch", hitLayerId: "a", selectedId: null, dragOnlySelected: false })).toEqual({ kind: "drag", layerId: "a" });
    expect(pressAction({ pointerType: "mouse", hitLayerId: "a", selectedId: "a", canDrag: false })).toEqual({ kind: "turn", tapSelects: "a" });
  });

  it("a tap is short and still", () => {
    expect(isTap({ x: 0, y: 0, time: 0 }, { x: 5, y: 5, time: 200 })).toBe(true);
    expect(isTap({ x: 0, y: 0, time: 0 }, { x: 9, y: 0, time: 200 })).toBe(false);
    expect(isTap({ x: 0, y: 0, time: 0 }, { x: 0, y: 0, time: 800 })).toBe(false);
  });
});
