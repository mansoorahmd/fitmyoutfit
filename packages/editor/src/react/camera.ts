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

/** Closest zoom as a share of the fitting distance (E3d: 0.35, so a number selected on a small phone reaches 120 px, R22). */
export const MIN_ZOOM_FACTOR = 0.35;
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

// ---------------------------------------------------------------------------
// The interface's camera (N7, 06-editor.md 3.3 and 6): framing in the free
// area beside or above a tool panel, sides, zoom steps, animated turns, and
// when the camera may move by itself.

/** How much of the canvas a panel covers, in CSS pixels, per edge. */
export interface ViewInsets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export const NO_INSETS: ViewInsets = Object.freeze({ top: 0, right: 0, bottom: 0, left: 0 });

/** The canvas size, in CSS pixels. */
export interface Viewport {
  width: number;
  height: number;
}

export interface Framing extends OrbitLimits {
  /**
   * The projection's offset (for `camera.setViewOffset(width, height, x, y,
   * width, height)`): the garment's centre then shows in the middle of the
   * free area instead of the middle of the canvas.
   */
  offset: { x: number; y: number };
  /** The free area, in CSS pixels. */
  free: { x: number; y: number; width: number; height: number };
}

/**
 * The orbit limits for the free area of the canvas (the part no panel
 * covers), and the offset that centres the garment in it. The canvas keeps
 * its full size (resizing it while a panel moves would reallocate the drawing
 * buffer every frame); only the projection moves.
 */
export function frameInFreeArea(size: readonly [number, number, number], fovDegrees: number, viewport: Viewport, insets: ViewInsets = NO_INSETS): Framing {
  const W = Math.max(1, viewport.width);
  const H = Math.max(1, viewport.height);
  const left = clamp(insets.left, 0, W - 1);
  const right = clamp(insets.right, 0, W - 1 - left);
  const top = clamp(insets.top, 0, H - 1);
  const bottom = clamp(insets.bottom, 0, H - 1 - top);
  const fw = Math.max(1, W - left - right);
  const fh = Math.max(1, H - top - bottom);
  // The free area sees a narrower angle than the canvas: tan scales with its share of the canvas height.
  const t = Math.tan((fovDegrees * Math.PI) / 360);
  const radius = 0.5 * Math.hypot(size[0], size[1], size[2]);
  const fit = garmentFitDistance(size, (t * fh) / H, (t * fw) / H);
  const base = orbitLimits(size, fovDegrees, W / H);
  return {
    ...base,
    fit,
    minDistance: Math.max(fit * MIN_ZOOM_FACTOR, radius * 1.15),
    maxDistance: fit * MAX_ZOOM_FACTOR,
    offset: { x: W / 2 - (left + fw / 2), y: H / 2 - (top + fh / 2) },
    free: { x: left, y: top, width: fw, height: fh },
  };
}

/**
 * The stage's framing rule (E3d, 07-editor-review 4.6, R22, R23): at rest the garment's own height fills
 * about 77% of the free area's height (75 to 80% wide, 72 to 80% compact: one value meets both), within the
 * width limits below. Fitting the bounding sphere instead left a third of the stage empty. `FRAME_FILL` is the
 * share of the model's bounding box; the garment as drawn (seen a little from above, its hem and collar inside
 * the box) measures about 1.02 of it: 0.77 gives 0.78 to 0.79 measured (magenta method, six sizes, both models;
 * the free area without the credit, hint or bar and view rows). On an upright phone with nothing open the width
 * binds first: the jersey reaches 0.74, the T-shirt (wider sleeves) 0.63.
 */
export const FRAME_FILL = 0.77;
/** The garment's width seen from the front, at most this share of the free width (a phone held upright). */
export const FRAME_FILL_WIDTH = 0.94;
/** Turned any way (the box's diagonal seen from above), it never reaches the free area's sides. */
export const FRAME_FILL_TURNED = 0.99;

/** The camera distance for that rule, from the tangents of the free area's half angles (vertical, horizontal). */
export function garmentFitDistance(size: readonly [number, number, number], tanHalfV: number, tanHalfH: number, fill = FRAME_FILL): number {
  const [w, h, d] = size;
  const tv = Math.max(1e-6, tanHalfV);
  const th = Math.max(1e-6, tanHalfH);
  const byHeight = (0.5 * h) / (fill * tv);
  const byWidth = (0.5 * w) / (FRAME_FILL_WIDTH * th);
  const byTurn = (0.5 * Math.hypot(w, d)) / (FRAME_FILL_TURNED * th);
  return Math.max(byHeight, byWidth, byTurn);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(Number.isFinite(value) ? value : 0, min), Math.max(min, max));
}

/** Which side of the garment the camera looks at. "left" is the wearer's left (the garment's +X). */
export type ViewSideName = "front" | "back" | "left" | "right";

/** The camera's angle round the garment for each side, in radians: 0 looks at the front (from +Z), +90 degrees from +X. */
export const SIDE_AZIMUTH: Readonly<Record<ViewSideName, number>> = Object.freeze({ front: 0, left: Math.PI / 2, back: Math.PI, right: -Math.PI / 2 });

/** The polar angle of the side views (a little above the middle), radians from straight above. */
export const SIDE_POLAR = Math.acos(0.12 / Math.hypot(1, 0.12));

/** An angle wrapped to (-PI, PI]. */
export function wrapAngle(angle: number): number {
  let a = angle % (2 * Math.PI);
  if (a <= -Math.PI) a += 2 * Math.PI;
  if (a > Math.PI) a -= 2 * Math.PI;
  return a;
}

/** The camera's angle round the garment from its position relative to the garment's centre. */
export function azimuthOf(dx: number, dz: number): number {
  return Math.atan2(dx, dz);
}

/** The side the camera faces, when it is within `tolerance` radians of one (default 20 degrees), else null (turned freely). */
export function sideFromAzimuth(azimuth: number, tolerance = (20 * Math.PI) / 180): ViewSideName | null {
  for (const side of Object.keys(SIDE_AZIMUTH) as ViewSideName[]) {
    if (Math.abs(wrapAngle(azimuth - SIDE_AZIMUTH[side])) <= tolerance) return side;
  }
  return null;
}

/** Zoom steps of the + and - buttons (06-editor.md 6.1). */
export const ZOOM_STEP = 1.25;

/** The distance after one zoom step in (closer) or out, within the limits. */
export function zoomedDistance(distance: number, direction: "in" | "out", limits: Pick<OrbitLimits, "minDistance" | "maxDistance">): number {
  const next = direction === "in" ? distance / ZOOM_STEP : distance * ZOOM_STEP;
  return Math.min(limits.maxDistance, Math.max(limits.minDistance, next));
}

/** Whether a zoom step in or out would still move the camera (the buttons are inactive at the limits). */
export function canZoom(distance: number, limits: Pick<OrbitLimits, "minDistance" | "maxDistance">): { in: boolean; out: boolean } {
  const slack = 1e-6 * limits.maxDistance;
  return { in: distance > limits.minDistance + slack, out: distance < limits.maxDistance - slack };
}

/** A camera position round the garment: angle round it, angle from above, distance. */
export interface Orbit {
  azimuth: number;
  polar: number;
  distance: number;
}

/** Ease in and out (camera turns: 350 ms). */
export function easeInOut(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

/** Ease out (re-framing: 200 ms). */
export function easeOut(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return 1 - Math.pow(1 - x, 3);
}

/** The orbit part way (`t`, 0 to 1, already eased) from one to another, turning the short way round. */
export function tweenOrbit(from: Orbit, to: Orbit, t: number): Orbit {
  const k = Math.min(1, Math.max(0, t));
  return {
    azimuth: wrapAngle(from.azimuth + wrapAngle(to.azimuth - from.azimuth) * k),
    polar: from.polar + (to.polar - from.polar) * k,
    distance: from.distance + (to.distance - from.distance) * k,
  };
}

/** The camera's position for an orbit round a centre. */
export function orbitPosition(center: readonly [number, number, number], orbit: Orbit): [number, number, number] {
  const s = Math.sin(orbit.polar) * orbit.distance;
  return [center[0] + s * Math.sin(orbit.azimuth), center[1] + Math.cos(orbit.polar) * orbit.distance, center[2] + s * Math.cos(orbit.azimuth)];
}

/** The orbit of a camera position round a centre. */
export function orbitOf(center: readonly [number, number, number], position: readonly [number, number, number]): Orbit {
  const dx = position[0] - center[0];
  const dy = position[1] - center[1];
  const dz = position[2] - center[2];
  const distance = Math.hypot(dx, dy, dz) || 1;
  return { azimuth: azimuthOf(dx, dz), polar: Math.acos(Math.min(1, Math.max(-1, dy / distance))), distance };
}

/** Durations of the camera's own moves, in ms (06-editor.md 6.3): turns and re-framing. Reduced motion: 0 (a cut). */
export const CAMERA_TURN_MS = 350;
export const CAMERA_REFRAME_MS = 200;

/** How long after the coach turned the garment by hand the camera keeps still (06-editor.md 6.3). */
export const CAMERA_QUIET_MS = 1500;

/**
 * Whether the camera may move by itself now: never while a finger or the
 * mouse is down on the stage, and not within `CAMERA_QUIET_MS` of the coach
 * turning the garment by hand (they are looking at something).
 */
export function mayMoveCamera(state: { now: number; pointerDown: boolean; lastUserTurnAt: number | null }, quietMs: number = CAMERA_QUIET_MS): boolean {
  if (state.pointerDown) return false;
  return state.lastUserTurnAt === null || state.now - state.lastUserTurnAt >= quietMs;
}

/**
 * The extra view offset (CSS pixels) that brings a point of the garment
 * towards the middle of the free area when zoomed in to it: the item being
 * typed (06-editor.md 3.3). `height` is the garment's height (world units),
 * `fraction` how far down the garment the point is (0 the top, 1 the hem),
 * `distance` the camera's distance. Without a lookup from the pattern to the
 * model (N9, E3b) this works from the piece's height alone: good for names on
 * the chest or the back, which sit on the body's centre line.
 */
export function focusOffsetY(height: number, fraction: number, distance: number, fovDegrees: number, viewportHeight: number): number {
  const pxPerUnit = viewportHeight / (2 * distance * Math.tan((fovDegrees * Math.PI) / 360));
  return -(0.5 - Math.min(1, Math.max(0, fraction))) * height * pxPerUnit;
}
