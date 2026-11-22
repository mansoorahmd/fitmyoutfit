/**
 * Pasting a list (08-team-list.md, section 5) as plain functions: the text is READ by the rules package
 * (`readPastedList`), never by the editor; this file only turns what the package read into what the paste view
 * shows (rows with their problems, the lines that are not players), and into the lines that are added.
 * Nothing here knows React.
 */
import { readPastedList, toRosterLine, type ColumnName, type NotAdded, type ReadNote, type RosterLimits, type RosterNote, type RosterProblem } from "@fitmyoutfit/team-rules";
import type { PrintedFields } from "@fitmyoutfit/team-rules";
import { analyseList } from "./checks.js";
import { filledLines, makeLineId } from "./lines.js";
import type { EditorLine, TeamListSize } from "./types.js";

/**
 * The limits of the paste view, with the other limits of the team list (the line limit, the count and the name
 * length are the rules package's data). A placeholder: the coordinator sets the real ones.
 */
export const PASTE_LIMITS = Object.freeze({
  /** The largest file the paste view reads (5.6: "up to 200 KB, thousands of lines"). */
  maxFileBytes: 200 * 1024,
  /** The most text one paste box holds, in UTF-16 units (a file of the largest size is about this many). */
  maxTextLength: 200 * 1024,
});

export type PasteMode = "add" | "replace";

export interface PasteContext {
  sizes: readonly TeamListSize[];
  prints: PrintedFields;
  limits?: Partial<RosterLimits> | undefined;
  /** The lines already in the list (an empty scratch line does not count). */
  existing: readonly EditorLine[];
  mode: PasteMode;
  /** The most lines one list holds. */
  maxLines: number;
}

/** What the paste view shows for one player the reader found. */
export interface PasteRow {
  /** The line that would be added, with its id. */
  line: EditorLine;
  /** Where in the text it was, from 1. */
  lineNumber: number;
  /** The reader's remarks (two numbers, two sizes...). */
  readNotes: readonly ReadNote[];
  /** The checks of the list on this line, as the list will show them (a value the design needs and the text lacks is here too). */
  problems: readonly RosterProblem[];
  notes: readonly RosterNote[];
  /** A line the organizer asked to add from "Not added": the text of the line is its name. */
  fromNotAdded: boolean;
}

export interface PastePreview {
  /** Lines of the text that are not empty. */
  textLines: number;
  rows: readonly PasteRow[];
  notAdded: readonly NotAdded[];
  columns: readonly ColumnName[] | null;
  /** Players read but not added: the list would be over its limit. */
  overLimit: number;
  /** How many more lines fit in the list. */
  room: number;
  /** Rows with a problem, a note or a reader's remark. */
  needLook: number;
}

/** The text's non-empty lines (what "Your text: 20 lines" counts). */
export function countTextLines(text: string): number {
  return text.split(/\r\n|[\r\n\u2028\u2029]/u).filter((l) => l.trim() !== "").length;
}

/** How many more lines fit in the list after `existing` (all of them when replacing). */
export function roomFor(existing: readonly EditorLine[], mode: PasteMode, maxLines: number): number {
  return Math.max(0, maxLines - (mode === "add" ? filledLines(existing).length : 0));
}

/**
 * Reads `text` and works out what the view shows (5.2 to 5.4). `extras` are the text lines (by line number) the
 * organizer chose to add from "Not added": each becomes a row with the text as its name, in the text's order.
 * The checks of section 6 run on the result AGAINST the lines already in the list when adding (a pasted 7 that
 * clashes with an existing 7 shows "Same number as ...").
 */
export function readPaste(text: string, ctx: PasteContext, extras: readonly number[] = []): PastePreview {
  const room = roomFor(ctx.existing, ctx.mode, ctx.maxLines);
  const result = readPastedList(text.slice(0, PASTE_LIMITS.maxTextLength), { sizes: ctx.sizes, room, ...(ctx.limits ? { limits: ctx.limits } : {}) });
  const wanted = new Set(extras);
  const stillNotAdded = result.notAdded.filter((n) => !(wanted.has(n.lineNumber) && n.reason === "not-a-player"));
  const asLines = result.notAdded.filter((n) => wanted.has(n.lineNumber) && n.reason === "not-a-player");

  type Draft = { line: EditorLine; lineNumber: number; readNotes: readonly ReadNote[]; fromNotAdded: boolean };
  const drafts: Draft[] = [
    ...result.lines.map((r) => ({ line: { ...toRosterLine(r), id: makeLineId() }, lineNumber: r.lineNumber, readNotes: r.notes, fromNotAdded: false })),
    ...asLines.map((n) => ({ line: { ...toRosterLine({ name: n.text, number: "", size: "", count: 1 }), id: makeLineId() }, lineNumber: n.lineNumber, readNotes: [] as ReadNote[], fromNotAdded: true })),
  ].sort((a, b) => a.lineNumber - b.lineNumber);
  // A line added from "Not added" must fit too.
  const fitting = drafts.slice(0, room);
  const cut = drafts.length - fitting.length;

  const base = ctx.mode === "add" ? filledLines(ctx.existing) : [];
  const analysis = analyseList([...base, ...fitting.map((d) => d.line)], { prints: ctx.prints, sizes: ctx.sizes, ...(ctx.limits ? { limits: ctx.limits } : {}) });
  const rows: PasteRow[] = fitting.map((d) => ({
    line: d.line,
    lineNumber: d.lineNumber,
    readNotes: d.readNotes,
    problems: analysis.byLine.get(d.line.id) ?? [],
    notes: analysis.notesByLine.get(d.line.id) ?? [],
    fromNotAdded: d.fromNotAdded,
  }));
  return {
    textLines: countTextLines(text),
    rows,
    notAdded: stillNotAdded,
    columns: result.columns,
    overLimit: result.overLimit + cut,
    room,
    needLook: rows.filter((r) => r.problems.length > 0 || r.readNotes.length > 0).length,
  };
}

/** The lines the view would add, in the text's order, as they would sit in the list. */
export function pastedLines(preview: PastePreview): EditorLine[] {
  return preview.rows.map((r) => r.line);
}

/**
 * The list after accepting: the pasted lines at the end (the empty scratch lines left behind are dropped), or the
 * pasted lines alone when replacing. Never more than `maxLines`.
 */
export function applyPaste(lines: readonly EditorLine[], added: readonly EditorLine[], mode: PasteMode, maxLines: number): EditorLine[] {
  const base = mode === "add" ? filledLines(lines) : [];
  return [...base, ...added].slice(0, maxLines);
}

/** Which fields a row lacks and the design needs: the reader found nothing for them (W-TL43). */
export function missingOf(row: Pick<PasteRow, "problems">): ("name" | "number" | "size")[] {
  const out: ("name" | "number" | "size")[] = [];
  for (const p of row.problems) {
    if (p.code === "name-missing") out.push("name");
    else if (p.code === "number-missing") out.push("number");
    else if (p.code === "size-missing") out.push("size");
  }
  return out;
}
