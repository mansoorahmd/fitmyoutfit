/**
 * What a press on the model does (06-editor.md 5.1, N10 `dragOnlySelected`):
 *
 * - With a mouse or a pen, a press on an item selects it and drags it in one
 *   go (direct manipulation: a pointer is precise, and turning uses empty space).
 * - On touch, select first, then drag: a drag that starts on an item that is
 *   not selected turns the garment and leaves the item where it is (a thumb
 *   turning the shirt must not move the team name). A tap selects it; after
 *   that, a drag that starts on it moves it.
 * - A press anywhere else turns the garment; if it is a tap (no movement), it
 *   selects what is under it, or nothing (a tap on empty fabric or the stage
 *   deselects). In the Colours tool a tap chooses the zone instead.
 *
 * Plain logic, tested without a browser.
 */

export type DragOnlySelected = boolean | "touch";

export interface PressInput {
  /** The PointerEvent's `pointerType`: "mouse", "pen" or "touch". */
  pointerType: string;
  /** The item under the press, or null. */
  hitLayerId: string | null;
  selectedId: string | null;
  /** Default "touch": only touch selects first. */
  dragOnlySelected?: DragOnlySelected;
  /** Taps choose zones (the Colours tool): items are neither dragged nor selected by a press. */
  pickZones?: boolean;
  /** Whether the host lets items be dragged at all. */
  canDrag?: boolean;
}

export type PressAction =
  /** Select the item (if it is not already) and drag it. The garment does not turn. */
  | { kind: "drag"; layerId: string }
  /** Leave the press to the camera (it turns the garment); a tap selects `tapSelects` (null: deselect). */
  | { kind: "turn"; tapSelects: string | null };

export function selectsFirst(pointerType: string, policy: DragOnlySelected = "touch"): boolean {
  return policy === true || (policy === "touch" && pointerType === "touch");
}

export function pressAction(input: PressInput): PressAction {
  const { hitLayerId, selectedId, pickZones = false, canDrag = true } = input;
  if (pickZones || !hitLayerId) return { kind: "turn", tapSelects: null };
  if (!canDrag) return { kind: "turn", tapSelects: hitLayerId };
  if (!selectsFirst(input.pointerType, input.dragOnlySelected) || hitLayerId === selectedId) return { kind: "drag", layerId: hitLayerId };
  return { kind: "turn", tapSelects: hitLayerId };
}

/** How far a press may move (CSS px) and how long it may last (ms) and still be a tap. */
export const TAP_SLOP_PX = 8;
export const TAP_MAX_MS = 700;

export function isTap(from: { x: number; y: number; time: number }, to: { x: number; y: number; time: number }): boolean {
  return Math.hypot(to.x - from.x, to.y - from.y) <= TAP_SLOP_PX && to.time - from.time < TAP_MAX_MS;
}
