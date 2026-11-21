/**
 * E3f: the hover on the model. What is under the mouse is looked at at most once per frame, and a new frame is
 * asked for only when it changes: moves over the same part ask for nothing (the speed rule of the last rounds:
 * the scene is never redrawn for a pointer move that changed nothing).
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { HoverTracker, hoverAllowed, hoverKey, type Hover } from "./hover";
import { tapOutcome } from "./press-policy";

const sleeves: Hover = { kind: "part", zoneId: "sleeves", shapeGroup: null };
const collar: Hover = { kind: "part", zoneId: "collar", shapeGroup: null };
const hoops: Hover = { kind: "part", zoneId: "body_front", shapeGroup: "hoops" };
const name: Hover = { kind: "item", layerId: "team-name-1", selected: false };

describe("E3f: the hover only reports a change", () => {
  it("pointer moves over the same part ask for no new frame", () => {
    const seen: Array<Hover | null> = [];
    const tracker = new HoverTracker((h) => seen.push(h));
    expect(tracker.set(sleeves)).toBe(true);
    for (let k = 0; k < 50; k++) expect(tracker.set({ ...sleeves })).toBe(false);
    expect(seen).toHaveLength(1);
  });

  it("a new thing under the pointer is one change each: another part, an item, a group of shapes, nothing", () => {
    const seen: Array<Hover | null> = [];
    const tracker = new HoverTracker((h) => seen.push(h));
    for (const next of [sleeves, collar, collar, name, name, hoops, null, null, sleeves]) tracker.set(next);
    expect(seen).toEqual([sleeves, collar, name, hoops, null, sleeves]);
  });

  it("an item that becomes the selected one is a change (its hand changes); nothing under it at the start is none", () => {
    expect(hoverKey({ ...name, selected: true })).not.toBe(hoverKey(name));
    expect(hoverKey(null)).toBe("none");
    const tracker = new HoverTracker(() => undefined);
    expect(tracker.set(null)).toBe(false);
  });
});

describe("E3f: when the hover shows", () => {
  const idle = { dragging: false, placing: false, sliding: false };
  it("a mouse or pen with no button down; never on touch", () => {
    expect(hoverAllowed({ pointerType: "mouse", buttons: 0 }, idle)).toBe(true);
    expect(hoverAllowed({ pointerType: "pen", buttons: 0 }, idle)).toBe(true);
    expect(hoverAllowed({ pointerType: "touch", buttons: 0 }, idle)).toBe(false);
  });
  it("not while the garment is being turned or slid (a button is down), nor while an item is dragged, resized or turned", () => {
    expect(hoverAllowed({ pointerType: "mouse", buttons: 1 }, idle)).toBe(false);
    expect(hoverAllowed({ pointerType: "mouse", buttons: 2 }, idle)).toBe(false);
    expect(hoverAllowed({ pointerType: "mouse", buttons: 0 }, { ...idle, dragging: true })).toBe(false);
    expect(hoverAllowed({ pointerType: "mouse", buttons: 0 }, { ...idle, placing: true })).toBe(false);
    expect(hoverAllowed({ pointerType: "mouse", buttons: 0 }, { ...idle, sliding: true })).toBe(false);
  });
});

describe("E3f: a tap on the model, from any tool", () => {
  it("on an item: it is selected, and no part is reported", () => {
    expect(tapOutcome({ pickZones: false, selects: "team-name-1", onFabric: true })).toEqual({ select: "team-name-1", part: null });
  });
  it("on bare fabric: the part is reported (and any item is let go); on the stage: it lets go", () => {
    expect(tapOutcome({ pickZones: false, selects: null, onFabric: true })).toEqual({ select: null, part: "part" });
    expect(tapOutcome({ pickZones: false, selects: null, onFabric: false })).toEqual({ select: null, part: "stage" });
  });
  it("the old zone-picking mode still reports a part and selects nothing", () => {
    expect(tapOutcome({ pickZones: true, selects: "team-name-1", onFabric: true })).toEqual({ select: null, part: "part" });
  });
});

describe("E3f: the canvas's hover (source guards)", () => {
  const source = readFileSync(new URL("./DesignCanvas.tsx", import.meta.url), "utf8");
  const between = (from: string, to: string) => source.slice(source.indexOf(from), source.indexOf(to));
  it("the pointer move handler and the per-frame look never ask for a frame: only the tracker's change does", () => {
    const looking = between("const runHover = () => {", "const onHoverEnd = () => {");
    expect(looking.length).toBeGreaterThan(200);
    expect(looking).not.toMatch(/invalidate\(/);
    expect(looking).not.toMatch(/drawHover/);
    expect(looking).toMatch(/requestAnimationFrame\(runHover\)/);
    // The ray is cast in the frame callback, once per frame, not in the move handler itself.
    const move = between("const onHoverMove = (event: PointerEvent) => {", "const onHoverEnd = () => {");
    expect(move).not.toMatch(/hitAt\(/);
  });
  it("the part is drawn into the small hover texture only when the tracker reports a change; the garment's texture is not redrawn", () => {
    const tracker = between("const tracker = new HoverTracker(", "let hoverEvent");
    expect(tracker).toMatch(/drawHover\.current\(h\)/);
    const draw = between("const drawHover = useLatest(", "// Fonts: load what the text needs");
    expect(draw).not.toMatch(/redrawPattern|drawPatternTexture/);
  });
});
