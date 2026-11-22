/**
 * Undo and redo, as a plain immutable module (no React), over any value; the
 * editor keeps design documents in it. Every function returns a new history
 * and never changes its input.
 *
 * Steps:
 * - `commit(h, next, label)` records one step (a colour picked, a layer added or deleted).
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
 *
 * Labels (N18): every step can carry a short label KEY ("zone-colour",
 * "template", "move"), not a sentence: the interface turns it into words
 * ("Undone: Body colour"). `undoLabel` and `redoLabel` say what the next
 * undo and redo would change. `EDIT_LABELS` lists the keys the editor uses.
 */

export interface History<T> {
  readonly past: readonly T[];
  /** The label of each step in `past`: `pastLabels[i]` is the step that left `past[i]`. */
  readonly pastLabels: readonly (string | null)[];
  readonly present: T;
  readonly future: readonly T[];
  /** The label of each step in `future`: `futureLabels[i]` is the step that reaches `future[i]`. */
  readonly futureLabels: readonly (string | null)[];
  /** The value when the open gesture started, and the gesture's label, or null when no gesture is open. */
  readonly gestureStart: { readonly value: T; readonly label: string | null } | null;
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

/**
 * The label keys of the design edits, for the interface's "Undone: …" line.
 * Keys, not wording: the interface maps each to a sentence (and may add the
 * item's or zone's name).
 */
export const EDIT_LABELS = [
  "zone-colour",
  "team-colour",
  "swap-team-colours",
  "shape-colour",
  "template",
  "team-name",
  "player-name",
  "player-number",
  "add-item",
  "remove-item",
  "replace-logo",
  "move",
  "resize",
  "rotate",
  "order",
  "placement",
  "slot",
  "text",
  "font",
  "colour",
  "outline",
  "size",
  "align",
  "direction",
  // The team list (08-team-list.md 4.7): one history for the design and the list.
  "list-name",
  "list-number",
  "list-size",
  "list-add",
  "list-remove",
  "list-move",
  "list-sort",
  "list-count",
  "list-flag",
  "list-digits",
  "list-paste",
  // Names in capitals or as typed (decision 012).
  "letter-case",
] as const;
export type EditLabel = (typeof EDIT_LABELS)[number];

export function createHistory<T>(initial: T, options: HistoryOptions<T> = {}): History<T> {
  const limit = options.limit ?? DEFAULT_HISTORY_LIMIT;
  if (!Number.isInteger(limit) || limit < 1) throw new RangeError(`createHistory: 'limit' must be a whole number of 1 or more, got ${limit}`);
  return { past: [], pastLabels: [], present: initial, future: [], futureLabels: [], gestureStart: null, limit, equals: options.equals ?? Object.is };
}

function pushStep<T>(h: History<T>, from: T, to: T, label: string | null): History<T> {
  const past = [...h.past, from];
  const pastLabels = [...h.pastLabels, label];
  if (past.length > h.limit) {
    past.splice(0, past.length - h.limit);
    pastLabels.splice(0, pastLabels.length - h.limit);
  }
  return { ...h, past, pastLabels, present: to, future: [], futureLabels: [], gestureStart: null };
}

/** Records one step to `next`, with a label key. An open gesture is ended first (its changes become their own step). */
export function commit<T>(h: History<T>, next: T, label: string | null = null): History<T> {
  const base = endGesture(h);
  if (base.equals(base.present, next)) return base;
  return pushStep(base, base.present, next, label);
}

/** Starts a gesture at the present value, with a label key. Starting one while another is open keeps the first start. */
export function beginGesture<T>(h: History<T>, label: string | null = null): History<T> {
  if (h.gestureStart) return h;
  return { ...h, gestureStart: { value: h.present, label } };
}

/** Shows an intermediate value of the open gesture. Without an open gesture it starts one (with `label`). */
export function updateGesture<T>(h: History<T>, next: T, label: string | null = null): History<T> {
  const open = beginGesture(h, label);
  return { ...open, present: next };
}

/** Ends the open gesture: one step from its start to the present, or none when they are equal. */
export function endGesture<T>(h: History<T>): History<T> {
  if (!h.gestureStart) return h;
  const start = h.gestureStart.value;
  if (h.equals(start, h.present)) return { ...h, present: start, gestureStart: null };
  return pushStep(h, start, h.present, h.gestureStart.label);
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

/** The label of the step `undo` would undo (an open gesture's, if it changed something), or null. */
export function undoLabel<T>(h: History<T>): string | null {
  if (h.gestureStart && !h.equals(h.gestureStart.value, h.present)) return h.gestureStart.label;
  return h.pastLabels[h.pastLabels.length - 1] ?? null;
}

/** The label of the step `redo` would redo, or null. */
export function redoLabel<T>(h: History<T>): string | null {
  if (h.gestureStart) return null;
  return h.futureLabels[0] ?? null;
}

/** Goes one step back. Ends an open gesture first, so the gesture is what is undone. */
export function undo<T>(h: History<T>): History<T> {
  const base = endGesture(h);
  if (base.past.length === 0) return base;
  const previous = base.past[base.past.length - 1];
  const label = base.pastLabels[base.pastLabels.length - 1] ?? null;
  return {
    ...base,
    past: base.past.slice(0, -1),
    pastLabels: base.pastLabels.slice(0, -1),
    present: previous as T,
    future: [base.present, ...base.future],
    futureLabels: [label, ...base.futureLabels],
  };
}

/** Goes one step forward again. Nothing to redo after a new step. */
export function redo<T>(h: History<T>): History<T> {
  const base = endGesture(h);
  if (base.future.length === 0) return base;
  const [next, ...rest] = base.future;
  const [label, ...restLabels] = base.futureLabels;
  return {
    ...base,
    past: [...base.past, base.present],
    pastLabels: [...base.pastLabels, label ?? null],
    present: next as T,
    future: rest,
    futureLabels: restLabels,
  };
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
