/**
 * E3f: what is under the mouse pointer on the model, as a thing the coach can change: an item (name, number,
 * logo, text), or a part of the garment (a colour zone, or a group of shapes such as the hoops). Plain logic,
 * tested without a browser.
 *
 * Cheap on purpose: the canvas looks at most once per animation frame, and asks for a new frame only when what is
 * under the pointer changed (`HoverTracker`), never on every pointer move over the same thing.
 */

export type Hover =
  /** An item. `selected`: it is the selected one (it has its handles; the canvas shows a hand that grabs). */
  | { kind: "item"; layerId: string; selected: boolean }
  /** A part of the garment: a colour zone, or the group of shapes on top there. */
  | { kind: "part"; zoneId: string | null; shapeGroup: string | null };

/** Identity of what is hovered (two hovers of the same thing have the same key). */
export function hoverKey(hover: Hover | null): string {
  if (!hover) return "none";
  return hover.kind === "item" ? `item:${hover.layerId}:${hover.selected ? "s" : ""}` : `part:${hover.shapeGroup ?? ""}:${hover.zoneId ?? ""}`;
}

/**
 * Whether a pointer move may show a hover: a mouse or pen with no button down (a button down is turning, sliding
 * or dragging), while no item is dragged, resized or turned, and not while the view is being slid.
 */
export function hoverAllowed(move: { pointerType: string; buttons: number }, busy: { dragging: boolean; placing: boolean; sliding: boolean }): boolean {
  return move.pointerType !== "touch" && move.buttons === 0 && !busy.dragging && !busy.placing && !busy.sliding;
}

/** Remembers what is hovered and calls `onChange` only when it changes. */
export class HoverTracker {
  private key = "none";

  constructor(private readonly onChange: (hover: Hover | null) => void) {}

  /** Returns whether it changed (and so whether `onChange` ran). */
  set(hover: Hover | null): boolean {
    const key = hoverKey(hover);
    if (key === this.key) return false;
    this.key = key;
    this.onChange(hover);
    return true;
  }

  get current(): string {
    return this.key;
  }
}
