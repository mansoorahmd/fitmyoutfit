/**
 * The player chip's state (08-team-list.md 7.2, 7.3): which player the shirt shows, who comes before and after in list
 * order, and what the chip says about the line. A plain function, tested without React.
 */
import { upperLatin } from "../design/letter-case.js";
import type { EditorLine } from "./types.js";

export interface ChipState {
  /** "sample": the list is empty and the shirt shows the design's sample player. */
  kind: "sample" | "player";
  /** Lines in the list, and the chosen one's place (0-based; -1 for the sample). */
  total: number;
  index: number;
  line: EditorLine | null;
  /** The number as typed, or "" (a line with none, or a design without numbers). */
  number: string;
  /** The name as it is drawn (capitals when the design says so); "" for a spare shirt or an empty name. */
  name: string;
  /** The name as typed, for names in sentences. */
  nameTyped: string;
  /** A spare shirt: "No name on this shirt" is on. */
  spare: boolean;
  noNumber: boolean;
  /** How many of this shirt; 1 for most. */
  count: number;
  /** The line has a problem to fix (a mark in words, not colour). */
  problem: boolean;
  prevId: string | null;
  nextId: string | null;
}

export interface ChipInput {
  lines: readonly EditorLine[];
  chosenId: string | null;
  /** Ids of the lines with a problem to fix. */
  toFix: readonly string[];
  prints: { name: boolean; number: boolean };
  /** The design's sample player (shown with an empty list). */
  sample: { name: string; number: string };
  /** Names are drawn in capitals (the Latin ones). */
  capitals: boolean;
}

export function chipState(input: ChipInput): ChipState {
  const { lines, chosenId } = input;
  const cased = (name: string) => (input.capitals ? upperLatin(name) : name);
  if (lines.length === 0) {
    return { kind: "sample", total: 0, index: -1, line: null, number: input.prints.number ? input.sample.number : "", name: input.prints.name ? cased(input.sample.name) : "", nameTyped: input.sample.name, spare: false, noNumber: false, count: 1, problem: false, prevId: null, nextId: null };
  }
  const found = chosenId === null ? -1 : lines.findIndex((l) => l.id === chosenId);
  const index = found >= 0 ? found : 0;
  const line = lines[index]!;
  const spare = line.noName;
  const noNumber = line.noNumber;
  return {
    kind: "player",
    total: lines.length,
    index,
    line,
    number: input.prints.number && !noNumber ? line.number : "",
    name: input.prints.name && !spare ? cased(line.name) : "",
    nameTyped: line.name,
    spare,
    noNumber,
    count: line.count,
    problem: input.toFix.includes(line.id),
    prevId: index > 0 ? lines[index - 1]!.id : null,
    nextId: index < lines.length - 1 ? lines[index + 1]!.id : null,
  };
}

/** The step the keys Page Up (-1) and Page Down (1) make: the id of the line to choose, or null at the ends and with an empty list. */
export function stepTarget(state: Pick<ChipState, "prevId" | "nextId">, direction: -1 | 1): string | null {
  return direction === -1 ? state.prevId : state.nextId;
}
