import { describe, expect, it } from "vitest";
import {
  CAMERA_QUIET_MS,
  SIDE_AZIMUTH,
  SIDE_POLAR,
  canZoom,
  easeInOut,
  easeOut,
  focusOffsetY,
  frameInFreeArea,
  mayMoveCamera,
  orbitLimits,
  orbitOf,
  orbitPosition,
  sideFromAzimuth,
  tweenOrbit,
  wrapAngle,
  zoomedDistance,
} from "./camera";

const JERSEY: [number, number, number] = [0.75, 0.73, 0.3];
const deg = (d: number) => (d * Math.PI) / 180;

describe("framing in the free area (viewInsets)", () => {
  it("without insets: the same fit as orbitLimits, no offset", () => {
    const f = frameInFreeArea(JERSEY, 35, { width: 390, height: 668 });
    expect(f.fit).toBeCloseTo(orbitLimits(JERSEY, 35, 390 / 668).fit, 9);
    expect(f.offset).toEqual({ x: 0, y: 0 });
    expect(f.free).toEqual({ x: 0, y: 0, width: 390, height: 668 });
  });

  it("a bottom panel: the garment moves up into the free area and the camera backs off to fit it there", () => {
    const full = frameInFreeArea(JERSEY, 35, { width: 360, height: 520 });
    const open = frameInFreeArea(JERSEY, 35, { width: 360, height: 520 }, { top: 0, right: 0, bottom: 172, left: 0 });
    // The projection's centre is the middle of the free area: 86 px above the canvas's middle.
    expect(open.offset).toEqual({ x: 0, y: 86 });
    expect(open.free.height).toBe(348);
    expect(open.fit).toBeGreaterThan(full.fit);
    // The garment's bounding sphere fits the free area: its angular size equals the free area's narrower angle.
    const t = Math.tan(deg(17.5));
    const radius = 0.5 * Math.hypot(...JERSEY);
    const halfFree = Math.min(Math.atan((t * 348) / 520), Math.atan((t * 360) / 520));
    expect(Math.asin(radius / open.fit)).toBeCloseTo(halfFree, 9);
    expect(open.minDistance).toBeLessThan(open.fit);
    expect(open.maxDistance).toBeGreaterThan(open.fit);
  });

  it("a side panel on the right (short layout): the garment moves left", () => {
    const f = frameInFreeArea(JERSEY, 35, { width: 780, height: 342 }, { top: 0, right: 320, bottom: 0, left: 0 });
    expect(f.offset).toEqual({ x: 160, y: 0 });
    expect(f.free).toEqual({ x: 0, y: 0, width: 460, height: 342 });
  });

  it("insets larger than the canvas are clamped: there is always a free pixel", () => {
    const f = frameInFreeArea(JERSEY, 35, { width: 100, height: 100 }, { top: 0, right: 0, bottom: 500, left: 0 });
    expect(f.free.height).toBe(1);
    expect(Number.isFinite(f.fit)).toBe(true);
  });
});

describe("sides, turns and zoom", () => {
  it("names the side the camera faces, or none when turned freely", () => {
    expect(sideFromAzimuth(0)).toBe("front");
    expect(sideFromAzimuth(deg(185))).toBe("back");
    expect(sideFromAzimuth(deg(-179))).toBe("back");
    expect(sideFromAzimuth(deg(88))).toBe("left");
    expect(sideFromAzimuth(deg(-95))).toBe("right");
    expect(sideFromAzimuth(deg(45))).toBeNull();
    expect(SIDE_AZIMUTH.left).toBeCloseTo(Math.PI / 2, 12);
  });

  it("turns the short way round, and the orbit round-trips through a position", () => {
    const from = { azimuth: deg(170), polar: SIDE_POLAR, distance: 2 };
    const to = { azimuth: deg(-170), polar: SIDE_POLAR, distance: 2 };
    const half = tweenOrbit(from, to, 0.5);
    expect(Math.abs(wrapAngle(half.azimuth - Math.PI))).toBeLessThan(1e-9);
    const center: [number, number, number] = [0.1, 1.2, -0.05];
    const orbit = { azimuth: deg(30), polar: deg(80), distance: 1.7 };
    const back = orbitOf(center, orbitPosition(center, orbit));
    expect(back.azimuth).toBeCloseTo(orbit.azimuth, 9);
    expect(back.polar).toBeCloseTo(orbit.polar, 9);
    expect(back.distance).toBeCloseTo(orbit.distance, 9);
    // The front view looks from +Z.
    expect(orbitPosition([0, 0, 0], { azimuth: 0, polar: Math.PI / 2, distance: 1 })[2]).toBeCloseTo(1, 12);
  });

  it("eases from 0 to 1, symmetric in and out", () => {
    expect(easeInOut(0)).toBe(0);
    expect(easeInOut(1)).toBe(1);
    expect(easeInOut(0.5)).toBeCloseTo(0.5, 12);
    expect(easeInOut(0.25) + easeInOut(0.75)).toBeCloseTo(1, 12);
    expect(easeOut(0.5)).toBeGreaterThan(0.5);
    expect(easeOut(2)).toBe(1);
  });

  it("zooms in steps of 1.25 within the limits; the buttons are inactive at the ends", () => {
    const limits = { minDistance: 1, maxDistance: 4 };
    expect(zoomedDistance(2, "in", limits)).toBeCloseTo(1.6, 12);
    expect(zoomedDistance(2, "out", limits)).toBeCloseTo(2.5, 12);
    expect(zoomedDistance(1.1, "in", limits)).toBe(1);
    expect(zoomedDistance(3.5, "out", limits)).toBe(4);
    expect(canZoom(1, limits)).toEqual({ in: false, out: true });
    expect(canZoom(4, limits)).toEqual({ in: true, out: false });
    expect(canZoom(2, limits)).toEqual({ in: true, out: true });
  });
});

describe("when the camera may move by itself (06-editor.md 6.3)", () => {
  it("never while a finger or the mouse is down, nor within 1.5 s of the coach turning it", () => {
    expect(mayMoveCamera({ now: 10_000, pointerDown: false, lastUserTurnAt: null })).toBe(true);
    expect(mayMoveCamera({ now: 10_000, pointerDown: true, lastUserTurnAt: null })).toBe(false);
    expect(mayMoveCamera({ now: 10_000, pointerDown: false, lastUserTurnAt: 10_000 - 400 })).toBe(false);
    expect(mayMoveCamera({ now: 10_000, pointerDown: false, lastUserTurnAt: 10_000 - CAMERA_QUIET_MS })).toBe(true);
    expect(CAMERA_QUIET_MS).toBe(1500);
  });
});

describe("focusing on the item being typed", () => {
  it("shifts a point above the garment's middle down into the middle of the view, and leaves the middle alone", () => {
    expect(focusOffsetY(0.7, 0.5, 2, 35, 400)).toBeCloseTo(0, 12);
    const chest = focusOffsetY(0.7, 0.3, 2, 35, 400);
    // 0.2 of 0.7 m above the middle, at 2 m with a 35 degree view on 400 px: 0.14 m * 400 / (4 tan 17.5).
    expect(chest).toBeCloseTo(-(0.14 * 400) / (4 * Math.tan(deg(17.5))), 9);
  });
});
