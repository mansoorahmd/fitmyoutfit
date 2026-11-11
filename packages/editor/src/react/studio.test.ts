import { describe, expect, it } from "vitest";
import { STUDIO_LIGHTS, studioLightPosition, type Vec3 } from "./studio";

const target: Vec3 = [0, 0.35, 0];
const key = STUDIO_LIGHTS.lights.find((l) => l.name === "key")!;
const rim = STUDIO_LIGHTS.lights.find((l) => l.name === "rim")!;

describe("studioLightPosition", () => {
  it("puts the key light above, to the right of and in front of the camera's view", () => {
    // Camera in front of the garment (+Z), looking at it: its right is +X.
    const p = studioLightPosition(key, [0, 0.35, 2], target, 2);
    expect(p[0]).toBeGreaterThan(0);
    expect(p[1]).toBeGreaterThan(target[1]);
    expect(p[2]).toBeGreaterThan(0);
  });

  it("moves with the camera: seen from behind, the key light is still on the camera's right", () => {
    const p = studioLightPosition(key, [0, 0.35, -2], target, 2);
    expect(p[0]).toBeLessThan(0); // the camera's right is -X from behind
    expect(p[2]).toBeLessThan(0); // on the camera's side of the garment
  });

  it("puts the rim light behind the garment, as seen from the camera", () => {
    const p = studioLightPosition(rim, [2, 0.35, 0], target, 2);
    expect(p[0]).toBeLessThan(0);
  });

  it("places lights at the given distance in the camera's frame", () => {
    const p = studioLightPosition({ right: 0, up: 0, toward: 1 }, [0, 0.35, 5], target, 3);
    expect(p).toEqual([0, 0.35, 3]);
  });

  it("copes with a camera straight above the garment", () => {
    const p = studioLightPosition(key, [0, 5, 0], target, 2);
    for (const c of p) expect(Number.isFinite(c)).toBe(true);
  });

  it("is cheap: a sky light and three directional lights, no more", () => {
    expect(STUDIO_LIGHTS.lights).toHaveLength(3);
  });
});
