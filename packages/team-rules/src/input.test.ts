import { describe, expect, it } from "vitest";
import { parseRosterInput } from "./input.js";

const okLine = { id: "a", name: "Ali", number: "7", size: "M", count: 2, noName: false, noNumber: true };

describe("parseRosterInput: the shape only", () => {
  it("accepts a list, with missing fields defaulted", () => {
    expect(parseRosterInput([okLine, {}])).toEqual({
      ok: true,
      lines: [
        { id: "a", name: "Ali", number: "7", size: "M", count: 2, noName: false, noNumber: true },
        { name: "", number: "", size: "", count: 1, noName: false, noNumber: false },
      ],
    });
  });

  it("accepts an empty list", () => {
    expect(parseRosterInput([])).toEqual({ ok: true, lines: [] });
  });

  it("accepts an incomplete or wrong list: that is for the checks, not the shape", () => {
    expect(parseRosterInput([{ name: "", number: "abc", size: "4XL", count: 99 }]).ok).toBe(true);
  });

  it.each([
    [{}, { code: "not-a-list" }],
    ["x", { code: "not-a-list" }],
    [null, { code: "not-a-list" }],
    [[1], { code: "line-not-an-object", index: 0 }],
    [[null], { code: "line-not-an-object", index: 0 }],
    [[[]], { code: "line-not-an-object", index: 0 }],
    [[{}, { name: 5 }], { code: "wrong-type", index: 1, field: "name" }],
    [[{ number: 7 }], { code: "wrong-type", index: 0, field: "number" }],
    [[{ size: {} }], { code: "wrong-type", index: 0, field: "size" }],
    [[{ count: "2" }], { code: "wrong-type", index: 0, field: "count" }],
    [[{ count: Number.NaN }], { code: "wrong-type", index: 0, field: "count" }],
    [[{ noName: "yes" }], { code: "wrong-type", index: 0, field: "noName" }],
    [[{ noNumber: 1 }], { code: "wrong-type", index: 0, field: "noNumber" }],
    [[{ id: 3 }], { code: "wrong-type", index: 0, field: "id" }],
    [[{ name: "x".repeat(201) }], { code: "too-long", index: 0, field: "name", max: 200 }],
    [[{ id: "x".repeat(65) }], { code: "too-long", index: 0, field: "id", max: 64 }],
    [[{ id: "a" }, { id: "b" }, { id: "a" }], { code: "duplicate-line-id", index: 2, id: "a" }],
  ])("refuses %j", (input, error) => {
    expect(parseRosterInput(input)).toEqual({ ok: false, error });
  });

  it("refuses more than the line limit, and the limit is a setting", () => {
    const many = Array.from({ length: 101 }, () => ({}));
    expect(parseRosterInput(many)).toEqual({ ok: false, error: { code: "too-many-lines", lines: 101, max: 100 } });
    expect(parseRosterInput(many.slice(0, 100)).ok).toBe(true);
    expect(parseRosterInput(many.slice(0, 5), { maxLines: 4 })).toEqual({
      ok: false,
      error: { code: "too-many-lines", lines: 5, max: 4 },
    });
  });
});
