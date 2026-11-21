/**
 * What a press on the model does (06-editor.md 5.1, N10 `dragOnlySelected`):
 *
 * - E3f: select first, then drag, for every pointer: a drag that starts on an
 *   item that is not selected turns the garment and leaves the item where it
 *   is (a thumb or a mouse turning the shirt must not move the team name). A
 *   tap or click selects it; after that, a drag that starts on it moves it.
 *   (Before E3f a mouse pressed and dragged an unselected item in one go; that
 *   is still `dragOnlySelected: "touch"`, or `false` for every pointer.)
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
  /** Default true (E3f): every pointer selects first; "touch": only touch does. */
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

export function selectsFirst(pointerType: string, policy: DragOnlySelected = true): boolean {
  return policy === true || (policy === "touch" && pointerType === "touch");
}

export function pressAction(input: PressInput): PressAction {
  const { hitLayerId, selectedId, pickZones = false, canDrag = true } = input;
  if (pickZones || !hitLayerId) return { kind: "turn", tapSelects: null };
  if (!canDrag) return { kind: "turn", tapSelects: hitLayerId };
  if (!selectsFirst(input.pointerType, input.dragOnlySelected) || hitLayerId === selectedId) return { kind: "drag", layerId: hitLayerId };
  return { kind: "turn", tapSelects: hitLayerId };
}

/**
 * What a tap (a press that did not move) does once it is over (E3f): it selects the item it was on (or nothing),
 * and, where it was on no item, reports the part of the garment under it (from any tool, not only the Colours
 * tool's `pickZones`) or, on the stage, that nothing was under it (a popover or a marked part lets go).
 */
export function tapOutcome(input: { pickZones: boolean; selects: string | null; onFabric: boolean }): { select: string | null; part: "part" | "stage" | null } {
  const select = input.pickZones ? null : input.selects;
  return { select, part: input.pickZones || input.selects === null ? (input.onFabric ? "part" : "stage") : null };
}

/** How far a press may move (CSS px) and how long it may last (ms) and still be a tap. */
export const TAP_SLOP_PX = 8;
export const TAP_MAX_MS = 700;

export function isTap(from: { x: number; y: number; time: number }, to: { x: number; y: number; time: number }): boolean {
  return Math.hypot(to.x - from.x, to.y - from.y) <= TAP_SLOP_PX && to.time - from.time < TAP_MAX_MS;
}

/**
 * How far (CSS px on the screen) a press must travel before it moves an item (E3c, B3). A press and release
 * closer than this is never a move and never an undo step, whatever the camera did in between (a camera that
 * re-frames under a still pointer puts another point of the cloth under it).
 */
export const DRAG_SLOP_PX = 4;

/** Whether the pointer has gone further than `DRAG_SLOP_PX` from where it was pressed. */
export function travelledPast(from: { x: number; y: number }, to: { x: number; y: number }, slop = DRAG_SLOP_PX): boolean {
  return Math.hypot(to.x - from.x, to.y - from.y) > slop;
}
