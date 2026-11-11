/**
 * Undo and redo, as a plain immutable module (no React), over any value; the
 * editor keeps design documents in it. Every function returns a new history
 * and never changes its input.
 *
 * Steps:
 * - `commit(h, next)` records one step (a colour picked, a layer added or deleted).
 * - A gesture (a drag on the model, a slider, typing in a field) is ONE step,
 *   however many intermediate values it shows: `beginGesture`, then
 *   `updateGesture` for every pointer move (the present changes, nothing is
 *   recorded), then `endGesture`, which records a single step from the value
 *   at the start to the value at the end (none if they are equal).
 *   `cancelGesture` goes back to the value at the start.
 * - `undo` and `redo` first end an open gesture, so the step it made can be undone.
 * - A value equal to the present (by the `equals` given to `createHistory`)
 *   is never recorded, so "nothing changed" is never an undo step.
 * - The number of undo steps kept is limited (`limit`, default 200); the
 *   oldest are dropped.
 */

export interface History<T> {
  readonly past: readonly T[];
  readonly present: T;
  readonly future: readonly T[];
  /** The value when the open gesture started, or null when no gesture is open. */
  readonly gestureStart: { readonly value: T } | null;
  readonly limit: number;
  readonly equals: (a: T, b: T) => boolean;
}

export interface HistoryOptions<T> {
  /** Most undo steps kept. Default 200. */
  limit?: number;
  /** When two values count as the same (no step). Default `Object.is`. */
  equals?: (a: T, b: T) => boolean;
}

export const DEFAULT_HISTORY_LIMIT = 200;

export function createHistory<T>(initial: T, options: HistoryOptions<T> = {}): History<T> {
  const limit = options.limit ?? DEFAULT_HISTORY_LIMIT;
  if (!Number.isInteger(limit) || limit < 1) throw new RangeError(`createHistory: 'limit' must be a whole number of 1 or more, got ${limit}`);
  return { past: [], present: initial, future: [], gestureStart: null, limit, equals: options.equals ?? Object.is };
}

function pushStep<T>(h: History<T>, from: T, to: T): History<T> {
  const past = [...h.past, from];
  if (past.length > h.limit) past.splice(0, past.length - h.limit);
  return { ...h, past, present: to, future: [], gestureStart: null };
}

/** Records one step to `next`. An open gesture is ended first (its changes become their own step). */
export function commit<T>(h: History<T>, next: T): History<T> {
  const base = endGesture(h);
  if (base.equals(base.present, next)) return base;
  return pushStep(base, base.present, next);
}

/** Starts a gesture at the present value. Starting one while another is open keeps the first start. */
export function beginGesture<T>(h: History<T>): History<T> {
  if (h.gestureStart) return h;
  return { ...h, gestureStart: { value: h.present } };
}

/** Shows an intermediate value of the open gesture. Without an open gesture it starts one. */
export function updateGesture<T>(h: History<T>, next: T): History<T> {
  const open = beginGesture(h);
  return { ...open, present: next };
}

/** Ends the open gesture: one step from its start to the present, or none when they are equal. */
export function endGesture<T>(h: History<T>): History<T> {
  if (!h.gestureStart) return h;
  const start = h.gestureStart.value;
  if (h.equals(start, h.present)) return { ...h, present: start, gestureStart: null };
  return pushStep(h, start, h.present);
}

/** Drops the open gesture and goes back to the value it started from. */
export function cancelGesture<T>(h: History<T>): History<T> {
  if (!h.gestureStart) return h;
  return { ...h, present: h.gestureStart.value, gestureStart: null };
}

export function canUndo<T>(h: History<T>): boolean {
  return h.past.length > 0 || (h.gestureStart !== null && !h.equals(h.gestureStart.value, h.present));
}

export function canRedo<T>(h: History<T>): boolean {
  return h.gestureStart === null && h.future.length > 0;
}

/** Goes one step back. Ends an open gesture first, so the gesture is what is undone. */
export function undo<T>(h: History<T>): History<T> {
  const base = endGesture(h);
  const previous = base.past[base.past.length - 1];
  if (base.past.length === 0) return base;
  return { ...base, past: base.past.slice(0, -1), present: previous as T, future: [base.present, ...base.future] };
}

/** Goes one step forward again. Nothing to redo after a new step. */
export function redo<T>(h: History<T>): History<T> {
  const base = endGesture(h);
  if (base.future.length === 0) return base;
  const [next, ...rest] = base.future;
  return { ...base, past: [...base.past, base.present], present: next as T, future: rest };
}

/** Undoes everything: back to the oldest value kept. */
export function undoAll<T>(h: History<T>): History<T> {
  let out = endGesture(h);
  while (out.past.length > 0) out = undo(out);
  return out;
}

/** Equality for JSON documents such as designs: same JSON text. Designs are small, so this is cheap. */
export function sameJson(a: unknown, b: unknown): boolean {
  return a === b || JSON.stringify(a) === JSON.stringify(b);
}
