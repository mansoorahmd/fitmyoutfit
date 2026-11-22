import { describe, expect, it } from "vitest";
import { analyzeRoster } from "./check.js";
import { DEFAULT_LIMITS } from "./limits.js";
import {
  analysisFromContract,
  analysisToContract,
  limitsFromContract,
  limitsToContract,
  lineFromContract,
  lineToContract,
  linesFromContract,
  linesToContract,
  problemFromContract,
  problemToContract,
  summaryFromContract,
} from "./contract.js";
import type { RosterLine, RosterSettings } from "./types.js";

const line = (extra: Partial<RosterLine> = {}): RosterLine => ({ id: "l1", name: "Ali", number: "7", size: "M", count: 1, noName: false, noNumber: false, ...extra });
const empty = { name: "", number: "", size: "", count: 1, noName: false, noNumber: false };

describe("lines", () => {
  it("noName and noNumber become no_name and no_number, and back", () => {
    const l = line({ noName: true, count: 3 });
    expect(lineToContract(l)).toEqual({ id: "l1", name: "Ali", number: "7", size: "M", count: 3, no_name: true, no_number: false });
    expect(lineFromContract(lineToContract(l))).toEqual(l);
  });
  it("a line without an id has none in the body; a server line keeps its flags (the QA20 S1 case)", () => {
    expect(lineToContract(line({ id: undefined }))).not.toHaveProperty("id");
    expect(lineFromContract({ id: "ln_1", name: "", number: "5", size: "L", count: 1, no_name: true, no_number: false })).toMatchObject({ id: "ln_1", noName: true, noNumber: false });
  });
  it("missing text is empty, a missing count 1, a missing flag false; junk is read as empty, never thrown", () => {
    expect(lineFromContract({})).toEqual(empty);
    expect(lineFromContract({ name: 5, count: "2", no_name: "yes" })).toEqual(empty);
    expect(lineFromContract(null)).toEqual(empty);
    expect(linesFromContract("no")).toEqual([]);
  });
  it("a list round-trips in order", () => {
    const lines = [line(), line({ id: "l2", name: "محمد", number: "٧", noNumber: true })];
    expect(linesFromContract(linesToContract(lines))).toEqual(lines);
  });
});

describe("problems, summary and limits", () => {
  const settings: RosterSettings = {
    prints: { name: true, number: true },
    sizes: ["S", "M", "L"],
    taken: [{ number: "7", source: "first-order", orderId: "to_1", name: "Bilal" }],
  };
  const lines = [line({ id: "a", name: "Ali3", number: "07" }), line({ id: "b", name: "Bo", number: "9", size: "XXL", count: 11 }), line({ id: "c", name: "", number: "9" })];
  const analysis = analyzeRoster(lines, settings, { minimum: 10 });

  it("a taken number goes out in snake case with the server's source names, and comes back the same", () => {
    const taken = analysis.problems.find((p) => p.code === "number-taken-first-order")!;
    const out = problemToContract(taken);
    expect(out).toMatchObject({ code: "number-taken-first-order", line_id: "a", field: "number", detail: { value: 7, taken_in: [{ source: "first_order", order_id: "to_1", name: "Bilal" }] } });
    expect(out.detail).not.toHaveProperty("takenIn");
    expect(problemFromContract(out)).toEqual(taken);
  });
  it("every problem the checks can give round-trips (others, length, count, size, has_digit)", () => {
    for (const p of analysis.problems) expect(problemFromContract(problemToContract(p))).toEqual(p);
    expect(analysis.problems.some((p) => p.detail?.others)).toBe(true);
    const chars = analyzeRoster([line({ name: "Al1" })], settings).problems.find((p) => p.code === "name-character")!;
    expect(problemToContract(chars).detail).toMatchObject({ has_digit: true, characters: ["1"] });
    expect(problemFromContract(problemToContract(chars))).toEqual(chars);
  });
  it("a problem without a line id has line_id null, and without detail has detail null; both come back as no key", () => {
    expect(problemToContract({ code: "list-too-long", index: -1, field: "list", detail: { lines: 101, max: 100 } })).toEqual({ code: "list-too-long", index: -1, line_id: null, field: "list", detail: { lines: 101, max: 100 } });
    const bare = problemToContract({ code: "size-missing", index: 0, field: "size" });
    expect(bare).toEqual({ code: "size-missing", index: 0, line_id: null, field: "size", detail: null });
    expect(problemFromContract(bare)).toEqual({ code: "size-missing", index: 0, field: "size" });
  });
  it("a problem code the package does not know is kept as read", () => {
    expect(problemFromContract({ code: "future-code", index: 2, line_id: "x", field: "name", detail: null }).code).toBe("future-code");
  });
  it("the whole analysis round-trips, and the summary reads the server's snake_case answer", () => {
    expect(analysisFromContract(analysisToContract(analysis))).toEqual(analysis);
    const server = {
      players: 3,
      pieces: 4,
      by_size: [{ size: "S", pieces: 0 }],
      other_sizes: [{ size: "XXL", pieces: 1 }],
      lines_without_size: 0,
      pieces_without_size: 0,
      ready_lines: 1,
      lines_to_fix: 2,
      indexes_to_fix: [0, 1],
      minimum: { required: 10, missing: 6, met: false },
      ready_for_proof: false,
    };
    expect(summaryFromContract(server)).toMatchObject({ bySize: [{ size: "S", pieces: 0 }], indexesToFix: [0, 1], linesToFix: 2, minimum: { required: 10, missing: 6, met: false }, readyForProof: false });
    expect(summaryFromContract({ minimum: null }).minimum).toBeNull();
  });
  it("the server's limits object is read (before, it was silently ignored); bad values are skipped", () => {
    expect(limitsFromContract({ max_lines: 40, min_count: 1, max_count: 4, max_name_length: 12 })).toEqual({ maxLines: 40, minCount: 1, maxCount: 4, maxNameLength: 12 });
    expect(limitsFromContract({ max_lines: 0, max_count: "4", max_name_length: 12.5 })).toEqual({});
    expect(limitsToContract(DEFAULT_LIMITS)).toEqual({ max_lines: 100, min_count: 1, max_count: 10, max_name_length: 18 });
  });
});
