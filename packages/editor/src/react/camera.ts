/**
 * Camera framing for the orbit view, as plain maths (no Three.js), so it can
 * be tested. The garment is kept whole on screen from every angle: the camera
 * always looks at the garment's centre (no panning), and the distance limits
 * are multiples of the distance at which the garment's bounding sphere fits
 * the narrower side of the view.
 */

export interface OrbitLimits {
  /** Distance from the garment's centre at which it fits the view from any angle. */
  fit: number;
  /** Closest zoom: close enough to see details, never inside the garment. */
  minDistance: number;
  /** Furthest zoom: the garment still fills a fair part of the view. */
  maxDistance: number;
  /** Polar angle limits in radians (0 looks straight down): no views from directly above or below. */
  minPolarAngle: number;
  maxPolarAngle: number;
}

/** Closest zoom as a share of the fitting distance. */
export const MIN_ZOOM_FACTOR = 0.45;
/** Furthest zoom as a multiple of the fitting distance. */
export const MAX_ZOOM_FACTOR = 1.6;

/**
 * @param size the garment's bounding box (width, height, depth), any unit
 * @param fovDegrees the camera's vertical field of view
 * @param aspect view width divided by height
 */
export function orbitLimits(size: readonly [number, number, number], fovDegrees: number, aspect: number): OrbitLimits {
  const radius = 0.5 * Math.hypot(size[0], size[1], size[2]);
  const halfV = (fovDegrees * Math.PI) / 360;
  const safeAspect = Number.isFinite(aspect) && aspect > 0 ? aspect : 1;
  const halfH = Math.atan(Math.tan(halfV) * safeAspect);
  const fit = radius / Math.sin(Math.min(halfV, halfH));
  return {
    fit,
    // Never closer than just outside the bounding sphere, whatever the factor says.
    minDistance: Math.max(fit * MIN_ZOOM_FACTOR, radius * 1.15),
    maxDistance: fit * MAX_ZOOM_FACTOR,
    // From 50 degrees above the garment's middle to 22 degrees below it: never into the neck or up the hem.
    minPolarAngle: Math.PI * 0.22,
    maxPolarAngle: Math.PI * 0.62,
  };
}
