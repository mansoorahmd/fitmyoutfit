/**
 * The keys of the team list (08-team-list.md 4.3) as one pure decision: what a key press in a field of a line does,
 * from the key, the line, the lines in view and whether the size list is open. The list's component only carries
 * the decision out (focus a field, add a line, remove an empty one...), so the keyboard path is tested without a browser.
 */
import type { EditorLine } from "./types.js";

export type Field = "name" | "number" | "size";

/** The text fields a line has now, in the tab order (a "no name" or "no number" tag replaces its field). */
export function fieldsOf(line: Pick<EditorLine, "noName" | "noNumber">, showNumber: boolean): Field[] {
  return [...(line.noName ? [] : (["name"] as const)), ...(showNumber && !line.noNumber ? (["number"] as const) : []), "size" as const];
}

export interface KeyInput {
  key: string;
  shift?: boolean;
  alt?: boolean;
}

export interface KeyContext {
  field: Field;
  /** The line the key was pressed in, and the lines in view (the filter may hide some). */
  lineId: string;
  visible: readonly EditorLine[];
  showNumber: boolean;
  wide: boolean;
  /** The size listbox (desktop) is open, and which of its entries is highlighted (-1: none), and how many it has. */
  listOpen: boolean;
  active: number;
  listLength: number;
  atLimit: boolean;
  /** The value the field had when it got focus (for Esc), and the value now. */
  valueAtFocus: string | null;
  value: string;
}

export type KeyAction =
  /** Focus this field of this line now. */
  | { type: "go"; id: string; field: Field }
  /** Focus the first field of this line. */
  | { type: "go-first"; id: string }
  /** Focus a field of this line (the same one, or the last when it has no such field). */
  | { type: "go-same"; id: string; field: Field }
  | { type: "add" }
  | { type: "limit" }
  /** Enter in the first field of an empty new line: remove it and end typing. */
  | { type: "remove-empty" }
  /** Backspace in an empty first field of an empty line: remove it and go to the end of the line before. */
  | { type: "remove-empty-back"; id: string; field: Field }
  | { type: "open-list" }
  | { type: "close-list" }
  | { type: "move-active"; to: number }
  | { type: "move-line"; delta: -1 | 1 }
  | { type: "restore"; value: string }
  /** The highlighted size is chosen, then the next action happens. */
  | { type: "choose-active"; then: KeyAction | null };

const isEmpty = (l: EditorLine) => l.name === "" && l.number === "" && l.size === "" && !l.noName && !l.noNumber && l.count === 1;

/** What the key does, or null when it is left to the browser (typing, Tab). */
export function keyAction(input: KeyInput, ctx: KeyContext): KeyAction | null {
  const at = ctx.visible.findIndex((l) => l.id === ctx.lineId);
  const line = ctx.visible[at];
  if (!line) return null;
  const mine = fieldsOf(line, ctx.showNumber);
  const k = mine.indexOf(ctx.field);
  const open = ctx.field === "size" && ctx.wide && ctx.listOpen;
  const last = (l: EditorLine) => fieldsOf(l, ctx.showNumber).at(-1)!;
  switch (input.key) {
    case "Enter": {
      if (input.shift) {
        if (k > 0) return { type: "go", id: line.id, field: mine[k - 1]! };
        const prev = ctx.visible[at - 1];
        return prev ? { type: "go", id: prev.id, field: last(prev) } : null;
      }
      // The first field of a new, still empty line: Enter removes the line and ends typing.
      if (isEmpty(line) && k === 0) return { type: "remove-empty" };
      let after: KeyAction | null;
      if (k >= 0 && k < mine.length - 1) after = { type: "go", id: line.id, field: mine[k + 1]! };
      else {
        const next = ctx.visible[at + 1];
        after = next ? { type: "go-first", id: next.id } : ctx.atLimit ? { type: "limit" } : { type: "add" };
      }
      // Moving on closes the list; the highlighted size is chosen first, only when the organizer moved to one.
      return open && ctx.active >= 0 ? { type: "choose-active", then: after } : after;
    }
    case "ArrowDown":
    case "ArrowUp": {
      const down = input.key === "ArrowDown";
      if (input.alt) {
        if (ctx.field === "size" && ctx.wide) return down ? { type: "open-list" } : null;
        return { type: "move-line", delta: down ? 1 : -1 };
      }
      if (open) return { type: "move-active", to: Math.max(0, Math.min(ctx.listLength - 1, down ? ctx.active + 1 : ctx.active - 1)) };
      const to = ctx.visible[at + (down ? 1 : -1)];
      return to ? { type: "go-same", id: to.id, field: ctx.field } : null;
    }
    case "Escape": {
      if (open) return { type: "close-list" };
      if (ctx.valueAtFocus !== null && ctx.value !== ctx.valueAtFocus) return { type: "restore", value: ctx.valueAtFocus };
      return null;
    }
    case "Backspace": {
      const prev = ctx.visible[at - 1];
      if (k === 0 && isEmpty(line) && ctx.value === "" && prev) return { type: "remove-empty-back", id: prev.id, field: last(prev) };
      return null;
    }
    default:
      return null;
  }
}
