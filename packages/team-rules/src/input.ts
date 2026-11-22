/**
 * Taking a list from outside (a request body, a saved file): the shape is checked, the content is
 * not. A list with problems is still a list (`checkRoster` reports them); only a list that is
 * malformed or over the limits is refused here (decision 012; M2-1: "nothing is refused for being
 * incomplete").
 */
import { resolveLimits } from "./limits.js";
import type { RosterLimits, RosterLine } from "./types.js";

export type RosterInputError =
  | { code: "not-a-list" }
  | { code: "too-many-lines"; lines: number; max: number }
  | { code: "line-not-an-object"; index: number }
  | { code: "wrong-type"; index: number; field: string }
  | { code: "too-long"; index: number; field: string; max: number }
  | { code: "duplicate-line-id"; index: number; id: string };

export type RosterInputResult = { ok: true; lines: RosterLine[] } | { ok: false; error: RosterInputError };

/** The longest text of each field that is read at all, so a body cannot carry a megabyte of name. */
const MAX_FIELD_LENGTH = { id: 64, name: 200, number: 40, size: 40 } as const;

function text(
  value: unknown,
  index: number,
  field: keyof typeof MAX_FIELD_LENGTH,
): { ok: true; value: string } | { ok: false; error: RosterInputError } {
  if (value === undefined || value === null) return { ok: true, value: "" };
  if (typeof value !== "string") return { ok: false, error: { code: "wrong-type", index, field } };
  if (value.length > MAX_FIELD_LENGTH[field]) {
    return { ok: false, error: { code: "too-long", index, field, max: MAX_FIELD_LENGTH[field] } };
  }
  return { ok: true, value };
}

/**
 * Checks the shape of a list and returns its lines (unclean: run `normalizeLines` next).
 * A line is `{ id?, name?, number?, size?, count?, noName?, noNumber? }`: missing text is empty,
 * a missing count is 1, a missing flag is false. A count that is not a number, a flag that is not
 * a boolean, text that is not a string, or a line id used twice make the list malformed.
 */
export function parseRosterInput(input: unknown, limitOverrides?: Partial<RosterLimits>): RosterInputResult {
  const limits = resolveLimits(limitOverrides);
  if (!Array.isArray(input)) return { ok: false, error: { code: "not-a-list" } };
  if (input.length > limits.maxLines) {
    return { ok: false, error: { code: "too-many-lines", lines: input.length, max: limits.maxLines } };
  }
  const lines: RosterLine[] = [];
  const ids = new Set<string>();
  for (let index = 0; index < input.length; index += 1) {
    const raw: unknown = input[index];
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
      return { ok: false, error: { code: "line-not-an-object", index } };
    }
    const row = raw as Record<string, unknown>;
    const id = text(row.id, index, "id");
    const name = text(row.name, index, "name");
    const number = text(row.number, index, "number");
    const size = text(row.size, index, "size");
    for (const part of [id, name, number, size]) if (!part.ok) return { ok: false, error: part.error };
    if (row.count !== undefined && (typeof row.count !== "number" || !Number.isFinite(row.count))) {
      return { ok: false, error: { code: "wrong-type", index, field: "count" } };
    }
    for (const flag of ["noName", "noNumber"] as const) {
      if (row[flag] !== undefined && typeof row[flag] !== "boolean") {
        return { ok: false, error: { code: "wrong-type", index, field: flag } };
      }
    }
    const line: RosterLine = {
      name: (name as { value: string }).value,
      number: (number as { value: string }).value,
      size: (size as { value: string }).value,
      count: row.count === undefined ? 1 : (row.count as number),
      noName: row.noName === true,
      noNumber: row.noNumber === true,
    };
    const lineId = (id as { value: string }).value;
    if (lineId !== "") {
      if (ids.has(lineId)) return { ok: false, error: { code: "duplicate-line-id", index, id: lineId } };
      ids.add(lineId);
      line.id = lineId;
    }
    lines.push(line);
  }
  return { ok: true, lines };
}
