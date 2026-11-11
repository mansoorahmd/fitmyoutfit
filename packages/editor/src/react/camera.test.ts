import { describe, expect, it } from "vitest";
import { MAX_ZOOM_FACTOR, MIN_ZOOM_FACTOR, orbitLimits } from "./camera";

// The placeholder jersey's bounding box, roughly, in metres.
const JERSEY: [number, number, number] = [0.75, 0.73, 0.3];
const radius = 0.5 * Math.hypot(...JERSEY);

describe("orbitLimits", () => {
  it("fits the garment's bounding sphere in the narrower side of the view", () => {
    const wide = orbitLimits(JERSEY, 35, 1366 / 726);
    expect(wide.fit).toBeCloseTo(radius / Math.sin((17.5 * Math.PI) / 180), 9);
    // A portrait phone view is narrower than it is tall: the width decides, so the camera moves back.
    const phone = orbitLimits(JERSEY, 35, 390 / 490);
    const halfH = Math.atan(Math.tan((17.5 * Math.PI) / 180) * (390 / 490));
    expect(phone.fit).toBeCloseTo(radius / Math.sin(halfH), 9);
    expect(phone.fit).toBeGreaterThan(wide.fit);
  });

  it("never lets the camera inside the garment or so far away that it is lost", () => {
    for (const aspect of [0.4, 390 / 490, 1, 16 / 9, 3]) {
      const l = orbitLimits(JERSEY, 35, aspect);
      expect(l.minDistance).toBeGreaterThan(radius);
      expect(l.minDistance).toBeLessThan(l.fit);
      expect(l.maxDistance).toBeCloseTo(l.fit * MAX_ZOOM_FACTOR, 9);
      expect(l.minDistance).toBeGreaterThanOrEqual(l.fit * MIN_ZOOM_FACTOR);
    }
  });

  it("keeps the view between above and slightly below the garment, never over the top or underneath", () => {
    const l = orbitLimits(JERSEY, 35, 1);
    expect(l.minPolarAngle).toBeGreaterThan(0);
    expect(l.maxPolarAngle).toBeLessThan(Math.PI * 0.75);
    expect(l.minPolarAngle).toBeLessThan(Math.PI / 2);
    expect(l.maxPolarAngle).toBeGreaterThan(Math.PI / 2);
  });

  it("copes with a view that has no size yet", () => {
    for (const aspect of [0, NaN, Infinity, -1]) {
      const l = orbitLimits(JERSEY, 35, aspect);
      expect(Number.isFinite(l.fit)).toBe(true);
      expect(l.fit).toBeGreaterThan(0);
    }
  });
});
