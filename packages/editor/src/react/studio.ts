/**
 * The studio the garment is shown in: soft lights and a quiet background,
 * as data and plain maths (no Three.js), so they are tested and tuned in one
 * place. Cheap on a phone: a sky light and three directional lights, no
 * shadows, no environment map.
 *
 * The directional lights move with the camera (a photographer's lights stay
 * where the camera is, not where the garment is), so every side of the
 * garment is lit the same way when the customer turns it. The sky light stays
 * above, so the top of the garment is always a little brighter than the hem.
 */

export type Vec3 = [number, number, number];

/** A light placed in the camera's frame: `right`, `up` and `toward` (towards the camera) in units of the garment's fitting distance. */
export interface StudioLight {
  name: string;
  intensity: number;
  color: string;
  right: number;
  up: number;
  toward: number;
}

export const STUDIO_LIGHTS: { sky: { color: string; ground: string; intensity: number }; lights: StudioLight[] } = {
  // Light from above, a warm grey from below (the floor of the studio).
  sky: { color: "#ffffff", ground: "#c4c4c4", intensity: 1.35 },
  lights: [
    // Key: above, to the right of the camera; gives the folds their shape.
    { name: "key", intensity: 2.6, color: "#fffaf2", right: 0.6, up: 1.1, toward: 1.2 },
    // Fill: low, to the left; lifts the key's shadows without flattening them.
    { name: "fill", intensity: 0.55, color: "#f2f5ff", right: -1.3, up: 0.1, toward: 0.8 },
    // Rim: behind and above the garment; separates its edges from the background.
    { name: "rim", intensity: 1.3, color: "#ffffff", right: 0.5, up: 1.2, toward: -1 },
  ],
};

/** The 3D view's background (CSS): a soft studio sweep, lighter behind the garment. */
export const STUDIO_BACKGROUND = "radial-gradient(ellipse 75% 70% at 50% 42%, #ffffff 0%, #f1f2f4 52%, #dcdfe4 100%)";

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (a: Vec3): Vec3 => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};

/**
 * Where a studio light goes, for a camera at `camera` looking at `target`
 * (world up +Y), `distance` being the garment's fitting distance.
 */
export function studioLightPosition(light: Pick<StudioLight, "right" | "up" | "toward">, camera: Vec3, target: Vec3, distance: number): Vec3 {
  const toward = unit(sub(camera, target));
  let right = cross([0, 1, 0], toward);
  // Looking straight down or up: any horizontal right will do.
  if (Math.hypot(right[0], right[1], right[2]) < 1e-6) right = [1, 0, 0];
  right = unit(right);
  const up = cross(toward, right);
  return [0, 1, 2].map(
    (k) => target[k]! + distance * (light.right * right[k]! + light.up * up[k]! + light.toward * toward[k]!),
  ) as Vec3;
}
