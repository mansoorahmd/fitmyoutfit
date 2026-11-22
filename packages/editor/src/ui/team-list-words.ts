/**
 * From the rules package's CODES to the editor's words (docs/design/08-team-list.md 6.1 and 15): the package never
 * returns a sentence, so every code has its wording in `content.ts` (`teamList.problems`), and this file chooses and
 * fills it. Plain functions, tested without React.
 */
import type { NotAdded, ReadNote, RosterNote, RosterProblem, RosterSummary } from "@fitmyoutfit/team-rules";
import type { FileRefusal } from "../team-list/csv.js";
import type { PasteRow } from "../team-list/paste.js";
import type { EditorLine, TeamListMinimum, TeamListNoun, TeamListSize } from "../team-list/types.js";
import { fill, type EditorWording } from "./content.js";

/** The missing values are said inside the empty field; every other problem is a sentence under the line (6.3). */
export function saysInField(problem: Pick<RosterProblem, "code">): boolean {
  return problem.code === "name-missing" || problem.code === "number-missing" || problem.code === "size-missing";
}

/** "Muhammad Abdul Rehman Qureshi" gives "M. A. R. Qureshi": the initials of every name but the last (W-TL59's hint). */
export function initialsExample(name: string): string {
  const words = name.trim().split(/\s+/u).filter(Boolean);
  if (words.length < 2) return name.trim();
  const last = words[words.length - 1]!;
  return [...words.slice(0, -1).map((w) => `${[...w][0]!.toUpperCase()}.`), last].join(" ");
}

export interface WordsContext {
  wording: EditorWording;
  lines: readonly EditorLine[];
  sizes: readonly TeamListSize[];
  noun: TeamListNoun;
}

/** First-strong isolate and pop: a name that reads right to left stays in its own run, so "(7)" after it is not drawn before it (13.9). */
const ISOLATE_START = "⁨";
const ISOLATE_END = "⁩";

/** What a player is called in a sentence about another player: the name (isolated, so an Urdu name never reorders the words round it), or "player 3" when it has none. */
export function playerCalled(wording: EditorWording, line: Pick<EditorLine, "name"> | undefined, index: number): string {
  return line && line.name !== "" ? `${ISOLATE_START}${line.name}${ISOLATE_END}` : fill(wording.teamList.unnamedPlayer, { i: index + 1 });
}

/** The words with the invisible direction isolates taken out (for comparing, and for a place that does not need them). */
export function withoutIsolates(text: string): string {
  return text.replaceAll(ISOLATE_START, "").replaceAll(ISOLATE_END, "");
}

/** The words for one problem. `line` is the line it belongs to (a list problem has none). */
export function problemText(problem: RosterProblem, line: EditorLine | undefined, ctx: WordsContext): string {
  const w = ctx.wording.teamList.problems;
  const detail = problem.detail ?? {};
  switch (problem.code) {
    case "number-duplicate": {
      const others = detail.others ?? [];
      const first = others[0];
      const index = first ? ctx.lines.findIndex((l) => l.id === first.id) : -1;
      const name = playerCalled(ctx.wording, first ? { name: first.name } : undefined, index >= 0 ? index : (first?.index ?? 0));
      const number = line?.number ?? "";
      return others.length > 2 ? fill(w["number-duplicate-many"], { name, k: others.length - 1, number }) : others.length === 2 ? fill(w["number-duplicate-two"], { name, number }) : fill(w["number-duplicate"], { name, number });
    }
    case "name-character":
      return detail.hasDigit && (detail.characters ?? []).every((c) => /\p{Nd}/u.test(c)) ? w["name-digit"] : fill(w["name-character"], { character: (detail.characters ?? []).find((c) => !/\p{Nd}/u.test(c)) ?? (detail.characters ?? [""])[0]! });
    case "name-too-long":
      return fill(w["name-too-long"], { k: Math.max(1, (detail.length ?? 0) - (detail.max ?? 0)), example: initialsExample(line?.name ?? "") });
    case "size-unknown": {
      const codes = ctx.sizes.map((s) => s.code);
      return fill(w["size-unknown"], { size: detail.size ?? line?.size ?? "", noun: ctx.noun.one, first: codes[0] ?? "", last: codes[codes.length - 1] ?? "" });
    }
    case "quantity-range":
      return fill(w["quantity-range"], { min: detail.min ?? 1, max: detail.max ?? 10 });
    case "list-too-long":
      return fill(w["list-too-long"], { max: detail.max ?? 100 });
    default:
      return w[problem.code];
  }
}

/** The words for a note that is not a problem. */
export function noteText(note: Pick<RosterNote, "code">, wording: EditorWording): string {
  return wording.teamList.notes[note.code];
}

/** "21 jerseys" for the summary (8.1): the product's noun in the plural, or the singular for one. */
export function piecesText(wording: EditorWording, pieces: number, noun: TeamListNoun): string {
  return fill(wording.teamList.pieces, { pieces, noun: pieces === 1 ? noun.one : noun.many });
}

/** The words for something the reader was unsure of in a pasted line (5.3, step 6). */
export function readNoteText(note: ReadNote, wording: EditorWording): string {
  const p = wording.teamList.paste;
  switch (note.code) {
    case "two-numbers":
      return fill(p.twoNumbers, { a: note.values[0] ?? "", b: note.values[1] ?? "" });
    case "two-sizes":
      return fill(p.twoSizes, { a: note.values[0] ?? "", b: note.values[1] ?? "" });
    case "two-counts":
      return fill(p.twoCounts, { a: note.values[0] ?? "", b: note.values[1] ?? "" });
    case "count-unclear":
      return fill(p.countUnclear, { value: note.value });
  }
}

/** One message under a row of the paste view. */
export interface PreviewMessage {
  key: string;
  text: string;
  kind: "problem" | "note";
}

/**
 * What the paste view says under one row (5.4): the reader's remarks first (they say WHY a field is empty), then a
 * value the design needs and the text lacks (W-TL43), then every other check of the list, worded exactly as the list
 * words it (GOV.UK: the same message in both places), then the notes that are not problems.
 */
export function previewMessages(row: Pick<PasteRow, "line" | "readNotes" | "problems" | "notes">, ctx: WordsContext): PreviewMessage[] {
  const p = ctx.wording.teamList.paste;
  const out: PreviewMessage[] = [];
  const explained = new Set<string>();
  for (const n of row.readNotes) {
    out.push({ key: `read:${n.code}`, text: readNoteText(n, ctx.wording), kind: "problem" });
    if (n.code === "two-numbers") explained.add("number-missing");
    if (n.code === "two-sizes") explained.add("size-missing");
  }
  for (const problem of row.problems) {
    if (explained.has(problem.code)) continue;
    const text =
      problem.code === "name-missing" ? p.noNameFound : problem.code === "number-missing" ? p.noNumberFound : problem.code === "size-missing" ? p.noSizeFound : problemText(problem, row.line, ctx);
    out.push({ key: `${problem.code}:${text}`, text, kind: "problem" });
  }
  for (const note of row.notes) out.push({ key: `note:${note.code}`, text: noteText(note, ctx.wording), kind: "note" });
  return out;
}

/** Why a line is listed under "Not added" (5.3, step 7). */
export function notAddedReason(reason: NotAdded["reason"], wording: EditorWording): string {
  return reason === "not-a-player" ? wording.teamList.paste.notAPlayer : wording.teamList.paste.nothingToRead;
}

/** The words for a file the paste view refuses (5.6). */
export function fileRefusalText(reason: FileRefusal, wording: EditorWording, values: { size?: string; max?: string } = {}): string {
  const p = wording.teamList.paste;
  switch (reason) {
    case "too-big":
      return fill(p.fileTooBig, { size: values.size ?? "", max: values.max ?? "" });
    case "spreadsheet":
      return p.excelHint;
    case "not-text":
      return p.fileNotText;
    case "empty":
      return p.fileEmpty;
    case "encoding":
      return p.fileUnreadable;
  }
}

/** What the Done panel's team section says (11.2), from the list's own summary: nothing is worked out twice. */
export interface DoneTeamSection {
  kind: "empty" | "list";
  /** "18 players · 19 jerseys · 2 to fix", or "No players yet". */
  text: string;
  toFix: number;
  ready: boolean;
  /** The region's minimum note, only when below it (8.3). */
  minimumNote: string | null;
  /** How many more pieces the minimum needs. */
  missing: number;
}

export function doneTeamSection(input: { wording: EditorWording; summary: Pick<RosterSummary, "players" | "pieces" | "linesToFix" | "minimum">; noun: TeamListNoun; minimum: TeamListMinimum | null }): DoneTeamSection {
  const w = input.wording.teamList;
  const { summary } = input;
  if (summary.players === 0) return { kind: "empty", text: w.doneSection.none, toFix: 0, ready: false, minimumNote: null, missing: 0 };
  const players = summary.players === 1 ? w.onePlayer : fill(w.players, { n: summary.players });
  const state = summary.linesToFix > 0 ? fill(w.toFix, { k: summary.linesToFix }) : w.allReady;
  const text =
    summary.pieces !== summary.players
      ? fill(w.doneSection.players, { players, pieces: piecesText(input.wording, summary.pieces, input.noun), state })
      : fill(w.doneSection.playersSame, { players, state });
  const below = input.minimum && summary.minimum && !summary.minimum.met ? summary.minimum : null;
  const minimumNote = below && input.minimum ? fill(w.minimum, { region: input.minimum.region, minimum: input.minimum.pieces, noun: input.minimum.pieces === 1 ? input.noun.one : input.noun.many, pieces: summary.pieces, missing: below.missing }) : null;
  return { kind: "list", text, toFix: summary.linesToFix, ready: summary.linesToFix === 0, minimumNote, missing: below?.missing ?? 0 };
}
