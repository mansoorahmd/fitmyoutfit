/**
 * The mappers between this package's shapes (camelCase, as the editor and the checks use them) and the server's
 * contract shapes (snake_case, docs/contracts/m2-team-orders.md): a line (`no_name`, `no_number`), a problem
 * (`line_id`, `detail` with `taken_in`, `has_digit`, `order_id`), the summary (`by_size`, `indexes_to_fix`,
 * `ready_for_proof`, the minimum as `{ required, missing, met }`) and the limits (`max_lines` ...).
 *
 * Plain functions over plain data, no dependency. The "to" functions build a request body (the PUT roster's `lines`);
 * the "from" functions read an answer (`roster.lines`, `roster.problems`, `roster.summary`, `limits`). Keys the contract
 * does not name are ignored by the "from" functions. A value of the wrong type in an answer is read as the field's
 * empty value, never thrown at: the answer is trusted for its shape, not for every field.
 */
import type {
  LineField,
  LineRef,
  NoteCode,
  ProblemCode,
  RosterAnalysis,
  RosterLimits,
  RosterLine,
  RosterNote,
  RosterProblem,
  RosterSummary,
  SizeCount,
  TakenRef,
  TakenSource,
} from "./types.js";

/** A line as the contract names it (the PUT roster's input and `roster.lines`). */
export interface ContractLine {
  id?: string;
  name: string;
  number: string;
  size: string;
  count: number;
  no_name: boolean;
  no_number: boolean;
}

export interface ContractTakenRef {
  source: "first_order" | "add_on";
  order_id?: string;
  name?: string;
}

export interface ContractProblem {
  code: ProblemCode;
  index: number;
  line_id: string | null;
  field: LineField | "list";
  detail: Record<string, unknown> | null;
}

export interface ContractNote {
  code: NoteCode;
  index: number;
  line_id: string | null;
}

export interface ContractSummary {
  players: number;
  pieces: number;
  by_size: SizeCount[];
  other_sizes: SizeCount[];
  lines_without_size: number;
  pieces_without_size: number;
  ready_lines: number;
  lines_to_fix: number;
  indexes_to_fix: number[];
  minimum: { required: number; missing: number; met: boolean } | null;
  ready_for_proof: boolean;
}

export interface ContractLimits {
  max_lines: number;
  min_count: number;
  max_count: number;
  max_name_length: number;
}

type Rec = Record<string, unknown>;
const rec = (v: unknown): Rec => (typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Rec) : {});
const str = (v: unknown): string => (typeof v === "string" ? v : "");
const num = (v: unknown, fallback: number): number => (typeof v === "number" && Number.isFinite(v) ? v : fallback);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const optStr = (v: unknown): string | undefined => (typeof v === "string" ? v : undefined);

// ---- Lines

/** A line to the contract's body: `noName` becomes `no_name`, `noNumber` `no_number`; the id is kept when there is one. */
export function lineToContract(line: RosterLine): ContractLine {
  return {
    ...(line.id !== undefined && line.id !== "" ? { id: line.id } : {}),
    name: line.name,
    number: line.number,
    size: line.size,
    count: line.count,
    no_name: line.noName,
    no_number: line.noNumber,
  };
}

/** A line from the contract (`roster.lines`, or a saved body): `no_name`, `no_number`. Missing text is empty, a missing count 1, a missing flag false. */
export function lineFromContract(raw: unknown): RosterLine {
  const r = rec(raw);
  const id = optStr(r.id);
  return {
    ...(id !== undefined && id !== "" ? { id } : {}),
    name: str(r.name),
    number: str(r.number),
    size: str(r.size),
    count: num(r.count, 1),
    noName: r.no_name === true,
    noNumber: r.no_number === true,
  };
}

export function linesToContract(lines: readonly RosterLine[]): ContractLine[] {
  return lines.map(lineToContract);
}

export function linesFromContract(raw: unknown): RosterLine[] {
  return arr(raw).map(lineFromContract);
}

// ---- Problems and notes

const toSource = (s: TakenSource): ContractTakenRef["source"] => (s === "first-order" ? "first_order" : "add_on");
const fromSource = (s: unknown): TakenSource => (s === "first_order" || s === "first-order" ? "first-order" : "add-on");

/** A problem to the contract's shape: `lineId` becomes `line_id` (null when none), `detail` is snake-cased (`taken_in`, `has_digit`, `order_id`; sources `first_order` and `add_on`), null when none. */
export function problemToContract(p: RosterProblem): ContractProblem {
  const d = p.detail;
  let detail: Record<string, unknown> | null = null;
  if (d) {
    detail = {};
    if (d.value !== undefined) detail.value = d.value;
    if (d.others) detail.others = d.others.map((o) => ({ index: o.index, ...(o.id !== undefined ? { id: o.id } : {}), name: o.name }));
    if (d.takenIn) {
      detail.taken_in = d.takenIn.map((t) => ({
        source: toSource(t.source),
        ...(t.orderId !== undefined ? { order_id: t.orderId } : {}),
        ...(t.name !== undefined ? { name: t.name } : {}),
      }));
    }
    if (d.characters) detail.characters = [...d.characters];
    if (d.hasDigit !== undefined) detail.has_digit = d.hasDigit;
    for (const key of ["length", "max", "size", "count", "min", "lines"] as const) if (d[key] !== undefined) detail[key] = d[key];
  }
  return { code: p.code, index: p.index, line_id: p.lineId ?? null, field: p.field, detail };
}

const FIELDS = new Set(["name", "number", "size", "count", "list"]);

/** A problem from the contract. A code this package does not know is returned as read (the server may be newer): show it, never drop it. */
export function problemFromContract(raw: unknown): RosterProblem {
  const r = rec(raw);
  const lineId = optStr(r.line_id);
  const d = r.detail === null || r.detail === undefined ? null : rec(r.detail);
  const out: RosterProblem = {
    code: str(r.code) as ProblemCode,
    index: num(r.index, -1),
    ...(lineId !== undefined ? { lineId } : {}),
    field: FIELDS.has(str(r.field)) ? (str(r.field) as RosterProblem["field"]) : "list",
  };
  if (d) {
    const detail: NonNullable<RosterProblem["detail"]> = {};
    if (typeof d.value === "number") detail.value = d.value;
    if (Array.isArray(d.others)) {
      detail.others = d.others.map((o): LineRef => {
        const x = rec(o);
        const id = optStr(x.id);
        return { index: num(x.index, -1), ...(id !== undefined ? { id } : {}), name: str(x.name) };
      });
    }
    if (Array.isArray(d.taken_in)) {
      detail.takenIn = d.taken_in.map((t): TakenRef => {
        const x = rec(t);
        const orderId = optStr(x.order_id);
        const name = optStr(x.name);
        return { source: fromSource(x.source), ...(orderId !== undefined ? { orderId } : {}), ...(name !== undefined ? { name } : {}) };
      });
    }
    if (Array.isArray(d.characters)) detail.characters = d.characters.filter((c): c is string => typeof c === "string");
    if (typeof d.has_digit === "boolean") detail.hasDigit = d.has_digit;
    for (const key of ["length", "max", "count", "min", "lines"] as const) if (typeof d[key] === "number") detail[key] = d[key];
    if (typeof d.size === "string") detail.size = d.size;
    out.detail = detail;
  }
  return out;
}

export function noteToContract(n: RosterNote): ContractNote {
  return { code: n.code, index: n.index, line_id: n.lineId ?? null };
}

export function noteFromContract(raw: unknown): RosterNote {
  const r = rec(raw);
  const lineId = optStr(r.line_id);
  return { code: str(r.code) as NoteCode, index: num(r.index, -1), ...(lineId !== undefined ? { lineId } : {}) };
}

// ---- Summary

export function summaryToContract(s: RosterSummary): ContractSummary {
  return {
    players: s.players,
    pieces: s.pieces,
    by_size: s.bySize.map((x) => ({ ...x })),
    other_sizes: s.otherSizes.map((x) => ({ ...x })),
    lines_without_size: s.linesWithoutSize,
    pieces_without_size: s.piecesWithoutSize,
    ready_lines: s.readyLines,
    lines_to_fix: s.linesToFix,
    indexes_to_fix: [...s.indexesToFix],
    minimum: s.minimum ? { ...s.minimum } : null,
    ready_for_proof: s.readyForProof,
  };
}

const counts = (v: unknown): SizeCount[] => arr(v).map((x) => ({ size: str(rec(x).size), pieces: num(rec(x).pieces, 0) }));

export function summaryFromContract(raw: unknown): RosterSummary {
  const r = rec(raw);
  const m = r.minimum === null || r.minimum === undefined ? null : rec(r.minimum);
  return {
    players: num(r.players, 0),
    pieces: num(r.pieces, 0),
    bySize: counts(r.by_size),
    otherSizes: counts(r.other_sizes),
    linesWithoutSize: num(r.lines_without_size, 0),
    piecesWithoutSize: num(r.pieces_without_size, 0),
    readyLines: num(r.ready_lines, 0),
    linesToFix: num(r.lines_to_fix, 0),
    indexesToFix: arr(r.indexes_to_fix).filter((i): i is number => typeof i === "number"),
    minimum: m ? { required: num(m.required, 0), missing: num(m.missing, 0), met: m.met === true } : null,
    readyForProof: r.ready_for_proof === true,
  };
}

/** The `roster` answer's problems, notes and summary as `RosterAnalysis` (`roster.lines` is read apart with `linesFromContract`). */
export function analysisFromContract(roster: unknown): RosterAnalysis {
  const r = rec(roster);
  return { problems: arr(r.problems).map(problemFromContract), notes: arr(r.notes).map(noteFromContract), summary: summaryFromContract(r.summary) };
}

export function analysisToContract(a: RosterAnalysis): { problems: ContractProblem[]; notes: ContractNote[]; summary: ContractSummary } {
  return { problems: a.problems.map(problemToContract), notes: a.notes.map(noteToContract), summary: summaryToContract(a.summary) };
}

// ---- Limits

/** The server's `limits` object as a `Partial<RosterLimits>`: only the keys the server sends and that are whole numbers of 1 or more (the number rules stay the package's). */
export function limitsFromContract(raw: unknown): Partial<RosterLimits> {
  const r = rec(raw);
  const out: Partial<RosterLimits> = {};
  const pairs = [
    ["max_lines", "maxLines"],
    ["min_count", "minCount"],
    ["max_count", "maxCount"],
    ["max_name_length", "maxNameLength"],
  ] as const;
  for (const [from, to] of pairs) {
    const v = r[from];
    if (typeof v === "number" && Number.isSafeInteger(v) && v >= 1) out[to] = v;
  }
  return out;
}

export function limitsToContract(limits: Pick<RosterLimits, "maxLines" | "minCount" | "maxCount" | "maxNameLength">): ContractLimits {
  return { max_lines: limits.maxLines, min_count: limits.minCount, max_count: limits.maxCount, max_name_length: limits.maxNameLength };
}
