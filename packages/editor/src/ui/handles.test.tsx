/**
 * The handles (06-editor.md 5.2): the gesture maths, and the overlay's markup
 * (handles with 44 px hit areas when the item faces the camera; "Turn to
 * edit" instead when it faces away).
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { SelectionGeometry } from "../react/DesignCanvas";
import { EDITOR_WORDING as W } from "./content";
import { HANDLE_HIT, createBus, resizeFactor, snapAngle, turnDelta } from "./handles";
import { SelectionOverlay } from "./SelectionOverlay";

describe("handle gestures", () => {
  it("a corner drag scales by the pointer's distance from the centre", () => {
    const c = { x: 100, y: 100 };
    expect(resizeFactor(c, { x: 150, y: 100 }, { x: 175, y: 100 })).toBeCloseTo(1.5);
    expect(resizeFactor(c, { x: 130, y: 140 }, { x: 115, y: 120 })).toBeCloseTo(0.5);
    expect(resizeFactor(c, { x: 100.2, y: 100 }, { x: 300, y: 100 })).toBe(1); // a press on the centre: no change
    expect(resizeFactor(c, { x: 150, y: 100 }, { x: 100, y: 100 })).toBeGreaterThan(0); // never zero
  });

  it("the turn handle turns by the pointer's angle round the centre, clockwise on screen", () => {
    const c = { x: 0, y: 0 };
    expect(turnDelta(c, { x: 0, y: -50 }, { x: 50, y: 0 })).toBeCloseTo(90);
    expect(turnDelta(c, { x: 0, y: -50 }, { x: -50, y: 0 })).toBeCloseTo(-90);
    // Across the back of the circle, the shortest way.
    expect(turnDelta(c, { x: -50, y: 1 }, { x: -50, y: -1 })).toBeCloseTo(2.29, 1);
    // A piece seen mirrored turns the other way.
    expect(turnDelta(c, { x: 0, y: -50 }, { x: 50, y: 0 }, true)).toBeCloseTo(-90);
  });

  it("snaps at 0, 15, 45 and 90 degrees (both ways), within 4 degrees, unless free", () => {
    expect(snapAngle(3)).toEqual({ angle: 0, snapped: true });
    expect(snapAngle(-13)).toEqual({ angle: -15, snapped: true });
    expect(snapAngle(48)).toEqual({ angle: 45, snapped: true });
    expect(snapAngle(93)).toEqual({ angle: 90, snapped: true });
    expect(snapAngle(30)).toEqual({ angle: 30, snapped: false });
    expect(snapAngle(363)).toEqual({ angle: 0, snapped: true });
    expect(snapAngle(178)).toEqual({ angle: 180, snapped: true });
    expect(snapAngle(3, true)).toEqual({ angle: 3, snapped: false });
  });

  it("the store tells its listeners", () => {
    const bus = createBus<number | null>(null);
    let seen = 0;
    const off = bus.subscribe(() => seen++);
    bus.emit(3);
    expect(bus.get()).toBe(3);
    off();
    bus.emit(4);
    expect(seen).toBe(1);
  });
});

function geometry(facing: boolean): SelectionGeometry {
  return {
    layerId: "team-name-1",
    centre: { x: 200, y: 300 },
    corners: [
      { x: 140, y: 280 },
      { x: 260, y: 280 },
      { x: 260, y: 320 },
      { x: 140, y: 320 },
    ],
    cornerSources: ["surface", "surface", "surface", "plane"],
    outline: [
      { x: 140, y: 280 },
      { x: 260, y: 280 },
      { x: 260, y: 320 },
      { x: 140, y: 320 },
    ],
    top: { x: 200, y: 280 },
    turn: { x: 200, y: 252 },
    angle: facing ? 10 : 120,
    facing,
    mirrored: false,
    pxPerMm: 0.5,
    guides: [{ kind: "guide", runs: [[{ x: 200, y: 100 }, { x: 200, y: 500 }]] }],
    width: 390,
    height: 600,
  };
}

const render = (facing: boolean) =>
  renderToStaticMarkup(<SelectionOverlay bus={createBus<SelectionGeometry | null>(geometry(facing))} wording={W} insets={{ top: 0, right: 0, bottom: 0, left: 0 }} top={24} onResize={() => undefined} onRotate={() => undefined} onTurnTo={() => undefined} />);

describe("the selection overlay", () => {
  it("shows four corner handles and a turn handle, each with a 44 px hit area, and the snapping guide", () => {
    const html = render(true);
    for (let k = 0; k < 4; k++) expect(html).toContain(`data-testid="handle-corner-${k}"`);
    expect(html).toContain('data-testid="handle-turn"');
    expect(html).toContain(`width="${HANDLE_HIT}" height="${HANDLE_HIT}"`);
    expect(html).toContain(`r="${HANDLE_HIT / 2}"`);
    expect(html).toContain('data-testid="snap-guide"');
    expect(html).not.toContain("turn-to-edit");
  });

  it("when the item faces away: no handles, one control that turns the garment to it", () => {
    const html = render(false);
    expect(html).not.toContain("handle-corner");
    expect(html).toContain('data-testid="turn-to-edit"');
    expect(html).toContain(W.selection.turnToEdit);
  });

  it("draws nothing without a selection", () => {
    expect(renderToStaticMarkup(<SelectionOverlay bus={createBus<SelectionGeometry | null>(null)} wording={W} insets={{ top: 0, right: 0, bottom: 0, left: 0 }} top={0} onResize={() => undefined} onRotate={() => undefined} onTurnTo={() => undefined} />)).toBe("");
  });
});
