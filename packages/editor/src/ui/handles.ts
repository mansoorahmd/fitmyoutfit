/**
 * The handles' gestures (06-editor.md 5.2), as plain maths on screen points:
 * a corner handle scales the item evenly about its centre (text and logos
 * keep their proportions; there are no side handles), the turn handle turns
 * it about its centre, snapping at 0, 15, 45 and 90 degrees. Tested without a
 * browser; `SelectionOverlay` feeds them pointer positions.
 */

export interface Pt {
  x: number;
  y: number;
}

/** A tiny store the canvas writes the selection's screen geometry to and the overlay reads (only the overlay re-renders per frame). */
export interface Bus<T> {
  emit(value: T): void;
  get(): T;
  subscribe(listener: () => void): () => void;
}

export function createBus<T>(initial: T): Bus<T> {
  let value = initial;
  const listeners = new Set<() => void>();
  return {
    emit(next) {
      value = next;
      listeners.forEach((l) => l());
    },
    get: () => value,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

/** How much a corner drag scales the item: the pointer's distance from the centre now over at the start. */
export function resizeFactor(centre: Pt, start: Pt, now: Pt, outset = 0): number {
  const d0 = Math.hypot(start.x - centre.x, start.y - centre.y);
  const d1 = Math.hypot(now.x - centre.x, now.y - centre.y);
  // E3d (R32): the handle sits `outset` px beyond the item's corner; the item's corner follows the pointer.
  const o = Math.max(0, Math.min(outset, d0 - 1));
  if (d0 - o < 1) return 1;
  return Math.max(0.05, (d1 - o) / (d0 - o));
}

/**
 * How far the turn handle turned the item, in degrees, clockwise on the
 * piece: the pointer's angle round the centre now minus at the start; on a
 * piece seen mirrored, a clockwise turn on the screen is anticlockwise on the
 * piece.
 */
export function turnDelta(centre: Pt, start: Pt, now: Pt, mirrored = false): number {
  const a0 = Math.atan2(start.y - centre.y, start.x - centre.x);
  const a1 = Math.atan2(now.y - centre.y, now.x - centre.x);
  let d = ((a1 - a0) * 180) / Math.PI;
  d = ((((d + 180) % 360) + 360) % 360) - 180;
  return mirrored ? -d : d;
}

/** The angles a turn snaps to (06-editor.md 5.2). */
export const SNAP_ANGLES = [0, 15, -15, 45, -45, 90, -90, 180, -180];
/** How close (degrees) a turn must come to a snap angle to be caught. */
export const SNAP_ANGLE_WITHIN = 4;

/** Degrees in -180 to 180, snapped to the nearest snap angle when within SNAP_ANGLE_WITHIN (unless `free`). */
export function snapAngle(degrees: number, free = false): { angle: number; snapped: boolean } {
  const a = ((((degrees + 180) % 360) + 360) % 360) - 180;
  if (free) return { angle: round2(a), snapped: false };
  for (const s of SNAP_ANGLES) if (Math.abs(a - s) <= SNAP_ANGLE_WITHIN) return { angle: s === -180 ? 180 : s, snapped: true };
  return { angle: round2(a), snapped: false };
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

/** The smallest hit area of a handle, CSS px (WCAG 2.5.8 recommends 44). */
export const HANDLE_HIT = 44;
/** The visible corner square and turn knob (06-editor.md 5.2). */
export const HANDLE_SIZE = 14;
export const TURN_KNOB = 12;
/** The turn handle's stem from the box's top edge. */
export const TURN_STEM = 28;
