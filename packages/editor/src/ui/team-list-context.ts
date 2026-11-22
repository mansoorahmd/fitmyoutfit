/**
 * What the team list gets from the shell (08-team-list.md section 4): the lines, their checks, and the ways to change
 * them. The shell keeps the lines in the editor's one undo history; the list's components only call these.
 * A separate context from `EditorApi`, so a change to the list re-renders the list and not every tool.
 */
import { createContext, useContext } from "react";
import type { PrintedFields } from "@fitmyoutfit/team-rules";
import type { SizeTable } from "@fitmyoutfit/team-rules";
import type { ListAnalysis, SeenMap } from "../team-list/checks.js";
import type { SortBy, TextField } from "../team-list/lines.js";
import type { PasteMode } from "../team-list/paste.js";
import type { EditorLine, TeamListMinimum, TeamListNoun, TeamListSize } from "../team-list/types.js";

export interface TeamListApi {
  lines: readonly EditorLine[];
  analysis: ListAnalysis;
  /** Which fields the design prints (09). */
  prints: PrintedFields;
  sizes: readonly TeamListSize[];
  sizeTable: SizeTable;
  noun: TeamListNoun;
  minimum: TeamListMinimum | null;
  /** The limits in force (the host's or the package's defaults): none is a constant of the editor. */
  limits: { maxLines: number; minCount: number; maxCount: number };
  openSizeChart: ((size: string | null) => void) | null;
  /** The chosen line: the one the shirt shows. Null only when the list is empty. */
  chosenId: string | null;
  choose(id: string | null): void;
  /** What has been left, per line (6.2), and whether every missing value shows ("Next to fix", Done). */
  seen: SeenMap;
  revealAll: boolean;
  /** The scroll position of the last visit (3.5: the list remembers where it was). */
  memory: { get(): number; set(scrollTop: number): void };
  /** The keyboard is probably open on a phone (a list field has focus). */
  keyboard: boolean;
  /** The Players tab shows the list, the style view (3.1) or the paste view (5.2). */
  view: "list" | "style" | "paste";
  setView(view: "list" | "style" | "paste"): void;
  /** The pasted text, kept for the visit so going back is not a loss (5.2). */
  pasteText: string;
  setPasteText(text: string): void;
  /** Opens the paste view, with `text` in the box when given (a paste of several lines into a field, 5.1). */
  openPaste(text?: string): void;
  /** Adds the read lines in one undo step ("Pasted 18 players"), chooses the first, returns to the list (5.2). */
  addPasted(lines: readonly EditorLine[], mode: PasteMode): void;
  /** Typing in a field: one undo step per field, left when the field is. */
  beginField(id: string, field: TextField): void;
  typeField(id: string, field: TextField, value: string): void;
  leaveField(id: string, field: TextField): void;
  leaveLine(id: string): void;
  /** Ends a gesture that is still open when focus leaves the list. */
  endTyping(): void;
  add(): string | null;
  remove(id: string, options?: { silent?: boolean }): void;
  move(id: string, delta: -1 | 1): void;
  sort(by: SortBy): void;
  setCount(id: string, count: number): void;
  setFlag(id: string, flag: "noName" | "noNumber", on: boolean): void;
  convertDigits(to: "western" | "arabic-indic"): void;
  /** By size (a design with neither name nor number): the count of one size. */
  setSizeCount(code: string, count: number): void;
  revealAllProblems(): void;
  /** The keyboard is probably open (a list field has focus): on a phone the dock hides and the panel shrinks. */
  setKeyboard(on: boolean): void;
  /** The chosen player's name is shrunk to fit on the shirt (a note under the line). */
  nameShrunk: boolean;
  /** The design's first name or number item, for the camera. */
  closeUpLayerId: string | null;
}

export const TeamListContext = createContext<TeamListApi | null>(null);

export function useTeamList(): TeamListApi {
  const api = useContext(TeamListContext);
  if (!api) throw new Error("useTeamList: the team list must be rendered inside EditorShell");
  return api;
}
