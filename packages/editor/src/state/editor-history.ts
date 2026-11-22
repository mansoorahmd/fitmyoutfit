/**
 * The editor's one undo history for the design AND the team list (08-team-list.md 4.7, decision D-TL2): one pair of
 * undo buttons, so the organizer never needs to know which part of the editor a change belongs to. A step holds the
 * design and the lines as they were; a step changes one of them. Plain functions over the history module; the React
 * hook (react/useEditorHistory.ts) only calls them.
 */
import type { DesignDocument } from "../design/schema.js";
import type { EditorLine } from "../team-list/types.js";
import { beginGesture, commit, createHistory, sameJson, updateGesture, type History } from "./history.js";

export interface EditorSnapshot {
  design: DesignDocument;
  lines: readonly EditorLine[];
}

export type LinesUpdate = readonly EditorLine[] | ((current: readonly EditorLine[]) => readonly EditorLine[]);
export type DesignUpdate = DesignDocument | ((current: DesignDocument) => DesignDocument);

export function createEditorHistory(initial: EditorSnapshot, limit?: number): History<EditorSnapshot> {
  return createHistory<EditorSnapshot>(initial, { equals: sameJson, limit });
}

const resolveLines = (update: LinesUpdate, current: readonly EditorLine[]) => (typeof update === "function" ? update(current) : update);
const resolveDesign = (update: DesignUpdate, current: DesignDocument) => (typeof update === "function" ? update(current) : update);

/** One step on the design; the lines stay as they are. */
export function commitDesign(h: History<EditorSnapshot>, next: DesignDocument, label: string | null = null): History<EditorSnapshot> {
  return commit(h, { design: next, lines: h.present.lines }, label);
}

/** One step on the lines; the design stays as it is. The label may name what changed ("list-name|Ali Raza"). */
export function commitLines(h: History<EditorSnapshot>, next: LinesUpdate, label: string): History<EditorSnapshot> {
  return commit(h, { design: h.present.design, lines: resolveLines(next, h.present.lines) }, label);
}

/** An intermediate value of the open gesture, on the design. */
export function previewDesign(h: History<EditorSnapshot>, next: DesignUpdate): History<EditorSnapshot> {
  return updateGesture(h, { design: resolveDesign(next, h.present.design), lines: h.present.lines });
}

/** An intermediate value of the open gesture, on the lines (typing in a field). */
export function previewLines(h: History<EditorSnapshot>, next: LinesUpdate): History<EditorSnapshot> {
  return updateGesture(h, { design: h.present.design, lines: resolveLines(next, h.present.lines) });
}

export { beginGesture as begin };
