/**
 * The editor's one undo history for the design AND the team list (08-team-list.md 4.7, decision D-TL2: one pair of
 * undo buttons, so the organizer never needs to know which part of the editor a change belongs to). It is the same
 * plain history module (state/history.ts) over a snapshot of both; the design functions and the gesture calls work
 * on the design, `commitLines`, `beginLines`, `previewLines` and `endLines` on the lines. A step can change either,
 * never both.
 */
import { useCallback, useMemo, useState } from "react";
import type { DesignDocument } from "../design/schema.js";
import type { EditorLine } from "../team-list/types.js";
import { beginGesture, canRedo, canUndo, cancelGesture, endGesture, redo, redoLabel, undo, undoLabel, type EditLabel, type History } from "../state/history.js";
import { commitDesign, commitLines as commitLinesStep, createEditorHistory, previewDesign, previewLines as previewLinesStep, type DesignUpdate, type EditorSnapshot, type LinesUpdate } from "../state/editor-history.js";

export type { EditorSnapshot } from "../state/editor-history.js";

export interface EditorHistory {
  design: DesignDocument;
  lines: readonly EditorLine[];
  history: History<EditorSnapshot>;
  commit(next: DesignDocument, label?: EditLabel | null): void;
  begin(label?: EditLabel | null): void;
  /** Shows an intermediate value of the gesture. An updater gets the latest design; it must not throw. */
  preview(next: DesignUpdate): void;
  end(): void;
  cancel(): void;
  /** One step on the list: its label key may name what changed ("list-name|Ali Raza"). */
  commitLines(next: LinesUpdate, label: string): void;
  /** A gesture on the list (typing in a field): begin, preview as often as needed, end: one step. */
  beginLines(label: string): void;
  previewLines(next: LinesUpdate): void;
  endLines(): void;
  undo(): void;
  redo(): void;
  canUndo: boolean;
  canRedo: boolean;
  undoLabel: string | null;
  redoLabel: string | null;
}

export function useEditorHistory(initial: () => EditorSnapshot, limit?: number): EditorHistory {
  const [history, setHistory] = useState(() => createEditorHistory(initial(), limit));
  const commitStep = useCallback((next: DesignDocument, label: EditLabel | null = null) => setHistory((h) => commitDesign(h, next, label)), []);
  const begin = useCallback((label: EditLabel | null = null) => setHistory((h) => beginGesture(h, label)), []);
  const preview = useCallback((next: DesignUpdate) => setHistory((h) => previewDesign(h, next)), []);
  const end = useCallback(() => setHistory((h) => endGesture(h)), []);
  const cancel = useCallback(() => setHistory((h) => cancelGesture(h)), []);
  const commitLines = useCallback((next: LinesUpdate, label: string) => setHistory((h) => commitLinesStep(h, next, label)), []);
  const beginLines = useCallback((label: string) => setHistory((h) => beginGesture(h, label)), []);
  const previewLines = useCallback((next: LinesUpdate) => setHistory((h) => previewLinesStep(h, next)), []);
  const undoStep = useCallback(() => setHistory((h) => undo(h)), []);
  const redoStep = useCallback(() => setHistory((h) => redo(h)), []);
  return useMemo(
    () => ({
      design: history.present.design,
      lines: history.present.lines,
      history,
      commit: commitStep,
      begin,
      preview,
      end,
      cancel,
      commitLines,
      beginLines,
      previewLines,
      endLines: end,
      undo: undoStep,
      redo: redoStep,
      canUndo: canUndo(history),
      canRedo: canRedo(history),
      undoLabel: undoLabel(history),
      redoLabel: redoLabel(history),
    }),
    [history, commitStep, begin, preview, end, cancel, commitLines, beginLines, previewLines, undoStep, redoStep],
  );
}
