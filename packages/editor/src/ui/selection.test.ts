import { describe, expect, it } from "vitest";
import { keyEdit } from "./SelectedItem";
import { CONTEXT_BAR_HEIGHT, contextBarPlacement, itemScreenBox, toolForLayer } from "./selection";

describe("the contextual bar's place (06-editor.md 5.2: never over the item or its handles)", () => {
  it("sits at the top when the item is below the band", () => {
    expect(contextBarPlacement({ top: 24, freeBottom: 500, item: { x: 100, y: 200, width: 120, height: 60 } })).toBe("top");
    expect(contextBarPlacement({ top: 24, freeBottom: 500, item: null })).toBe("top");
  });

  it("goes to the bottom when the item (with its handles) reaches into the top band", () => {
    const item = itemScreenBox([{ x: 100, y: 40 }, { x: 220, y: 90 }], 22)!;
    expect(item.y).toBe(18);
    expect(contextBarPlacement({ top: 24, freeBottom: 500, item })).toBe("bottom");
  });

  it("when both bands are covered (zoomed right in), takes the one less covered", () => {
    const big = { x: 0, y: 30, width: 300, height: 450 }; // reaches 480: 20 px into the bottom band, 42 into the top
    expect(contextBarPlacement({ top: 24, freeBottom: 500, item: big })).toBe("bottom");
    const huge = { x: 0, y: 60, width: 300, height: 440 }; // top band 12 px, bottom band the whole 48
    expect(contextBarPlacement({ top: 24, freeBottom: 500, item: huge })).toBe("top");
    expect(CONTEXT_BAR_HEIGHT).toBe(48);
  });
});

describe("the item's tool and its keys", () => {
  it("opens the tool that edits it", () => {
    expect(toolForLayer({ role: "team-name", kind: "text" })).toBe("team");
    expect(toolForLayer({ role: "player-number", kind: "number" })).toBe("players");
    expect(toolForLayer({ role: "crest", kind: "logo" })).toBe("logos");
    expect(toolForLayer({ role: "sponsor", kind: "logo" })).toBe("logos");
    expect(toolForLayer({ role: "text", kind: "text" })).toBe("text");
    expect(toolForLayer({ role: "sponsor", kind: "text" })).toBe("text");
  });

  it("arrows move 1 mm (Shift 10), [ ] resize by 10%, Shift turns 15 degrees, Delete removes", () => {
    expect(keyEdit("ArrowLeft", false)).toEqual({ kind: "nudge", dx: -1, dy: 0 });
    expect(keyEdit("ArrowDown", true)).toEqual({ kind: "nudge", dx: 0, dy: 10 });
    expect(keyEdit("]", false)).toEqual({ kind: "scale", factor: 1.1 });
    expect(keyEdit("[", false)).toEqual({ kind: "scale", factor: 1 / 1.1 });
    expect(keyEdit("}", true)).toEqual({ kind: "rotate", degrees: 15 });
    expect(keyEdit("{", true)).toEqual({ kind: "rotate", degrees: -15 });
    expect(keyEdit("Backspace", false)).toEqual({ kind: "delete" });
    expect(keyEdit("a", false)).toBeNull();
  });
});
