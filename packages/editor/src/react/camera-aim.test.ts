/**
 * E3d (07-editor-review R22, R24, 4.6): zoom aims at the selected item (or the pointer), never losing the garment's
 * centre; a small selected item is zoomed in on and given back; zooming in stops while the item still fits.
 */
import { PerspectiveCamera } from "three";
import { describe, expect, it } from "vitest";
import { CameraRig, aimFor, aimVectorFor } from "./camera-rig";
import { frameInFreeArea, orbitOf } from "./camera";
import { itemFitDistance, itemLongSide, itemOverflowFactor } from "./DesignCanvas";

const SIZE: [number, number, number] = [0.75, 0.73, 0.3];
const CENTER: [number, number, number] = [0, 1.1, 0];

function setup() {
  let now = 0;
  const camera = new PerspectiveCamera(35, 360 / 520, 0.05, 50);
  const targets: [number, number, number][] = [];
  const infos: { canZoomIn: boolean }[] = [];
  const rig = new CameraRig(camera, () => undefined, () => now);
  const framing = frameInFreeArea(SIZE, 35, { width: 360, height: 520 });
  rig.update({}, CENTER, SIZE, { framing, viewport: { width: 360, height: 520 }, reducedMotion: false, fovDegrees: 35, onTarget: (t) => targets.push(t), onChange: (i) => infos.push(i) });
  const run = (ms = 600) => {
    for (let t = 0; t <= ms; t += 16) {
      now += 16;
      rig.frame();
    }
  };
  const target = () => targets.at(-1) ?? CENTER;
  const distance = () => orbitOf(target(), camera.position.toArray() as [number, number, number]).distance;
  return { rig, camera, framing, run, target, distance, infos };
}

describe("aimFor", () => {
  it("none at the rest framing or further out; all of it from 0.75 in; clamped so the centre stays in view", () => {
    expect(aimFor(0.2, 1, 1)).toBe(0);
    expect(aimFor(0.2, 1.4, 1)).toBe(0);
    expect(aimFor(0.2, 0.875, 1)).toBeCloseTo(0.1, 9);
    expect(aimFor(0.2, 0.5, 1)).toBeCloseTo(0.2, 9);
    expect(aimFor(0.5, 0.4, 0.3)).toBeCloseTo(0.255, 9);
    expect(aimFor(-0.5, 0.4, 0.3)).toBeCloseTo(-0.255, 9);
  });
});

describe("aimVectorFor", () => {
  it("an item off the centre line (a left-chest logo): aimed at across as well, within the free width", () => {
    const [x, y, z] = aimVectorFor([0.1, 0.15, 0.12], 0.5, 1, 1);
    expect([x, y, z]).toEqual([0.1, 0.15, 0.12]);
    const far = aimVectorFor([0.6, 0, 0.8], 0.5, 1, 0.5);
    expect(Math.hypot(far[0], far[2])).toBeCloseTo(0.425, 9);
    expect(aimVectorFor([0.1, 0.1, 0.1], 1.2, 1, 1)).toEqual([0, 0, 0]);
  });
});

describe("the camera's aim (R24)", () => {
  it("zooming in on an item to one side moves the target to that side too", () => {
    const { rig, run, target } = setup();
    rig.setItem([CENTER[0] - 0.1, CENTER[1] + 0.1, CENTER[2] + 0.1]);
    for (let k = 0; k < 6; k++) {
      rig.zoom("in");
      run();
    }
    expect(target()[0]).toBeLessThan(CENTER[0] - 0.05);
  });

  it("zooming in with an item selected moves the target towards the item; Reset brings it back", () => {
    const { rig, run, target } = setup();
    rig.setItem([CENTER[0], CENTER[1] + 0.15, CENTER[2]]);
    for (let k = 0; k < 6; k++) {
      rig.zoom("in");
      run();
    }
    expect(target()[1]).toBeGreaterThan(CENTER[1] + 0.1);
    rig.reset();
    run();
    expect(target()[1]).toBeCloseTo(CENTER[1], 6);
  });

  it("without a selection the buttons zoom to the centre, and the wheel towards the height under the pointer", () => {
    const a = setup();
    for (let k = 0; k < 6; k++) {
      a.rig.zoom("in");
      a.run();
    }
    expect(a.target()[1]).toBeCloseTo(CENTER[1], 6);
    const b = setup();
    b.rig.aimAtPointer(0.1); // near the top of the free area: above the centre
    b.camera.position.set(CENTER[0], CENTER[1], b.distance() * 0.5); // as the controls zoom in by hand
    b.run(32);
    expect(b.target()[1]).toBeGreaterThan(CENTER[1]);
  });
});

describe("zooming in on a small selected item (R22)", () => {
  it("zooms until the item's box is the minimum, and gives the zoom back when the item is let go", () => {
    const { rig, run, distance, framing } = setup();
    const before = distance();
    rig.setItem(CENTER);
    rig.zoomToItem(60, 120);
    run();
    expect(distance()).toBeCloseTo(Math.max(framing.minDistance, before / 2 / 1.03), 6);
    rig.setItem(null);
    run();
    expect(distance()).toBeCloseTo(before, 6);
  });

  it("does nothing for an item already big enough, and stops at the zoom limit", () => {
    const { rig, run, distance, framing } = setup();
    const before = distance();
    rig.zoomToItem(150, 120);
    run();
    expect(distance()).toBeCloseTo(before, 6);
    rig.zoomToItem(5, 120);
    run();
    expect(distance()).toBeCloseTo(framing.minDistance, 6);
  });

  it("keeps a zoom the coach changed afterwards", () => {
    const { rig, run, distance } = setup();
    rig.setItem(CENTER);
    rig.zoomToItem(60, 120);
    run();
    rig.zoom("out");
    run();
    const theirs = distance();
    rig.setItem(null);
    run();
    expect(distance()).toBeCloseTo(theirs, 6);
  });
});

describe("the selected item's zoom limit (4.6)", () => {
  it("the closest distance at which the box and its handles fit; 0 when the stage has no room", () => {
    const box = [
      { x: 100, y: 100 },
      { x: 300, y: 100 },
      { x: 300, y: 300 },
      { x: 100, y: 300 },
    ];
    // 200 px tall in a 450 px stage (400 px of room): it may come twice as close.
    expect(itemFitDistance(box, 2, { width: 1000, height: 450 })).toBeCloseTo(1, 9);
    expect(itemFitDistance(box, 2, { width: 1000, height: 40 })).toBe(0);
    expect(itemLongSide(box)).toBe(200);
  });

  it("zooming in stops there, and the zoom-in button says so", () => {
    const { rig, run, distance, framing, infos } = setup();
    const limit = framing.fit * 0.8;
    rig.setItem(CENTER);
    rig.setItemLimit(limit);
    for (let k = 0; k < 6; k++) {
      rig.zoom("in");
      run();
    }
    expect(distance()).toBeCloseTo(limit, 6);
    expect(infos.at(-1)!.canZoomIn).toBe(false);
    rig.setItem(null);
    expect(rig.minDistance()).toBeCloseTo(framing.minDistance, 9);
  });
});

describe("an item that moves while it is selected (E3e)", () => {
  it("the aim glides after it over several frames instead of jumping, and ends on it", () => {
    const { rig, run, target } = setup();
    rig.setItem([CENTER[0], CENTER[1] + 0.05, CENTER[2]]);
    for (let k = 0; k < 6; k++) {
      rig.zoom("in");
      run();
    }
    const before = target()[1];
    rig.setItem([CENTER[0], CENTER[1] + 0.2, CENTER[2]]);
    run(16);
    const first = target()[1];
    run(1000);
    const end = target()[1];
    expect(end).toBeGreaterThan(before + 0.03);
    expect(first).toBeGreaterThan(before);
    expect(first).toBeLessThan(end - 0.005);
  });
});

describe("frames asked for by the aim (E3e, speed)", () => {
  it("an item that moves while the camera is not zoomed in asks for no frame; one that moves the aim does", () => {
    let asked = 0;
    const camera = new PerspectiveCamera(35, 360 / 520, 0.05, 50);
    let now = 0;
    const rig = new CameraRig(camera, () => asked++, () => now);
    const framing = frameInFreeArea(SIZE, 35, { width: 360, height: 520 });
    rig.update({}, CENTER, SIZE, { framing, viewport: { width: 360, height: 520 }, reducedMotion: false, fovDegrees: 35, onTarget: () => undefined, onChange: () => undefined });
    rig.setItem([CENTER[0], CENTER[1] + 0.05, CENTER[2]]);
    asked = 0;
    for (let k = 1; k <= 20; k++) rig.setItem([CENTER[0], CENTER[1] + 0.05 + k * 0.004, CENTER[2]]);
    expect(asked).toBe(0);
    for (let k = 0; k < 6; k++) {
      rig.zoom("in");
      for (let t = 0; t <= 600; t += 16) {
        now += 16;
        rig.frame();
      }
    }
    asked = 0;
    rig.setItem([CENTER[0], CENTER[1] + 0.2, CENTER[2]]);
    expect(asked).toBeGreaterThan(0);
  });
});

describe("an item the zoom left outside the free stage (E3e)", () => {
  // The free stage on a phone: 390 wide, from y 128 to 552 (the bar's room above is not part of it).
  const free = { x: 0, y: 128, width: 390, height: 424 };
  const box = (top: number, bottom: number, left = 100, right = 200) => [
    { x: left, y: top },
    { x: right, y: top },
    { x: right, y: bottom },
    { x: left, y: bottom },
  ];
  it("1 for a box inside, with room for its handles", () => {
    expect(itemOverflowFactor(box(200, 400), free)).toBe(1);
  });
  it("a box high on the garment, reaching under the bar's room, must come back in proportion", () => {
    // Its top is 77 px above the free stage's top edge: 128 - 77 = 51; the centre is 340; 340 - 51 = 289 over (212 - 45) room.
    expect(itemOverflowFactor(box(51, 300), free)).toBeCloseTo((340 - 51) / (212 - 45), 6);
    expect(itemOverflowFactor(box(51, 300), free)).toBeGreaterThan(1.7);
  });
  it("a box too low, or too far to the side, counts as well", () => {
    expect(itemOverflowFactor(box(400, 600), free)).toBeGreaterThan(1);
    expect(itemOverflowFactor(box(250, 330, 300, 390), free)).toBeGreaterThan(1);
  });
  it("the rig backs off a zoom it made, never past the rest framing, and leaves the coach's own zoom", () => {
    const { rig, run, distance, framing } = setup();
    const rest = distance();
    rig.setItem(CENTER);
    rig.zoomToItem(40, 160);
    run();
    const zoomed = distance();
    expect(zoomed).toBeLessThan(rest);
    rig.backOffFromItem(1.5);
    run();
    expect(distance()).toBeGreaterThan(zoomed + 1e-6);
    rig.backOffFromItem(50);
    run();
    expect(distance()).toBeCloseTo(framing.fit, 6);
    const other = setup();
    other.rig.zoom("in");
    other.run();
    const theirs = other.distance();
    other.rig.backOffFromItem(2);
    other.run();
    expect(other.distance()).toBeCloseTo(theirs, 6);
  });
});

describe("the frame after a camera move (E3e)", () => {
  it("one more frame is asked for when the move ends, so what waits for the camera to stand still can run", () => {
    let asked = 0;
    const camera = new PerspectiveCamera(35, 360 / 520, 0.05, 50);
    let now = 0;
    const rig = new CameraRig(camera, () => asked++, () => now);
    const framing = frameInFreeArea(SIZE, 35, { width: 360, height: 520 });
    rig.update({}, CENTER, SIZE, { framing, viewport: { width: 360, height: 520 }, reducedMotion: false, fovDegrees: 35, onTarget: () => undefined, onChange: () => undefined });
    rig.zoom("in");
    for (let t = 0; t < 2000 && rig.animating; t += 16) {
      now += 16;
      rig.frame();
    }
    expect(rig.animating).toBe(false);
    // The last frame of a move (its end) asks once more.
    rig.zoom("in");
    asked = 0;
    now += 5000;
    rig.frame();
    expect(rig.animating).toBe(false);
    expect(asked).toBeGreaterThan(0);
  });
});
