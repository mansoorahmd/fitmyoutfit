import { describe, expect, it } from "vitest";
import {
  EDIT_LABELS,
  beginGesture,
  cancelGesture,
  commit,
  createHistory,
  endGesture,
  redo,
  redoLabel,
  undo,
  undoAll,
  undoLabel,
  updateGesture,
} from "./history";

describe("history step labels (N18)", () => {
  it("each step carries its label; undo and redo say which step they change", () => {
    let h = createHistory(0);
    h = commit(h, 1, "zone-colour");
    h = commit(h, 2, "template");
    expect(undoLabel(h)).toBe("template");
    expect(redoLabel(h)).toBeNull();
    h = undo(h);
    expect(h.present).toBe(1);
    expect(undoLabel(h)).toBe("zone-colour");
    expect(redoLabel(h)).toBe("template");
    h = undo(h);
    expect(undoLabel(h)).toBeNull();
    expect(redoLabel(h)).toBe("zone-colour");
    h = redo(h);
    expect(h.present).toBe(1);
    expect(undoLabel(h)).toBe("zone-colour");
    expect(redoLabel(h)).toBe("template");
  });

  it("a gesture is one step with the label it began with", () => {
    let h = createHistory(0);
    h = beginGesture(h, "move");
    h = updateGesture(h, 5);
    expect(undoLabel(h)).toBe("move"); // undo would end the gesture and undo it
    h = updateGesture(h, 9);
    h = endGesture(h);
    expect(h.past).toEqual([0]);
    expect(undoLabel(h)).toBe("move");
    // A gesture that changed nothing is no step and leaves the label of the step before.
    h = beginGesture(h, "resize");
    expect(undoLabel(h)).toBe("move");
    h = cancelGesture(updateGesture(h, 3));
    expect(undoLabel(h)).toBe("move");
    // updateGesture without beginGesture starts one with its label.
    h = endGesture(updateGesture(h, 4, "rotate"));
    expect(undoLabel(h)).toBe("rotate");
  });

  it("a new step clears what could be redone, labels included; a step with no label says null", () => {
    let h = commit(commit(createHistory(0), 1, "font"), 2, "colour");
    h = undo(h);
    h = commit(h, 3);
    expect(redoLabel(h)).toBeNull();
    expect(h.futureLabels).toEqual([]);
    expect(undoLabel(h)).toBeNull();
    expect(h.pastLabels).toEqual(["font", null]);
  });

  it("drops the labels of the oldest steps with the steps, past the limit", () => {
    let h = createHistory(0, { limit: 2 });
    h = commit(commit(commit(h, 1, "font"), 2, "colour"), 3, "outline");
    expect(h.past).toEqual([1, 2]);
    expect(h.pastLabels).toEqual(["colour", "outline"]);
    h = undoAll(h);
    expect(h.futureLabels).toEqual(["colour", "outline"]);
  });

  it("lists keys, not sentences", () => {
    for (const key of EDIT_LABELS) expect(key).toMatch(/^[a-z]+(-[a-z]+)*$/);
    expect(EDIT_LABELS).toContain("zone-colour");
    expect(EDIT_LABELS).toContain("swap-team-colours");
    expect(EDIT_LABELS).toContain("template");
  });
});
