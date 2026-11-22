/**
 * The lines of a team list as plain functions (08-team-list.md, section 4): adding, editing, removing, moving,
 * sorting, the count and the two flags, and the clean-up on leaving a field. Each returns a new array and never
 * changes its input. No React: the interface calls these and puts the result in the editor's history.
 */
import { buildSizeTable, cleanText, jerseyNumberValue, normalizeSize, type SizeTable } from "@fitmyoutfit/team-rules";
import type { PrintedFields, RosterLine } from "@fitmyoutfit/team-rules";
import type { DesignDocument } from "../design/schema.js";
import type { EditorLine, TeamListSize } from "./types.js";

let counter = 0;
/** A line id: unique in a list and never reused in a session (a random part and a counter), made by the editor. */
export function makeLineId(): string {
  counter += 1;
  return `l-${Math.random().toString(36).slice(2, 8)}${counter.toString(36)}`;
}

export function newLine(id: string = makeLineId()): EditorLine {
  return { id, name: "", number: "", size: "", count: 1, noName: false, noNumber: false };
}

/** A line nobody has typed anything into: not counted, not checked (4.2: an empty line left behind is removed). */
export function isEmptyLine(line: Pick<RosterLine, "name" | "number" | "size" | "noName" | "noNumber" | "count">): boolean {
  return line.name === "" && line.number === "" && line.size === "" && !line.noName && !line.noNumber && line.count === 1;
}

/** Lines from a saved list or a paste: every line gets an id (a saved one keeps its own), nothing else changes. */
export function withIds(lines: readonly RosterLine[]): EditorLine[] {
  const seen = new Set<string>();
  return lines.map((line) => {
    const id = line.id !== undefined && line.id !== "" && !seen.has(line.id) ? line.id : makeLineId();
    seen.add(id);
    return { ...line, id };
  });
}

/** The fields the design prints (09): a player-name item anywhere gives a Name column, a player-number item a No. column. */
export function printsOf(design: Pick<DesignDocument, "layers">): PrintedFields {
  return {
    name: design.layers.some((l) => l.role === "player-name"),
    number: design.layers.some((l) => l.role === "player-number"),
  };
}

export type TextField = "name" | "number" | "size";

export function addLine(lines: readonly EditorLine[], line: EditorLine = newLine()): EditorLine[] {
  return [...lines, line];
}

export function setField(lines: readonly EditorLine[], id: string, field: TextField, value: string): EditorLine[] {
  return lines.map((l) => (l.id === id && l[field] !== value ? { ...l, [field]: value } : l));
}

export function setCount(lines: readonly EditorLine[], id: string, count: number): EditorLine[] {
  return lines.map((l) => (l.id === id && l.count !== count ? { ...l, count } : l));
}

export function setFlag(lines: readonly EditorLine[], id: string, flag: "noName" | "noNumber", on: boolean): EditorLine[] {
  return lines.map((l) => (l.id === id && l[flag] !== on ? { ...l, [flag]: on } : l));
}

export function removeLine(lines: readonly EditorLine[], id: string): EditorLine[] {
  return lines.filter((l) => l.id !== id);
}

/** Moves a line one place up (-1) or down (1); at the ends nothing changes. */
export function moveLine(lines: readonly EditorLine[], id: string, delta: -1 | 1): EditorLine[] {
  const from = lines.findIndex((l) => l.id === id);
  const to = from + delta;
  if (from < 0 || to < 0 || to >= lines.length) return [...lines];
  const next = [...lines];
  [next[from], next[to]] = [next[to]!, next[from]!];
  return next;
}

export type SortBy = "number" | "name" | "size" | "entered";

/**
 * A one-time reorder (4.7). "By number": by value, lines without a number last; "by name": alphabetical, no name
 * last; "by size": the product's order, no size last; "as entered" is the order the lines were added in
 * (`entered`: the ids in that order, kept by the interface).
 */
export function sortLines(lines: readonly EditorLine[], by: SortBy, options: { sizes: readonly TeamListSize[]; entered?: readonly string[] }): EditorLine[] {
  const table = buildSizeTable(options.sizes);
  const rank = (l: EditorLine): number => {
    if (by === "number") return jerseyNumberValue(l.number) ?? Infinity;
    if (by === "size") {
      if (l.size === "") return Infinity;
      const at = table.codes.indexOf(normalizeSize(l.size, table));
      return at >= 0 ? at : table.codes.length;
    }
    if (by === "entered") {
      const at = options.entered?.indexOf(l.id) ?? -1;
      return at >= 0 ? at : Infinity;
    }
    return 0;
  };
  const indexed = lines.map((l, i) => ({ l, i }));
  indexed.sort((a, b) => {
    if (by === "name") {
      if (a.l.name === "" || b.l.name === "") return a.l.name === b.l.name ? a.i - b.i : a.l.name === "" ? 1 : -1;
      return a.l.name.localeCompare(b.l.name, undefined, { sensitivity: "base" }) || a.i - b.i;
    }
    const ra = rank(a.l);
    const rb = rank(b.l);
    if (ra === rb) return a.i - b.i;
    return ra < rb ? -1 : 1;
  });
  return indexed.map((x) => x.l);
}

/** Every number written in one digit system (7.4): "0-9" or the Arabic-Indic digits. Leading zeros and other characters stay. */
export function convertAllDigits(lines: readonly EditorLine[], to: "western" | "arabic-indic"): EditorLine[] {
  const zero = to === "western" ? 0x30 : 0x660;
  const convert = (value: string) => {
    let out = "";
    for (const ch of value) {
      const code = ch.codePointAt(0)!;
      const digit = code >= 0x30 && code <= 0x39 ? code - 0x30 : code >= 0x660 && code <= 0x669 ? code - 0x660 : code >= 0x6f0 && code <= 0x6f9 ? code - 0x6f0 : -1;
      out += digit >= 0 ? String.fromCodePoint(zero + digit) : ch;
    }
    return out;
  };
  return lines.map((l) => (convert(l.number) === l.number ? l : { ...l, number: convert(l.number) }));
}

/**
 * The clean-up on leaving a field (4.1), never while typing: spaces trimmed, runs of spaces made one, NFC; the
 * size in the product's spelling when it is one of the product's. Nothing is capitalised or shortened. Returns
 * the same array when nothing changed.
 */
export function cleanField(lines: readonly EditorLine[], id: string, field: TextField, table: SizeTable): EditorLine[] {
  const line = lines.find((l) => l.id === id);
  if (!line) return lines as EditorLine[];
  const cleaned = field === "size" ? normalizeSize(line.size, table) : cleanText(line[field]);
  return cleaned === line[field] ? (lines as EditorLine[]) : setField(lines, id, field, cleaned);
}

/** The lines that are not empty scratch lines: what is counted, checked and handed to the host. */
export function filledLines(lines: readonly EditorLine[]): EditorLine[] {
  return lines.filter((l) => !isEmptyLine(l));
}

/**
 * By size (a design with neither a name nor a number, 9): the pieces of one size as lines without a name or a
 * number, as many as the per-line limit needs ("one per size, each with its quantity"). Lines with a name or a
 * number keep theirs and count towards the total. `count` is the size's total pieces.
 */
export function setSizeCountLines(lines: readonly EditorLine[], code: string, count: number, options: { table: SizeTable; maxCount: number }): EditorLine[] {
  const same = (l: EditorLine) => l.size !== "" && normalizeSize(l.size, options.table) === code;
  const nameless = (l: EditorLine) => l.name === "" && l.number === "";
  const named = lines.filter((l) => same(l) && !nameless(l)).reduce((n, l) => n + l.count, 0);
  const old = lines.filter((l) => same(l) && nameless(l));
  const first = lines.findIndex((l) => same(l) && nameless(l));
  const rest = lines.filter((l) => !(same(l) && nameless(l)));
  const chunks: EditorLine[] = [];
  let left = Math.max(0, count - named);
  while (left > 0) {
    const n = Math.min(left, options.maxCount);
    const reused = old[chunks.length];
    chunks.push({ ...(reused ?? newLine()), size: code, count: n, name: "", number: "", noName: false, noNumber: false });
    left -= n;
  }
  const at = first < 0 ? rest.length : lines.slice(0, first).filter((l) => !(same(l) && nameless(l))).length;
  return [...rest.slice(0, at), ...chunks, ...rest.slice(at)];
}
