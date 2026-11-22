/**
 * From the rules package's CODES to the editor's words (docs/design/08-team-list.md 6.1 and 15): the package never
 * returns a sentence, so every code has its wording in `content.ts` (`teamList.problems`), and this file chooses and
 * fills it. Plain functions, tested without React.
 */
import type { RosterNote, RosterProblem } from "@fitmyoutfit/team-rules";
import type { EditorLine, TeamListNoun, TeamListSize } from "../team-list/types.js";
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

/** What a player is called in a sentence about another player: the name, or "player 3" when it has none. */
export function playerCalled(wording: EditorWording, line: Pick<EditorLine, "name"> | undefined, index: number): string {
  return line && line.name !== "" ? line.name : fill(wording.teamList.unnamedPlayer, { i: index + 1 });
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
