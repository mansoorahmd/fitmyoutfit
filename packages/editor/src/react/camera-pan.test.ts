/**
 * E3f: sliding the view. The rig moves the camera and the point it looks at together, along the screen's own axes,
 * limited so the garment never leaves the free stage; Reset brings it back; turning and the side buttons keep it.
 * The canvas's gestures (right button, Shift + drag, two fingers) are held by guards on its source.
 */
import { readFileSync } from "node:fs";
import { PerspectiveCamera, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { CameraRig, PAN_LIMIT, clampPan } from "./camera-rig";
import { frameInFreeArea } from "./camera";
import { slideCentre } from "./DesignCanvas";

const SIZE: [number, number, number] = [0.75, 0.73, 0.3];
const CENTER: [number, number, number] = [0, 1.1, 0];

function setup(reducedMotion = true) {
  let now = 0;
  const camera = new PerspectiveCamera(35, 360 / 520, 0.05, 50);
  let frames = 0;
  const rig = new CameraRig(camera, () => frames++, () => now);
  rig.update({}, CENTER, SIZE, {
    framing: frameInFreeArea(SIZE, 35, { width: 360, height: 520 }, { top: 0, right: 0, bottom: 0, left: 0 }),
    viewport: { width: 360, height: 520 },
    reducedMotion,
    fovDegrees: 35,
  });
  const centreOnScreen = () => {
    camera.updateMatrixWorld();
    return new Vector3(...CENTER).project(camera);
  };
  const run = (ms: number) => {
    for (let t = 0; t <= ms; t += 16) {
      now += 16;
      rig.frame();
    }
  };
  return { rig, camera, centreOnScreen, run, frames: () => frames };
}

describe("E3f: sliding the view", () => {
  it("the garment follows the pointer: dragged right it moves right, dragged down it moves down", () => {
    const { rig, centreOnScreen } = setup();
    const start = centreOnScreen();
    rig.panBy(60, 0);
    const right = centreOnScreen();
    expect(right.x).toBeGreaterThan(start.x + 0.05);
    expect(right.y).toBeCloseTo(start.y, 3);
    rig.panBy(0, 40);
    expect(centreOnScreen().y).toBeLessThan(right.y - 0.03);
  });

  it("one pixel of drag is one pixel on the screen (the garment's centre moves as far as the pointer did)", () => {
    const { rig, centreOnScreen } = setup();
    const before = centreOnScreen().x;
    rig.panBy(36, 0);
    // 36 px of a 360 px wide canvas is 0.2 of normalised device coordinates (which span 2 across).
    expect((centreOnScreen().x - before) * 180).toBeCloseTo(36, 0);
  });

  it("is limited: dragged far in any direction, some of the garment stays on the free stage", () => {
    for (const [dx, dy] of [[100000, 0], [-100000, 0], [0, 100000], [0, -100000], [90000, -90000]] as const) {
      const { rig, centreOnScreen } = setup();
      rig.panBy(dx, dy);
      const c = centreOnScreen();
      expect(Math.abs(c.x)).toBeLessThan(1);
      expect(Math.abs(c.y)).toBeLessThan(1);
    }
    const clamped = clampPan([10, 0, 0], SIZE);
    expect(clamped[0]).toBeCloseTo(PAN_LIMIT * SIZE[0], 9);
    expect(clampPan([0.01, 0.01, 0], SIZE)).toEqual([0.01, 0.01, 0]);
  });

  it("Reset brings the view back (animated, cut with reduced motion); the side buttons keep a slid view", () => {
    const moving = setup(false);
    moving.rig.panBy(80, 30);
    expect(moving.rig.panned).toBe(true);
    moving.rig.showSide("back");
    moving.run(500);
    expect(moving.rig.panned).toBe(true);
    moving.rig.reset();
    moving.run(500);
    expect(moving.rig.panned).toBe(false);
    expect(moving.centreOnScreen().x).toBeCloseTo(0, 3);
    expect(moving.centreOnScreen().y).toBeCloseTo(0, 3);
    const cut = setup(true);
    cut.rig.panBy(80, 30);
    cut.rig.reset();
    expect(cut.rig.panned).toBe(false);
    expect(Math.abs(cut.centreOnScreen().x)).toBeLessThan(1e-3);
  });

  it("says when the view is slid (the stage hides the shadow under the hem) and when it is back", () => {
    const infos: boolean[] = [];
    let now = 0;
    const camera = new PerspectiveCamera(35, 360 / 520, 0.05, 50);
    const rig = new CameraRig(camera, () => undefined, () => now);
    rig.update({}, CENTER, SIZE, {
      framing: frameInFreeArea(SIZE, 35, { width: 360, height: 520 }, { top: 0, right: 0, bottom: 0, left: 0 }),
      viewport: { width: 360, height: 520 },
      reducedMotion: false,
      fovDegrees: 35,
      onChange: (info) => infos.push(info.panned),
    });
    rig.panBy(50, 0);
    expect(infos.at(-1)).toBe(true);
    rig.reset();
    for (let t = 0; t < 500; t += 16) {
      now += 16;
      rig.frame();
    }
    expect(infos.at(-1)).toBe(false);
  });

  it("each slide asks for one frame, and a slide of nothing asks for none", () => {
    const { rig, frames } = setup();
    const before = frames();
    rig.panBy(0, 0);
    expect(frames()).toBe(before);
    rig.panBy(5, 5);
    expect(frames()).toBe(before + 1);
  });

  it("two fingers slide by the middle of the fingers", () => {
    expect(slideCentre([{ x: 0, y: 0 }, { x: 100, y: 40 }])).toEqual({ x: 50, y: 20 });
    expect(slideCentre([])).toEqual({ x: 0, y: 0 });
  });
});

describe("E3f: the canvas's slide gestures (source guards)", () => {
  const source = readFileSync(new URL("./DesignCanvas.tsx", import.meta.url), "utf8");
  it("the right button and Shift + drag start a slide before any item or turn logic sees the press, and keep it from the orbit controls", () => {
    const at = source.indexOf("event.button === 2 || (event.button === 0 && event.shiftKey)");
    expect(at).toBeGreaterThan(0);
    expect(at).toBeLessThan(source.indexOf("const action = pressAction("));
    const branch = source.slice(at, at + 400);
    expect(branch).toMatch(/event\.stopPropagation\(\)/);
    expect(branch).toMatch(/rig|slide = \{ mouse: event\.pointerId/);
  });
  it("the browser's own menu does not open on a right-button slide on the canvas", () => {
    expect(source).toMatch(/addEventListener\("contextmenu", onContextMenu\)/);
  });
  it("the orbit controls still do not pan on their own (the rig owns the slide, so Reset and the aim know of it)", () => {
    expect(source).toMatch(/enablePan=\{false\}/);
  });
});
