/**
 * The checks (08-team-list.md, section 6; decision 012), the summary (section 8) and the clean-up
 * for storage (4.1). Every problem is a code with its line and field; there are no sentences.
 *
 * What is required follows the design (section 9) and the line's two flags (section 10):
 * - a name is required when the design prints names and the line is not "no name";
 * - a number is required when the design prints numbers and the line is not "no number";
 * - a size is always required.
 * A field the design does not print, or a line flag switches off, is kept but never checked.
 */
import { checkJerseyNumber, type JerseyNumberFailure } from "./jersey-number.js";
import { resolveLimits } from "./limits.js";
import { buildSizeTable, normalizeSize, readSize, type SizeTable } from "./sizes.js";
import { cleanText, disallowedNameCharacters, mixesScripts, nameLength } from "./text.js";
import type {
  LineRef,
  TakenRef,
  RosterAnalysis,
  RosterLimits,
  RosterLine,
  RosterNote,
  RosterProblem,
  RosterSettings,
  RosterSummary,
  SizeCount,
} from "./types.js";

const NUMBER_PROBLEM: Record<JerseyNumberFailure, RosterProblem["code"]> = {
  "not-a-string": "number-not-digits",
  empty: "number-missing",
  "not-digits": "number-not-digits",
  "mixed-digits": "number-mixed-digits",
  "digit-system-not-allowed": "number-not-digits",
  "too-long": "number-too-long",
  "too-large": "number-too-long",
};

/** True when a count is a whole number inside the limits. */
function countInRange(count: unknown, limits: RosterLimits): count is number {
  return typeof count === "number" && Number.isInteger(count) && count >= limits.minCount && count <= limits.maxCount;
}

/** Pieces a line stands for: its count when that is a whole number of 1 or more, else one. */
export function piecesOf(line: Pick<RosterLine, "count">): number {
  const { count } = line;
  return typeof count === "number" && Number.isInteger(count) && count >= 1 ? count : 1;
}

function refOf(line: RosterLine, index: number): LineRef {
  return line.id === undefined ? { index, name: line.name } : { index, id: line.id, name: line.name };
}

function base(line: RosterLine, index: number): Pick<RosterProblem, "index" | "lineId"> {
  return line.id === undefined ? { index } : { index, lineId: line.id };
}

/** Whether the number of this line is checked, counted and compared. */
function numberApplies(line: RosterLine, settings: RosterSettings): boolean {
  return settings.prints.number && !line.noNumber;
}

function nameApplies(line: RosterLine, settings: RosterSettings): boolean {
  return settings.prints.name && !line.noName;
}

/**
 * Checks a list. Problems come in list order, and within a line in the order name, number, size,
 * count. A duplicate number is reported on every line that shares it, each naming the others.
 * The lines are checked as given: clean them first with `normalizeLines` when they come from
 * outside.
 */
export function checkRoster(
  lines: readonly RosterLine[],
  settings: RosterSettings,
): { problems: RosterProblem[]; notes: RosterNote[] } {
  const limits = resolveLimits(settings.limits);
  const table = buildSizeTable(settings.sizes);
  const problems: RosterProblem[] = [];
  const notes: RosterNote[] = [];

  if (lines.length > limits.maxLines) {
    problems.push({
      code: "list-too-long",
      index: -1,
      field: "list",
      detail: { lines: lines.length, max: limits.maxLines },
    });
  }

  // Numbers: value to the lines that hold it (valid, printed numbers only).
  const byValue = new Map<number, number[]>();
  const systems = new Set<string>();
  const numberProblems = new Map<number, RosterProblem>();

  lines.forEach((line, index) => {
    if (!numberApplies(line, settings)) return;
    if (line.number === "") return;
    const result = checkJerseyNumber(line.number, limits.numberRules);
    if (!result.ok) {
      numberProblems.set(index, {
        code: NUMBER_PROBLEM[result.reason],
        ...base(line, index),
        field: "number",
      });
      return;
    }
    systems.add(result.digitSystem);
    const seen = byValue.get(result.value);
    if (seen) seen.push(index);
    else byValue.set(result.value, [index]);
  });

  // Numbers taken outside this list (a late joiner's add-on): value to the places it is taken.
  const takenByValue = new Map<number, TakenRef[]>();
  for (const taken of settings.taken ?? []) {
    const result = checkJerseyNumber(taken.number, limits.numberRules);
    if (!result.ok) continue;
    const ref: TakenRef = { source: taken.source };
    if (taken.orderId !== undefined) ref.orderId = taken.orderId;
    if (taken.name !== undefined) ref.name = taken.name;
    const places = takenByValue.get(result.value);
    if (places) places.push(ref);
    else takenByValue.set(result.value, [ref]);
  }
  const takenProblems = new Map<number, RosterProblem>();
  for (const [value, indexes] of byValue) {
    const places = takenByValue.get(value);
    if (!places) continue;
    for (const index of indexes) {
      takenProblems.set(index, {
        code: places.some((p) => p.source === "first-order") ? "number-taken-first-order" : "number-taken-add-on",
        ...base(lines[index]!, index),
        field: "number",
        detail: { value, takenIn: places },
      });
    }
  }

  const duplicateProblems = new Map<number, RosterProblem>();
  for (const [value, indexes] of byValue) {
    if (indexes.length < 2) continue;
    for (const index of indexes) {
      const line = lines[index]!;
      duplicateProblems.set(index, {
        code: "number-duplicate",
        ...base(line, index),
        field: "number",
        detail: {
          value,
          others: indexes.filter((i) => i !== index).map((i) => refOf(lines[i]!, i)),
        },
      });
    }
  }

  lines.forEach((line, index) => {
    // name
    if (nameApplies(line, settings)) {
      if (line.name === "") {
        problems.push({ code: "name-missing", ...base(line, index), field: "name" });
      } else {
        const bad = disallowedNameCharacters(line.name);
        if (bad) {
          problems.push({
            code: "name-character",
            ...base(line, index),
            field: "name",
            detail: { characters: bad.characters, hasDigit: bad.hasDigit },
          });
        }
        const length = nameLength(line.name);
        if (length > limits.maxNameLength) {
          problems.push({
            code: "name-too-long",
            ...base(line, index),
            field: "name",
            detail: { length, max: limits.maxNameLength },
          });
        }
        if (!bad && mixesScripts(line.name)) {
          notes.push({ code: "name-mixed-scripts", ...base(line, index) });
        }
      }
    }
    // number
    if (numberApplies(line, settings)) {
      if (line.number === "") {
        problems.push({ code: "number-missing", ...base(line, index), field: "number" });
      } else {
        const found = numberProblems.get(index) ?? duplicateProblems.get(index) ?? takenProblems.get(index);
        if (found) problems.push(found);
      }
    }
    // size
    if (line.size === "") {
      problems.push({ code: "size-missing", ...base(line, index), field: "size" });
    } else if (readSize(line.size, table) === null) {
      problems.push({ code: "size-unknown", ...base(line, index), field: "size", detail: { size: line.size } });
    }
    // count
    if (!countInRange(line.count, limits)) {
      problems.push({
        code: "quantity-range",
        ...base(line, index),
        field: "count",
        detail: {
          ...(typeof line.count === "number" && Number.isFinite(line.count) ? { count: line.count } : {}),
          min: limits.minCount,
          max: limits.maxCount,
        },
      });
    }
  });

  if (systems.size > 1) notes.push({ code: "mixed-digit-systems", index: -1 });

  return { problems, notes };
}

/** Counts, sizes and readiness (08-team-list.md, section 8). `minimum` is the region's, in pieces. */
export function summarizeRoster(
  lines: readonly RosterLine[],
  settings: RosterSettings,
  problems: readonly RosterProblem[],
  minimum?: number | null,
): RosterSummary {
  const table = buildSizeTable(settings.sizes);
  const perSize = new Map<string, number>(table.codes.map((code) => [code, 0]));
  const other = new Map<string, number>();
  let pieces = 0;
  let linesWithoutSize = 0;
  let piecesWithoutSize = 0;
  for (const line of lines) {
    const n = piecesOf(line);
    pieces += n;
    if (line.size === "") {
      linesWithoutSize += 1;
      piecesWithoutSize += n;
      continue;
    }
    const code = readSize(line.size, table);
    if (code !== null) perSize.set(code, (perSize.get(code) ?? 0) + n);
    else other.set(line.size, (other.get(line.size) ?? 0) + n);
  }
  const toFix = new Set(problems.filter((p) => p.index >= 0).map((p) => p.index));
  const listProblem = problems.some((p) => p.index < 0);
  const required = minimum === undefined || minimum === null ? null : minimum;
  const missing = required === null ? 0 : Math.max(0, required - pieces);
  const met = required === null || pieces >= required;
  return {
    players: lines.length,
    pieces,
    bySize: [...perSize].map(([size, count]): SizeCount => ({ size, pieces: count })),
    otherSizes: [...other].map(([size, count]): SizeCount => ({ size, pieces: count })),
    linesWithoutSize,
    piecesWithoutSize,
    readyLines: lines.length - toFix.size,
    linesToFix: toFix.size,
    indexesToFix: [...toFix].sort((a, b) => a - b),
    minimum: required === null ? null : { required, missing, met },
    readyForProof: lines.length > 0 && problems.length === 0 && !listProblem && met,
  };
}

/** The checks and the summary in one call. */
export function analyzeRoster(
  lines: readonly RosterLine[],
  settings: RosterSettings,
  options: { minimum?: number | null } = {},
): RosterAnalysis {
  const { problems, notes } = checkRoster(lines, settings);
  return { problems, notes, summary: summarizeRoster(lines, settings, problems, options.minimum) };
}

/**
 * Cleans lines for storage (08-team-list.md, 4.1): name and number trimmed with runs of spaces
 * made one and the text in NFC; the number kept as written (a leading zero or Arabic digits stay,
 * and are only compared as numbers); the size in the product's spelling when it is one of the
 * product's sizes, else as typed; a missing count becomes 1. Nothing is shortened or
 * capitalised. Values a flag or the design switches off are kept.
 */
export function normalizeLines(lines: readonly RosterLine[], settings: Pick<RosterSettings, "sizes">): RosterLine[] {
  const table: SizeTable = buildSizeTable(settings.sizes);
  return lines.map((line) => {
    const out: RosterLine = {
      name: cleanText(line.name),
      number: cleanText(line.number),
      size: normalizeSize(line.size, table),
      count: line.count ?? 1,
      noName: line.noName === true,
      noNumber: line.noNumber === true,
    };
    if (line.id !== undefined) out.id = line.id;
    return out;
  });
}
