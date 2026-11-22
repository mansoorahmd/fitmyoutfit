/**
 * A saved list coming back (11.1, 12.3 "the saved list, or nothing"): its shape is checked by the rules package, its
 * content is not (a list with problems is still a list: the checks run on it as on any other).
 *
 * One bad line never costs the whole list (G4, S2): the lines that can be read are kept, a text that is too long is
 * cut to what the reader accepts, a value of the wrong type is reset, and each such thing is reported in `notes` (the
 * shell hands them to `teamList.onReadNotes`). Only a list that is not a list, or is for another product, is empty.
 */
import { DEFAULT_LIMITS, parseRosterInput, resolveLimits } from "@fitmyoutfit/team-rules";
import type { RosterLimits, RosterLine } from "@fitmyoutfit/team-rules";
import { withIds } from "./lines.js";
import type { EditorLine } from "./types.js";

/** The longest text of each field the package's reader accepts (packages/team-rules/src/input.ts: id 64, name 200, number 40, size 40). */
export const FIELD_MAX = Object.freeze({ id: 64, name: 200, number: 40, size: 40 });

/** What was left out or changed when a saved list was read. `index` is the line's place in the saved list (0 first). */
export type ReadNote =
  | { code: "not-usable"; reason: "not-a-list" | "other-product" | "other-version" }
  | { code: "line-left-out"; index: number; reason: "not-an-object" | "over-the-limit" }
  | { code: "field-cut"; index: number; field: "name" | "number" | "size" | "id"; max: number }
  | { code: "field-reset"; index: number; field: "name" | "number" | "size" | "id" | "count" | "noName" | "noNumber" };

export interface SavedListRead {
  lines: EditorLine[];
  notes: ReadNote[];
}

const isCount = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && Math.abs(v) <= 2147483647;

/** The lines of a saved list for this product, and what could not be kept. */
export function readSavedListWithNotes(saved: unknown, options: { productId: string; limits?: Partial<RosterLimits> }): SavedListRead {
  const notes: ReadNote[] = [];
  const none = (reason: "not-a-list" | "other-product" | "other-version"): SavedListRead => ({ lines: [], notes: [{ code: "not-usable", reason }] });
  if (!saved || typeof saved !== "object") return { lines: [], notes };
  const record = saved as { version?: unknown; productId?: unknown; lines?: unknown };
  if (record.version !== 1) return none("other-version");
  if (record.productId !== options.productId) return none("other-product");
  if (!Array.isArray(record.lines)) return none("not-a-list");
  const limits = resolveLimits(options.limits ?? DEFAULT_LIMITS);
  const kept: unknown[] = [];
  const ids = new Set<string>();
  (record.lines as unknown[]).forEach((raw, index) => {
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
      notes.push({ code: "line-left-out", index, reason: "not-an-object" });
      return;
    }
    if (kept.length >= limits.maxLines) {
      notes.push({ code: "line-left-out", index, reason: "over-the-limit" });
      return;
    }
    const row = { ...(raw as Record<string, unknown>) };
    for (const field of ["id", "name", "number", "size"] as const) {
      const value = row[field];
      if (value === undefined || value === null) continue;
      if (typeof value !== "string") {
        delete row[field];
        notes.push({ code: "field-reset", index, field });
      } else if (value.length > FIELD_MAX[field]) {
        if (field === "id") {
          delete row.id;
          notes.push({ code: "field-reset", index, field });
        } else {
          row[field] = value.slice(0, FIELD_MAX[field]);
          notes.push({ code: "field-cut", index, field, max: FIELD_MAX[field] });
        }
      }
    }
    if (typeof row.id === "string" && row.id !== "") {
      if (ids.has(row.id)) {
        delete row.id;
        notes.push({ code: "field-reset", index, field: "id" });
      } else ids.add(row.id);
    }
    if (row.count !== undefined && !isCount(row.count)) {
      delete row.count;
      notes.push({ code: "field-reset", index, field: "count" });
    }
    for (const flag of ["noName", "noNumber"] as const) {
      if (row[flag] !== undefined && typeof row[flag] !== "boolean") {
        delete row[flag];
        notes.push({ code: "field-reset", index, field: flag });
      }
    }
    kept.push(row);
  });
  const parsed = parseRosterInput(kept, options.limits);
  // Cleaned above, so this holds; if the package ever learns a new refusal, the list is empty and the host is told.
  if (!parsed.ok) return none("not-a-list");
  return { lines: withIds(parsed.lines as RosterLine[]), notes };
}

/** The lines of a saved list for this product, or an empty list when there is none or it is not usable. (`readSavedListWithNotes` also says what was left out.) */
export function readSavedList(saved: unknown, options: { productId: string; limits?: Partial<RosterLimits> }): EditorLine[] {
  return readSavedListWithNotes(saved, options).lines;
}
