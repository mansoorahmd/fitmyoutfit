/**
 * The checks beside the line (08-team-list.md, sections 6 and 8), worked out by `@fitmyoutfit/team-rules` so the
 * editor and the server judge a list the same way. This file decides only WHEN a check shows (6.2), which line
 * has the next problem (6.4), and what the shirt shows for a line (7.1, 6.2 "on the shirt"). It never words anything:
 * the problems are codes, the wording is `src/ui/content.ts`.
 */
import { analyzeRoster, checkJerseyNumber, cleanText, disallowedNameCharacters, normalizeLines } from "@fitmyoutfit/team-rules";
import type { PrintedFields, ProblemCode, RosterLimits, RosterNote, RosterProblem } from "@fitmyoutfit/team-rules";
import type { DesignDocument } from "../design/schema.js";
import { filledLines } from "./lines.js";
import type { EditorLine, SavedTeamList, TeamListReport, TeamListSize } from "./types.js";

export interface ListSettings {
  prints: PrintedFields;
  sizes: readonly TeamListSize[];
  limits?: Partial<RosterLimits>;
  /** The region's minimum in pieces, or nothing. */
  minimum?: number | null;
}

/** The analysis of a list, with its problems and notes by line id (what the lines show). */
export interface ListAnalysis {
  /** The rules package's report on the filled lines (what the host gets). */
  report: TeamListReport;
  /** Problems by line id, in the package's order. */
  byLine: ReadonlyMap<string, readonly RosterProblem[]>;
  notesByLine: ReadonlyMap<string, readonly RosterNote[]>;
  /** The list's own notes and problems (mixed digit systems, too many lines). */
  listNotes: readonly RosterNote[];
  listProblems: readonly RosterProblem[];
  /** The ids of the lines to fix, in list order. */
  toFix: readonly string[];
  /** The lines that count (the empty scratch lines left out), in order. */
  filled: readonly EditorLine[];
}

/** The checks and the summary of the lines that are not empty. */
export function analyseList(lines: readonly EditorLine[], settings: ListSettings): ListAnalysis {
  const filled = filledLines(lines);
  const roster = { prints: settings.prints, sizes: settings.sizes, ...(settings.limits ? { limits: settings.limits } : {}) };
  const report = analyzeRoster(filled, roster, { minimum: settings.minimum ?? null });
  const byLine = new Map<string, RosterProblem[]>();
  const notesByLine = new Map<string, RosterNote[]>();
  for (const p of report.problems) {
    const id = p.lineId ?? (p.index >= 0 ? filled[p.index]?.id : undefined);
    if (id === undefined) continue;
    byLine.set(id, [...(byLine.get(id) ?? []), p]);
  }
  for (const n of report.notes) {
    const id = n.lineId ?? (n.index >= 0 ? filled[n.index]?.id : undefined);
    if (id === undefined) continue;
    notesByLine.set(id, [...(notesByLine.get(id) ?? []), n]);
  }
  return {
    report,
    byLine,
    notesByLine,
    listNotes: report.notes.filter((n) => n.index < 0),
    listProblems: report.problems.filter((p) => p.index < 0),
    toFix: report.summary.indexesToFix.map((i) => filled[i]!.id),
    filled,
  };
}

/** What has been left, per line, since the list opened (view state, never saved): 6.2's "when the field is left". */
export interface LineSeen {
  /** Focus has left the line. */
  left?: boolean;
  name?: boolean;
  number?: boolean;
  size?: boolean;
}
export type SeenMap = Readonly<Record<string, LineSeen>>;

/** Problems that more typing cannot fix: shown at once, while typing. */
const AT_ONCE: ReadonlySet<ProblemCode> = new Set<ProblemCode>(["number-not-digits", "number-too-long", "number-mixed-digits", "name-character", "name-too-long", "quantity-range", "list-too-long"]);
const MISSING: ReadonlySet<ProblemCode> = new Set<ProblemCode>(["name-missing", "number-missing", "size-missing"]);

/**
 * Whether a problem shows now (6.2). Never what the organizer can still be typing towards; "Next to fix" and
 * "Done" reveal everything (`revealAll`); a missing value shows after the line is left, never on a line nobody
 * has typed into; a duplicate number once its number field was left; an unknown size once its field was left.
 */
export function isShown(problem: RosterProblem, seen: LineSeen | undefined, revealAll: boolean): boolean {
  if (AT_ONCE.has(problem.code)) return true;
  if (revealAll) return true;
  if (MISSING.has(problem.code)) return Boolean(seen?.left);
  if (problem.code === "number-duplicate") return Boolean(seen?.number);
  if (problem.code === "size-unknown") return Boolean(seen?.size);
  return false;
}

/** The problems of a line that show now. */
export function shownProblems(analysis: ListAnalysis, line: EditorLine, seen: SeenMap, revealAll: boolean): RosterProblem[] {
  return (analysis.byLine.get(line.id) ?? []).filter((p) => isShown(p, seen[line.id], revealAll));
}

/**
 * The next line with a problem after `fromId`, wrapping to the top (6.4); the previous one for -1. Null when no
 * line has a problem. With no line chosen it starts at the top (or the bottom, backwards).
 */
export function nextToFix(lines: readonly EditorLine[], toFix: readonly string[], fromId: string | null, direction: 1 | -1 = 1): string | null {
  if (toFix.length === 0) return null;
  const order = new Map(lines.map((l, i) => [l.id, i]));
  const at = fromId === null ? -1 : (order.get(fromId) ?? -1);
  const positions = toFix.map((id) => ({ id, i: order.get(id) ?? Infinity })).sort((a, b) => a.i - b.i);
  if (direction === 1) return (positions.find((p) => p.i > at) ?? positions[0]!).id;
  const before = [...positions].reverse().find((p) => p.i < (at === -1 ? Infinity : at));
  return (before ?? positions[positions.length - 1]!).id;
}

/** What the shirt shows for a line (6.2 "on the shirt", 7.1): its name and number as they would print; nothing for what cannot print. */
export function playerForShirt(line: Pick<EditorLine, "name" | "number" | "noName" | "noNumber">, prints: PrintedFields): { name: string; number: string } {
  let name = "";
  if (prints.name && !line.noName) {
    const cleaned = cleanText(line.name);
    const bad = disallowedNameCharacters(cleaned);
    name = bad ? [...cleaned].filter((ch) => !bad.characters.includes(ch)).join("") : cleaned;
  }
  const number = prints.number && !line.noNumber && line.number !== "" && checkJerseyNumber(line.number).ok ? line.number : "";
  return { name, number };
}

/** The list as it is saved and handed to the host (12.2): the filled lines, cleaned, in order. */
export function toSavedList(lines: readonly EditorLine[], productId: string, settings: Pick<ListSettings, "prints" | "sizes">): SavedTeamList {
  return { version: 1, productId, prints: settings.prints, lines: normalizeLines(filledLines(lines), { sizes: settings.sizes }) };
}

/**
 * The design as the chosen line looks on the shirt (7.1): the player's name and number in every name and number
 * item, the rest unchanged. Not `setSamplePlayer`: that refuses an empty number while a number item shows it, and the
 * shirt must show NO number for a line with none (6.2: an invalid number is not drawn). The design itself is never
 * written; this is the copy the stage draws.
 */
export function designWithPlayer(design: DesignDocument, player: { name: string; number: string }): DesignDocument {
  let changed = false;
  const layers = design.layers.map((l) => {
    if ((l.kind !== "text" && l.kind !== "number") || (l.role !== "player-name" && l.role !== "player-number")) return l;
    const value = l.role === "player-name" ? player.name : player.number;
    if (l.value === value) return l;
    changed = true;
    return { ...l, value };
  });
  if (!changed && design.samplePlayer.name === player.name && design.samplePlayer.number === player.number) return design;
  return { ...design, samplePlayer: { name: player.name, number: player.number }, layers };
}
