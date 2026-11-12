import { PerspectiveCamera } from "three";
import { describe, expect, it } from "vitest";
import { CameraRig, type CameraRigInfo } from "./camera-rig";
import { SIDE_AZIMUTH, frameInFreeArea, orbitOf, wrapAngle } from "./camera";
import { createDesign } from "../design/create";
import { setRoleSlot } from "../design/roles";
import { loadPlaceholderFonts, loadStandInJerseyProduct } from "../test/fixtures";

const SIZE: [number, number, number] = [0.75, 0.73, 0.3];
const CENTER: [number, number, number] = [0, 1.1, 0];

function setup(options: { reducedMotion?: boolean; bottom?: number } = {}) {
  let now = 0;
  const camera = new PerspectiveCamera(35, 360 / 520, 0.05, 50);
  let frames = 0;
  const infos: CameraRigInfo[] = [];
  const rig = new CameraRig(camera, () => frames++, () => now);
  const model = {};
  const configure = (bottom = options.bottom ?? 0) =>
    rig.update(model, CENTER, SIZE, {
      framing: frameInFreeArea(SIZE, 35, { width: 360, height: 520 }, { top: 0, right: 0, bottom, left: 0 }),
      viewport: { width: 360, height: 520 },
      reducedMotion: options.reducedMotion ?? false,
      fovDegrees: 35,
      onChange: (info) => infos.push(info),
    });
  configure();
  const orbit = () => orbitOf(CENTER, camera.position.toArray() as [number, number, number]);
  const run = (ms: number) => {
    for (let t = 0; t <= ms; t += 16) {
      now += 16;
      rig.frame();
    }
  };
  return { rig, camera, orbit, run, configure, infos, frames: () => frames };
}

describe("the camera rig (N7)", () => {
  it("starts at the front, framed to fit, and reports the side and zoom", () => {
    const { orbit, infos, camera } = setup();
    expect(Math.abs(orbit().azimuth)).toBeLessThan(1e-9);
    expect(orbit().distance).toBeCloseTo(frameInFreeArea(SIZE, 35, { width: 360, height: 520 }).fit, 6);
    expect(infos.at(-1)).toEqual({ side: "front", canZoomIn: true, canZoomOut: true });
    expect(camera.view?.enabled ?? false).toBe(false);
  });

  it("turns to a side over 350 ms (never jumps), and cuts with reduced motion", () => {
    const { rig, orbit, run, infos } = setup();
    rig.showSide("back");
    expect(rig.animating).toBe(true);
    run(160);
    const mid = Math.abs(wrapAngle(orbit().azimuth));
    expect(mid).toBeGreaterThan(0.2);
    expect(mid).toBeLessThan(Math.PI - 0.2);
    run(250);
    expect(rig.animating).toBe(false);
    expect(Math.abs(wrapAngle(orbit().azimuth - SIDE_AZIMUTH.back))).toBeLessThan(1e-6);
    expect(infos.at(-1)!.side).toBe("back");
    const reduced = setup({ reducedMotion: true });
    reduced.rig.showSide("left");
    expect(reduced.rig.animating).toBe(false);
    expect(reduced.rig.side()).toBe("left");
  });

  it("a panel opening re-frames the garment above it: the projection moves up and the camera backs off", () => {
    const { configure, camera, orbit, run } = setup();
    const before = orbit().distance;
    configure(172);
    run(260);
    expect(camera.view?.enabled).toBe(true);
    expect(camera.view?.offsetY).toBeCloseTo(86, 6);
    expect(orbit().distance).toBeGreaterThan(before);
  });

  it("zooms in steps and stops at the limit; reset goes back to the front at the fitting distance", () => {
    const { rig, orbit, run, infos } = setup({ reducedMotion: true });
    const fit = orbit().distance;
    rig.zoom("in");
    expect(orbit().distance).toBeCloseTo(fit / 1.25, 6);
    for (let k = 0; k < 10; k++) rig.zoom("in");
    expect(infos.at(-1)!.canZoomIn).toBe(false);
    rig.showSide("right");
    rig.reset();
    run(0);
    expect(orbit().distance).toBeCloseTo(fit, 6);
    expect(rig.side()).toBe("front");
  });

  it("focuses on the item being typed (its side, closer, its height in the middle) and returns", () => {
    const product = loadStandInJerseyProduct();
    let design = createDesign(product, { samplePlayer: { name: "ALI", number: "10" } });
    design = setRoleSlot(design, "player-name", "back-name", true, { product, fonts: loadPlaceholderFonts(), style: { fontId: "oswald-700", fill: { id: "placeholder-navy", hex: "#1B2A5C" } } });
    const { rig, orbit, camera } = setup({ reducedMotion: true });
    const fit = orbit().distance;
    rig.focusOn(design, product, design.layers[0]!.id, { zoom: true });
    expect(rig.side()).toBe("back");
    expect(orbit().distance).toBeLessThan(fit);
    // The name sits high on the back: the view moves down to bring it to the middle.
    expect(camera.view?.offsetY).toBeLessThan(0);
    rig.focusOn(design, product, null);
    expect(orbit().distance).toBeCloseTo(fit, 6);
  });

  it("a turn by hand stops our move and is told apart from a tap", () => {
    const { rig, camera, orbit } = setup();
    rig.showSide("back");
    rig.userStart();
    expect(rig.animating).toBe(false);
    expect(rig.userEnd()).toBe(false); // nothing moved: a tap
    rig.userStart();
    const o = orbit();
    camera.position.set(CENTER[0] + Math.sin(o.azimuth + 0.4) * 2, CENTER[1], CENTER[2] + Math.cos(o.azimuth + 0.4) * 2);
    expect(rig.userEnd()).toBe(true);
  });
});
