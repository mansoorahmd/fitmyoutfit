import { describe, expect, it } from "vitest";
import {
  beginGesture,
  canRedo,
  canUndo,
  cancelGesture,
  commit,
  createHistory,
  endGesture,
  redo,
  sameJson,
  undo,
  undoAll,
  updateGesture,
  type History,
} from "./history";
import { createDesign } from "../design/create";
import { addFont, addLayer, removeLayer, setZoneColor, updateLayer } from "../design/edit";
import { GREEN, loadPlaceholderProduct, logoLayer, textLayer } from "../test/fixtures";
import type { DesignDocument } from "../design/schema";

const values = (h: History<number>) => ({ past: h.past, present: h.present, future: h.future });

describe("commit, undo, redo", () => {
  it("undoes and redoes steps in order", () => {
    let h = createHistory(0);
    h = commit(commit(commit(h, 1), 2), 3);
    expect(values(h)).toEqual({ past: [0, 1, 2], present: 3, future: [] });
    h = undo(undo(h));
    expect(values(h)).toEqual({ past: [0], present: 1, future: [2, 3] });
    h = redo(h);
    expect(values(h)).toEqual({ past: [0, 1], present: 2, future: [3] });
  });

  it("a new step after an undo drops the redo steps", () => {
    let h = commit(commit(createHistory(0), 1), 2);
    h = commit(undo(h), 9);
    expect(values(h)).toEqual({ past: [0, 1], present: 9, future: [] });
    expect(canRedo(h)).toBe(false);
  });

  it("undo and redo at the ends change nothing", () => {
    const h = createHistory("a");
    expect(undo(h)).toEqual(h);
    expect(redo(h)).toEqual(h);
    expect(canUndo(h)).toBe(false);
    expect(canRedo(h)).toBe(false);
  });

  it("a value equal to the present is not a step", () => {
    const h = createHistory({ a: 1 }, { equals: sameJson });
    expect(commit(h, { a: 1 }).past).toHaveLength(0);
    expect(commit(h, { a: 2 }).past).toHaveLength(1);
    expect(commit(createHistory(5), 5).past).toHaveLength(0);
  });

  it("keeps at most `limit` undo steps, dropping the oldest", () => {
    let h = createHistory(0, { limit: 3 });
    for (let k = 1; k <= 5; k++) h = commit(h, k);
    expect(h.past).toEqual([2, 3, 4]);
    expect(undoAll(h).present).toBe(2);
    expect(() => createHistory(0, { limit: 0 })).toThrow(RangeError);
  });

  it("never changes the history it is given", () => {
    const h = commit(createHistory(0), 1);
    const snapshot = structuredClone({ past: h.past, present: h.present, future: h.future });
    undo(h);
    commit(h, 7);
    updateGesture(h, 3);
    expect({ past: h.past, present: h.present, future: h.future }).toEqual(snapshot);
  });
});

describe("a gesture is one step", () => {
  it("a drag with many pointer moves is undone in one step", () => {
    let h = commit(createHistory(0), 10);
    h = beginGesture(h);
    for (let x = 11; x <= 60; x++) h = updateGesture(h, x);
    expect(h.present).toBe(60);
    expect(h.past).toEqual([0]); // nothing recorded during the drag
    h = endGesture(h);
    expect(values(h)).toEqual({ past: [0, 10], present: 60, future: [] });
    h = undo(h);
    expect(h.present).toBe(10);
    h = redo(h);
    expect(h.present).toBe(60);
  });

  it("a gesture that ends where it started is no step", () => {
    let h = beginGesture(createHistory(5));
    h = updateGesture(updateGesture(h, 6), 5);
    h = endGesture(h);
    expect(h.past).toEqual([]);
    expect(h.gestureStart).toBeNull();
  });

  it("undo during a gesture ends it and undoes it", () => {
    let h = commit(createHistory(0), 1);
    h = updateGesture(h, 2);
    h = updateGesture(h, 3);
    expect(canUndo(h)).toBe(true);
    expect(canRedo(h)).toBe(false);
    h = undo(h);
    expect(values(h)).toEqual({ past: [0], present: 1, future: [3] });
  });

  it("a commit during a gesture keeps the gesture as its own step", () => {
    let h = updateGesture(createHistory(0), 4);
    h = commit(h, 8);
    expect(values(h)).toEqual({ past: [0, 4], present: 8, future: [] });
  });

  it("cancelGesture goes back to the start without a step", () => {
    let h = updateGesture(updateGesture(createHistory(1), 2), 3);
    h = cancelGesture(h);
    expect(values(h)).toEqual({ past: [], present: 1, future: [] });
    expect(cancelGesture(h)).toBe(h);
  });

  it("beginning twice keeps the first start", () => {
    let h = beginGesture(createHistory(1));
    h = updateGesture(h, 2);
    h = beginGesture(h);
    h = endGesture(updateGesture(h, 3));
    expect(values(h)).toEqual({ past: [1], present: 3, future: [] });
  });
});

describe("with design documents: undo back to the empty design, redo to the end", () => {
  const product = loadPlaceholderProduct();

  it("zone colours, adding, editing, moving and deleting layers are each undoable", () => {
    const empty = createDesign(product);
    let h = createHistory<DesignDocument>(empty, { equals: sameJson });
    const steps: DesignDocument[] = [empty];
    const step = (next: DesignDocument) => {
      h = commit(h, next);
      steps.push(h.present);
    };
    step(setZoneColor(h.present, "body", GREEN, { product }));
    step(addFont(h.present, { id: "font-sans", family: "Inter" }));
    step(addLayer(h.present, textLayer(), { product }));
    step(addLayer(h.present, logoLayer(), { product }));
    step(updateLayer(h.present, "text-1", { value: "LIONS" }, { product }));
    // A drag of the logo: many moves, one step.
    h = beginGesture(h);
    for (let k = 1; k <= 30; k++) h = updateGesture(h, updateLayer(h.present, "logo-1", { position: { x: 120 + k, y: 100 + k } }));
    h = endGesture(h);
    steps.push(h.present);
    step(removeLayer(h.present, "text-1"));

    expect(h.past).toHaveLength(steps.length - 1);
    // Undo every step, checking each state, back to the empty design.
    for (let k = steps.length - 1; k > 0; k--) {
      expect(h.present).toEqual(steps[k]);
      h = undo(h);
    }
    expect(h.present).toEqual(empty);
    expect(canUndo(h)).toBe(false);
    // And redo to the end.
    for (let k = 1; k < steps.length; k++) {
      h = redo(h);
      expect(h.present).toEqual(steps[k]);
    }
    expect(canRedo(h)).toBe(false);
  });
});
