import { describe, expect, it } from "vitest";
import { analyzeRoster, checkRoster, normalizeLines, piecesOf, summarizeRoster } from "./check.js";
import { DEFAULT_LIMITS } from "./limits.js";
import type { RosterLine, RosterSettings } from "./types.js";

const SIZES = ["YS", "YM", "YL", "YXL", "XS", "S", "M", "L", "XL", "2XL", "3XL"];
const BOTH: RosterSettings = { prints: { name: true, number: true }, sizes: SIZES };

function line(partial: Partial<RosterLine> = {}): RosterLine {
  return { name: "Ali Raza", number: "10", size: "M", count: 1, noName: false, noNumber: false, ...partial };
}

/** Problems as "index:field:code" for a short comparison. */
function codes(lines: RosterLine[], settings: RosterSettings = BOTH): string[] {
  return checkRoster(lines, settings).problems.map((p) => `${p.index}:${p.field}:${p.code}`);
}

describe("the defaults are decision 012's, as data", () => {
  it("100 lines, 1 to 10 of a shirt, 18 characters, numbers 0 to 99", () => {
    expect(DEFAULT_LIMITS).toMatchObject({ maxLines: 100, minCount: 1, maxCount: 10, maxNameLength: 18 });
    expect(DEFAULT_LIMITS.numberRules.maxValue).toBe(99);
  });
});

describe("a list with no problems", () => {
  it("20 complete lines report nothing", () => {
    const lines = Array.from({ length: 20 }, (_, i) => line({ name: `Player ${String.fromCharCode(65 + i)}`, number: String(i + 1), size: SIZES[i % SIZES.length]! }));
    const analysis = analyzeRoster(lines, BOTH, { minimum: 10 });
    expect(analysis.problems).toEqual([]);
    expect(analysis.summary.readyForProof).toBe(true);
    expect(analysis.summary.players).toBe(20);
  });

  it("an empty list has no problems and is not ready for a proof", () => {
    const analysis = analyzeRoster([], BOTH);
    expect(analysis.problems).toEqual([]);
    expect(analysis.summary.readyForProof).toBe(false);
  });
});

describe("required fields follow the design and the line's flags (sections 9 and 10)", () => {
  it("a blank name, number and size are each reported", () => {
    expect(codes([line({ name: "", number: "", size: "" })])).toEqual([
      "0:name:name-missing",
      "0:number:number-missing",
      "0:size:size-missing",
    ]);
  });

  it("number only: the name is optional", () => {
    expect(codes([line({ name: "" })], { ...BOTH, prints: { name: false, number: true } })).toEqual([]);
  });

  it("name only: the number is optional", () => {
    expect(codes([line({ number: "" })], { ...BOTH, prints: { name: true, number: false } })).toEqual([]);
  });

  it("neither printed: only the size is required", () => {
    const plain: RosterSettings = { ...BOTH, prints: { name: false, number: false } };
    expect(codes([line({ name: "", number: "", size: "" })], plain)).toEqual(["0:size:size-missing"]);
    expect(codes([line({ name: "", number: "", size: "M", count: 4 })], plain)).toEqual([]);
  });

  it("'no name' and 'no number' on a line make the empty field fine", () => {
    expect(codes([line({ name: "", noName: true, number: "", noNumber: true })])).toEqual([]);
  });

  it("a forgotten name is still a problem: an empty name is never taken as 'no name'", () => {
    expect(codes([line({ name: "", noName: false })])).toEqual(["0:name:name-missing"]);
  });

  it("a value on a field that is switched off is kept and not checked", () => {
    expect(codes([line({ name: "Ali 99!", noName: true, number: "xx", noNumber: true })])).toEqual([]);
    const numberOnly: RosterSettings = { ...BOTH, prints: { name: false, number: true } };
    expect(codes([line({ name: "Ali 99!" })], numberOnly)).toEqual([]);
    const nameOnly: RosterSettings = { ...BOTH, prints: { name: true, number: false } };
    expect(codes([line({ number: "xx" }), line({ number: "xx" })], nameOnly)).toEqual([]);
  });
});

describe("numbers", () => {
  it.each([
    ["7a", "number-not-digits"],
    ["1 0", "number-not-digits"],
    ["-5", "number-not-digits"],
    ["１", "number-not-digits"],
    ["100", "number-too-long"],
    ["007", "number-too-long"],
    ["1٢", "number-mixed-digits"],
  ])("%s is %s", (number, code) => {
    expect(codes([line({ number })])).toEqual([`0:number:${code}`]);
  });

  it.each(["0", "00", "7", "07", "99", "٧", "۷", "٩٩", "۰"])("%s is fine", (number) => {
    expect(codes([line({ number })])).toEqual([]);
  });

  it("0 and 00 are the same number", () => {
    const result = checkRoster([line({ name: "A", number: "0" }), line({ name: "B", number: "00" })], BOTH);
    expect(result.problems.map((p) => [p.index, p.code])).toEqual([
      [0, "number-duplicate"],
      [1, "number-duplicate"],
    ]);
  });

  it("7, 07, Arabic-Indic and Extended Arabic-Indic seven are the same number, on every line involved", () => {
    const lines = [
      line({ id: "a", name: "A", number: "7" }),
      line({ id: "b", name: "B", number: "07" }),
      line({ id: "c", name: "C", number: "٧" }),
      line({ id: "d", name: "D", number: "۷" }),
      line({ id: "e", name: "E", number: "8" }),
    ];
    const { problems } = checkRoster(lines, BOTH);
    expect(problems.map((p) => [p.index, p.lineId, p.field, p.code])).toEqual([
      [0, "a", "number", "number-duplicate"],
      [1, "b", "number", "number-duplicate"],
      [2, "c", "number", "number-duplicate"],
      [3, "d", "number", "number-duplicate"],
    ]);
    expect(problems[0]!.detail).toEqual({
      value: 7,
      others: [
        { index: 1, id: "b", name: "B" },
        { index: 2, id: "c", name: "C" },
        { index: 3, id: "d", name: "D" },
      ],
    });
    expect(problems[3]!.detail?.others?.map((o) => o.name)).toEqual(["A", "B", "C"]);
  });

  it("an invalid number is never a duplicate of another invalid number", () => {
    expect(codes([line({ name: "A", number: "x" }), line({ name: "B", number: "x" })])).toEqual([
      "0:number:number-not-digits",
      "1:number:number-not-digits",
    ]);
  });

  it("a spare 'no number' line does not clash with a numbered one", () => {
    expect(codes([line({ name: "A", number: "7" }), line({ name: "B", number: "7", noNumber: true })])).toEqual([]);
  });

  it("mixed digit systems across lines are a note on the list, not a problem", () => {
    const { problems, notes } = checkRoster([line({ name: "A", number: "7" }), line({ name: "B", number: "٨" })], BOTH);
    expect(problems).toEqual([]);
    expect(notes).toEqual([{ code: "mixed-digit-systems", index: -1 }]);
  });
});

describe("names", () => {
  it.each([
    "Ali Raza",
    "Abdul-Rehman",
    "O'Brien",
    "O\u2019Brien",
    "J. R. Smith",
    "José Álvarez",
    "محمد علی",
    "ٹڈڑںےہھکگ",
    "مُحَمَّد",
    "کریم\u200Cالدین",
    "Ali علی",
  ])("%s is allowed", (name) => {
    expect(codes([line({ name })])).toEqual([]);
  });

  it.each([
    ["Ali 7", ["7"], true],
    ["Ali★", ["★"], false],
    ["Ali 😀", ["😀"], false],
    ["Али", ["А", "л", "и"], false],
    ["Ali_Raza", ["_"], false],
    ["Raza, Ali", [","], false],
    ["١٢٣", ["١", "٢", "٣"], true],
  ])("%s is refused for its characters", (name, characters, hasDigit) => {
    const { problems } = checkRoster([line({ name })], BOTH);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatchObject({ code: "name-character", field: "name", detail: { characters, hasDigit } });
  });

  it("is too long over 18 characters, and the limit is a setting", () => {
    const eighteen = "A".repeat(18);
    expect(codes([line({ name: eighteen })])).toEqual([]);
    expect(codes([line({ name: eighteen + "A" })])).toEqual(["0:name:name-too-long"]);
    expect(checkRoster([line({ name: eighteen + "A" })], BOTH).problems[0]!.detail).toEqual({ length: 19, max: 18 });
    expect(codes([line({ name: eighteen + "A" })], { ...BOTH, limits: { maxNameLength: 30 } })).toEqual([]);
    expect(codes([line({ name: "ABCDEF" })], { ...BOTH, limits: { maxNameLength: 5 } })).toEqual(["0:name:name-too-long"]);
  });

  it("marks do not count toward the length", () => {
    // 18 letters, each with a combining mark: still 18.
    expect(codes([line({ name: "á".repeat(18) })])).toEqual([]);
  });

  it("a name can be both too long and have a bad character: both are reported", () => {
    expect(codes([line({ name: "Abcdefghijklmnopqrs!" })])).toEqual(["0:name:name-character", "0:name:name-too-long"]);
  });

  it("two alphabets in one name is a note, not a problem", () => {
    const { problems, notes } = checkRoster([line({ name: "Ali علی" })], BOTH);
    expect(problems).toEqual([]);
    expect(notes).toEqual([{ code: "name-mixed-scripts", index: 0 }]);
  });
});

describe("sizes", () => {
  it("a size the product does not have is reported with the size as typed", () => {
    const { problems } = checkRoster([line({ size: "4XL" })], BOTH);
    expect(problems).toEqual([{ code: "size-unknown", index: 0, field: "size", detail: { size: "4XL" } }]);
  });

  it("the product's spellings are accepted by the check", () => {
    expect(codes([line({ size: "xxl" })])).toEqual([]);
  });

  it("a product with other sizes is checked against its own", () => {
    expect(codes([line({ size: "M" })], { ...BOTH, sizes: ["ONE SIZE"] })).toEqual(["0:size:size-unknown"]);
    expect(codes([line({ size: "ONE SIZE" })], { ...BOTH, sizes: ["ONE SIZE"] })).toEqual([]);
  });
});

describe("counts and the length of the list", () => {
  it.each([0, 11, -1, 1.5, Number.NaN])("a count of %s is outside 1 to 10", (count) => {
    expect(codes([line({ count })])).toEqual(["0:count:quantity-range"]);
  });

  it.each([1, 2, 10])("a count of %s is fine", (count) => {
    expect(codes([line({ count })])).toEqual([]);
  });

  it("the count range is a setting", () => {
    expect(codes([line({ count: 11 })], { ...BOTH, limits: { maxCount: 12 } })).toEqual([]);
  });

  it("more than 100 lines is a problem of the list", () => {
    const lines = Array.from({ length: 101 }, (_, i) => line({ name: "A", number: String(i % 100), size: "M" }));
    const { problems } = checkRoster(lines, { ...BOTH, prints: { name: false, number: false } });
    expect(problems).toEqual([{ code: "list-too-long", index: -1, field: "list", detail: { lines: 101, max: 100 } }]);
    expect(checkRoster(lines.slice(0, 100), { ...BOTH, prints: { name: false, number: false } }).problems).toEqual([]);
  });

  it("the line limit is a setting", () => {
    const lines = [line({ number: "1" }), line({ number: "2" }), line({ number: "3" })];
    expect(codes(lines, { ...BOTH, limits: { maxLines: 2 } })).toEqual(["-1:list:list-too-long"]);
  });

  it("limits that cannot work are refused", () => {
    expect(() => checkRoster([], { ...BOTH, limits: { maxNameLength: 0 } })).toThrow(RangeError);
    expect(() => checkRoster([], { ...BOTH, limits: { minCount: 5, maxCount: 2 } })).toThrow(RangeError);
  });
});

describe("one of each problem, with the line, the field and the code", () => {
  it("reports each on its own line", () => {
    const lines = [
      line({ name: "", number: "1" }), // 0 name missing
      line({ number: "" }), // 1 number missing
      line({ name: "Bilal", number: "3", size: "" }), // 2 size missing
      line({ name: "Usman", number: "4a" }), // 3 not digits
      line({ name: "Hamza", number: "123" }), // 4 too long
      line({ name: "Zain", number: "1٢" }), // 5 mixed digits
      line({ name: "Imran", number: "7" }), // 6 duplicate
      line({ name: "Ahmed", number: "07" }), // 7 duplicate
      line({ name: "Ali 2", number: "8" }), // 8 character
      line({ name: "Muhammad Abdul Rehman Qureshi", number: "9" }), // 9 too long
      line({ name: "Faisal", number: "11", size: "4XL" }), // 10 size unknown
      line({ name: "Kamran", number: "12", count: 11 }), // 11 count
    ];
    const got = checkRoster(lines, BOTH).problems.map((p) => `${p.index}:${p.field}:${p.code}`);
    expect(got).toEqual([
      "0:name:name-missing",
      "1:number:number-missing",
      "2:size:size-missing",
      "3:number:number-not-digits",
      "4:number:number-too-long",
      "5:number:number-mixed-digits",
      "6:number:number-duplicate",
      "7:number:number-duplicate",
      "8:name:name-character",
      "9:name:name-too-long",
      "10:size:size-unknown",
      "11:count:quantity-range",
    ]);
  });
});

describe("the summary (section 8)", () => {
  it("counts players, pieces, pieces per size, lines without a size and lines to fix", () => {
    const lines = [
      line({ name: "A", number: "1", size: "M", count: 2 }),
      line({ name: "B", number: "2", size: "M" }),
      line({ name: "C", number: "3", size: "XL" }),
      line({ name: "D", number: "4", size: "" }),
      line({ name: "E", number: "5", size: "4XL" }),
    ];
    const { summary } = analyzeRoster(lines, BOTH);
    expect(summary.players).toBe(5);
    expect(summary.pieces).toBe(6);
    expect(summary.bySize.map((s) => `${s.size}:${s.pieces}`)).toEqual(
      SIZES.map((size) => `${size}:${size === "M" ? 3 : size === "XL" ? 1 : 0}`),
    );
    expect(summary.otherSizes).toEqual([{ size: "4XL", pieces: 1 }]);
    expect(summary.linesWithoutSize).toBe(1);
    expect(summary.piecesWithoutSize).toBe(1);
    expect(summary.linesToFix).toBe(2);
    expect(summary.indexesToFix).toEqual([3, 4]);
    expect(summary.readyLines).toBe(3);
    expect(summary.minimum).toBeNull();
    expect(summary.readyForProof).toBe(false);
  });

  it("with a minimum: how many pieces are missing, counting spares and second shirts", () => {
    const lines = [line({ number: "1", count: 2 }), line({ name: "B", number: "2" }), line({ name: "C", number: "", noNumber: true })];
    const { summary } = analyzeRoster(lines, BOTH, { minimum: 10 });
    expect(summary.pieces).toBe(4);
    expect(summary.minimum).toEqual({ required: 10, missing: 6, met: false });
    expect(summary.readyForProof).toBe(false);
  });

  it("at or above the minimum nothing is missing and the list can go on", () => {
    const lines = Array.from({ length: 10 }, (_, i) => line({ name: `P${String.fromCharCode(65 + i)}`, number: String(i) }));
    const { summary } = analyzeRoster(lines, BOTH, { minimum: 10 });
    expect(summary.minimum).toEqual({ required: 10, missing: 0, met: true });
    expect(summary.readyForProof).toBe(true);
  });

  it("a minimum of 1 (Pakistan) is met by a single piece", () => {
    expect(analyzeRoster([line()], BOTH, { minimum: 1 }).summary.readyForProof).toBe(true);
  });

  it("a list with a list-level problem is not ready", () => {
    const summary = summarizeRoster([line()], BOTH, [{ code: "list-too-long", index: -1, field: "list" }]);
    expect(summary.readyForProof).toBe(false);
    expect(summary.linesToFix).toBe(0);
  });

  it("pieces of a line: its count, or 1 when the count is not a whole number of 1 or more", () => {
    expect(piecesOf({ count: 3 })).toBe(3);
    expect(piecesOf({ count: 0 })).toBe(1);
    expect(piecesOf({ count: 2.5 })).toBe(1);
  });
});

describe("normalising for storage", () => {
  it("trims, makes runs of spaces one, keeps the number as written, and uses the product's size spelling", () => {
    const out = normalizeLines(
      [{ id: "x", name: "  Ali \t  Raza ", number: " 07 ", size: " xxl ", count: 1, noName: false, noNumber: false }],
      BOTH,
    );
    expect(out).toEqual([{ id: "x", name: "Ali Raza", number: "07", size: "2XL", count: 1, noName: false, noNumber: false }]);
  });

  it("puts the name in NFC and drops direction marks, keeping the zero-width non-joiner", () => {
    const out = normalizeLines([line({ name: "é\u200F\u200E x\u200C" })], BOTH);
    expect(out[0]!.name).toBe("é x\u200C");
  });

  it("a size that is not the product's stays as typed (trimmed)", () => {
    expect(normalizeLines([line({ size: " 4xl " })], BOTH)[0]!.size).toBe("4xl");
  });

  it("does not shorten, capitalise or drop anything else", () => {
    const out = normalizeLines([line({ name: "muhammad abdul rehman qureshi" })], BOTH);
    expect(out[0]!.name).toBe("muhammad abdul rehman qureshi");
  });

  it("does not change the lines it is given", () => {
    const input = [line({ name: " A " })];
    normalizeLines(input, BOTH);
    expect(input[0]!.name).toBe(" A ");
  });
});
