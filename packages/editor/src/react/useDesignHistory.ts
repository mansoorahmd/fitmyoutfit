/**
 * React state for a design with undo and redo, on top of the plain history
 * module (state/history.ts). Every change goes through it:
 * - `commit(next, label)` for one step (a colour, a new layer, a delete);
 * - `begin(label)`, `preview(next or updater)`, `end()` for a gesture (a drag,
 *   a slider, typing in a field), which is one step however many previews.
 *
 * `label` is a key from `EDIT_LABELS` ("zone-colour", "template", "move"):
 * `undoLabel` and `redoLabel` say what the next undo or redo changes, so the
 * interface can announce "Undone: colour" in its own words.
 */
import { useCallback, useMemo, useState } from "react";
import type { DesignDocument } from "../design/schema.js";
import {
  beginGesture,
  canRedo,
  canUndo,
  cancelGesture,
  commit,
  createHistory,
  endGesture,
  redo,
  redoLabel,
  sameJson,
  undo,
  undoLabel,
  updateGesture,
  type EditLabel,
  type History,
} from "../state/history.js";

export interface DesignHistory {
  design: DesignDocument;
  history: History<DesignDocument>;
  commit(next: DesignDocument, label?: EditLabel | null): void;
  begin(label?: EditLabel | null): void;
  /** Shows an intermediate value of the gesture. An updater gets the latest value; it must not throw. */
  preview(next: DesignDocument | ((current: DesignDocument) => DesignDocument)): void;
  end(): void;
  cancel(): void;
  undo(): void;
  redo(): void;
  canUndo: boolean;
  canRedo: boolean;
  /** The label of the step the next undo would undo, or null. */
  undoLabel: string | null;
  /** The label of the step the next redo would redo, or null. */
  redoLabel: string | null;
}

export function useDesignHistory(initial: DesignDocument | (() => DesignDocument), limit?: number): DesignHistory {
  const [history, setHistory] = useState(() =>
    createHistory(typeof initial === "function" ? initial() : initial, { equals: sameJson, limit }),
  );
  const commitStep = useCallback((next: DesignDocument, label: EditLabel | null = null) => setHistory((h) => commit(h, next, label)), []);
  const begin = useCallback((label: EditLabel | null = null) => setHistory((h) => beginGesture(h, label)), []);
  const preview = useCallback(
    (next: DesignDocument | ((current: DesignDocument) => DesignDocument)) =>
      setHistory((h) => updateGesture(h, typeof next === "function" ? next(h.present) : next)),
    [],
  );
  const end = useCallback(() => setHistory((h) => endGesture(h)), []);
  const cancel = useCallback(() => setHistory((h) => cancelGesture(h)), []);
  const undoStep = useCallback(() => setHistory((h) => undo(h)), []);
  const redoStep = useCallback(() => setHistory((h) => redo(h)), []);
  return useMemo(
    () => ({
      design: history.present,
      history,
      commit: commitStep,
      begin,
      preview,
      end,
      cancel,
      undo: undoStep,
      redo: redoStep,
      canUndo: canUndo(history),
      canRedo: canRedo(history),
      undoLabel: undoLabel(history),
      redoLabel: redoLabel(history),
    }),
    [history, commitStep, begin, preview, end, cancel, undoStep, redoStep],
  );
}
