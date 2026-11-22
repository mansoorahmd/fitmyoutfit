/** Reading a saved list keeps what it can and says what it left out (G4 S2; QA20: one bad line used to drop the whole list). */
import { describe, expect, it } from "vitest";
import { FIELD_MAX, readSavedListWithNotes } from "./saved.js";

const base = { version: 1, productId: "p1" };
const ok = (name: string, extra: Record<string, unknown> = {}) => ({ name, number: "1", size: "M", count: 1, noName: false, noNumber: false, ...extra });
const read = (lines: unknown, limits?: { maxLines: number }) => readSavedListWithNotes({ ...base, lines }, { productId: "p1", ...(limits ? { limits } : {}) });

describe("one bad line no longer drops the list", () => {
  it("a name over 200 characters is cut to 200 and reported; the other lines are untouched", () => {
    const r = read([ok("A"), ok("x".repeat(250)), ok("C")]);
    expect(r.lines.map((l) => l.name.length)).toEqual([1, 200, 1]);
    expect(r.notes).toEqual([{ code: "field-cut", index: 1, field: "name", max: 200 }]);
  });
  it("a repeated id gets a new one; a fraction count is reset to 1; a wrong flag is reset", () => {
    const r = read([ok("A", { id: "a" }), ok("B", { id: "a" }), ok("C", { count: 1.5, noName: "yes" })]);
    expect(r.lines).toHaveLength(3);
    expect(new Set(r.lines.map((l) => l.id)).size).toBe(3);
    expect(r.lines[2]).toMatchObject({ count: 1, noName: false });
    expect(r.notes.map((n) => n.code)).toEqual(["field-reset", "field-reset", "field-reset"]);
  });
  it("a line that is not an object is left out and reported with its place", () => {
    const r = read([ok("A"), 5, null, ok("B")]);
    expect(r.lines.map((l) => l.name)).toEqual(["A", "B"]);
    expect(r.notes).toEqual([{ code: "line-left-out", index: 1, reason: "not-an-object" }, { code: "line-left-out", index: 2, reason: "not-an-object" }]);
  });
  it("lines over the limit are left out from the end: 101 lines keep 100", () => {
    const r = read(Array.from({ length: 101 }, (_, i) => ok(`P${i}`)));
    expect(r.lines).toHaveLength(100);
    expect(r.notes).toEqual([{ code: "line-left-out", index: 100, reason: "over-the-limit" }]);
  });
  it("a clean list gives no notes; nothing, another product or another version give an empty list (the last two with a note)", () => {
    expect(read([ok("A")]).notes).toEqual([]);
    expect(readSavedListWithNotes(null, { productId: "p1" })).toEqual({ lines: [], notes: [] });
    expect(readSavedListWithNotes({ ...base, productId: "x", lines: [ok("A")] }, { productId: "p1" }).notes).toEqual([{ code: "not-usable", reason: "other-product" }]);
    expect(readSavedListWithNotes({ version: 2, productId: "p1", lines: [] }, { productId: "p1" }).notes).toEqual([{ code: "not-usable", reason: "other-version" }]);
    expect(read("no").notes).toEqual([{ code: "not-usable", reason: "not-a-list" }]);
  });
  it("the field limits are the package reader's", () => {
    expect(FIELD_MAX).toEqual({ id: 64, name: 200, number: 40, size: 40 });
  });
});
