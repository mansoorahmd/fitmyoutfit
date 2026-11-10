import { describe, expect, it } from "vitest";
import { DEFAULT_JERSEY_NUMBER_RULES, WESTERN_DIGITS } from "./jersey-number-rules.js";
import {
  checkJerseyNumber,
  checkJerseyNumberRules,
  findDuplicateJerseyNumbers,
  isSameJerseyNumber,
  isValidJerseyNumber,
  jerseyNumberMaxLength,
  jerseyNumberValue,
} from "./jersey-number.js";
import type { JerseyNumberRules } from "./jersey-number-rules.js";
import * as designEntry from "./index.js";

/** The error message of a number that must be invalid. */
function errorOf(input: unknown, rules?: JerseyNumberRules): string {
  const result = checkJerseyNumber(input, rules);
  if (result.ok) throw new Error(`expected ${JSON.stringify(input)} to be invalid`);
  return result.error;
}

describe("the default rules are data", () => {
  it("hold the founders' decision: maximum 99 and three digit systems", () => {
    expect(DEFAULT_JERSEY_NUMBER_RULES.maxValue).toBe(99);
    expect(DEFAULT_JERSEY_NUMBER_RULES.digitSystems.map((s) => [s.id, s.zero])).toEqual([
      ["western", 0x30],
      ["arabic-indic", 0x660],
      ["extended-arabic-indic", 0x6f0],
    ]);
    expect(jerseyNumberMaxLength()).toBe(2);
  });

  it("are usable, and the functions are exported from the design entry", () => {
    expect(checkJerseyNumberRules(DEFAULT_JERSEY_NUMBER_RULES)).toBeNull();
    for (const name of [
      "checkJerseyNumber",
      "isValidJerseyNumber",
      "jerseyNumberValue",
      "isSameJerseyNumber",
      "findDuplicateJerseyNumbers",
      "DEFAULT_JERSEY_NUMBER_RULES",
    ]) {
      expect(typeof (designEntry as Record<string, unknown>)[name]).not.toBe("undefined");
    }
  });
});

describe("valid jersey numbers", () => {
  it.each([
    ["0", 0, "western"],
    ["7", 7, "western"],
    ["07", 7, "western"],
    ["00", 0, "western"],
    ["99", 99, "western"],
    ["٧", 7, "arabic-indic"],
    ["٠٧", 7, "arabic-indic"],
    ["٩٩", 99, "arabic-indic"],
    ["۷", 7, "extended-arabic-indic"],
    ["۹۹", 99, "extended-arabic-indic"],
  ])("%s is valid: value %i, %s digits", (input, value, digitSystem) => {
    expect(checkJerseyNumber(input)).toEqual({ ok: true, value, digitSystem });
    expect(isValidJerseyNumber(input)).toBe(true);
  });
});

describe("invalid jersey numbers, each with its reason", () => {
  it("empty", () => {
    expect(errorOf("")).toBe("is empty; a jersey number needs at least one digit");
  });

  it('does not trim: " 7" and "7 " contain characters that are not digits', () => {
    for (const input of [" 7", "7 ", "7 7", "\t7", "7\n"]) {
      const message = errorOf(input);
      expect(message).toContain("contains characters that are not digits");
      expect(message).toContain("spaces are not allowed and are not trimmed");
    }
    expect(errorOf(" 7")).toBe(
      '" 7" contains characters that are not digits (spaces are not allowed and are not trimmed); use only digits from: Western (0-9), Arabic-Indic (٠-٩), Extended Arabic-Indic (۰-۹)',
    );
  });

  it('"100" has more than 2 digits', () => {
    expect(errorOf("100")).toBe('"100" has more than 2 digits (the largest jersey number is 99; leading zeros count)');
  });

  it('"007" is too long even though its value is 7', () => {
    expect(errorOf("007")).toContain('"007" has more than 2 digits');
    expect(errorOf("٠٠٧")).toContain("has more than 2 digits");
  });

  it('"1٢" mixes two digit systems', () => {
    expect(errorOf("1٢")).toBe('"1٢" mixes two digit systems (Western (0-9) and Arabic-Indic (٠-٩)); use one system only');
  });

  it('"٧۷" mixes the two Arabic digit systems', () => {
    expect(errorOf("٧۷")).toBe(
      '"٧۷" mixes two digit systems (Arabic-Indic (٠-٩) and Extended Arabic-Indic (۰-۹)); use one system only',
    );
  });

  it.each(["-1", "+1", "1.5", "1,5", "7a", "٧a", "a7", "1e1", "0x7"])("%s contains characters that are not digits", (input) => {
    expect(errorOf(input)).toContain("contains characters that are not digits");
  });

  it("full-width digits are not digits here", () => {
    expect(errorOf("７")).toContain("contains characters that are not digits");
    expect(errorOf("１２")).toContain("contains characters that are not digits");
  });

  it("other scripts' digits and a lone emoji are not digits here", () => {
    expect(errorOf("७")).toContain("contains characters that are not digits"); // Devanagari
    expect(errorOf("7️⃣")).toContain("contains characters that are not digits"); // keycap sequence
  });

  it.each([
    [7, "a number"],
    [null, "null"],
    [undefined, "undefined"],
    [["7"], "an array"],
    [{}, "an object"],
    [true, "a boolean"],
  ])("non-string input %j is reported, not thrown", (input, got) => {
    expect(errorOf(input)).toBe(`must be a string of digits, got ${got}`);
    expect(isValidJerseyNumber(input)).toBe(false);
    expect(jerseyNumberValue(input)).toBeNull();
  });

  it("a very long string is rejected with a short message", () => {
    const message = errorOf("9".repeat(5000));
    expect(message).toContain("has more than 2 digits");
    expect(message.length).toBeLessThan(200);
  });
});

describe("the numeric value", () => {
  it("ignores leading zeros and the digit system", () => {
    expect(jerseyNumberValue("07")).toBe(7);
    expect(jerseyNumberValue("٠٧")).toBe(7);
    expect(jerseyNumberValue("۹۹")).toBe(99);
    expect(jerseyNumberValue("0")).toBe(0);
    expect(jerseyNumberValue("00")).toBe(0);
  });

  it("is null for an invalid number", () => {
    expect(jerseyNumberValue("100")).toBeNull();
    expect(jerseyNumberValue("")).toBeNull();
  });
});

describe("same number", () => {
  const sevens = ["7", "07", "٧", "٠٧", "۷", "۰۷"];

  it('"7", "07", "٧" and "۷" are all the same number', () => {
    for (const a of sevens) for (const b of sevens) expect(isSameJerseyNumber(a, b)).toBe(true);
  });

  it('"7" and "70" differ, and so do "7" and "17"', () => {
    expect(isSameJerseyNumber("7", "70")).toBe(false);
    expect(isSameJerseyNumber("٧", "۷۰")).toBe(false);
    expect(isSameJerseyNumber("7", "17")).toBe(false);
  });

  it("zero in any form is the same number", () => {
    expect(isSameJerseyNumber("0", "00")).toBe(true);
    expect(isSameJerseyNumber("٠", "۰")).toBe(true);
  });

  it("an invalid entry is the same as nothing, not even itself", () => {
    expect(isSameJerseyNumber("100", "100")).toBe(false);
    expect(isSameJerseyNumber("7", "7a")).toBe(false);
    expect(isSameJerseyNumber(7, 7)).toBe(false);
  });
});

describe("finding duplicates in a list", () => {
  it("returns nothing for a list with no clashes", () => {
    expect(findDuplicateJerseyNumbers(["1", "2", "10", "٣"])).toEqual({ duplicates: [], invalid: [] });
    expect(findDuplicateJerseyNumbers([])).toEqual({ duplicates: [], invalid: [] });
  });

  it("groups entries by value across digit systems and leading zeros, with their positions", () => {
    const report = findDuplicateJerseyNumbers(["7", "10", "07", "٧", "۱۰", "3", "۷"]);
    expect(report.invalid).toEqual([]);
    expect(report.duplicates).toEqual([
      { value: 7, indexes: [0, 2, 3, 6], numbers: ["7", "07", "٧", "۷"] },
      { value: 10, indexes: [1, 4], numbers: ["10", "۱۰"] },
    ]);
  });

  it("sorts groups by value, not by first appearance", () => {
    const report = findDuplicateJerseyNumbers(["20", "5", "5", "20"]);
    expect(report.duplicates.map((d) => d.value)).toEqual([5, 20]);
  });

  it("does not crash on invalid entries: they are listed in `invalid` and never matched", () => {
    const list = ["7", "100", "100", "x", "٧", null, 7, "", "07"];
    const report = findDuplicateJerseyNumbers(list);
    expect(report.duplicates).toEqual([{ value: 7, indexes: [0, 4, 8], numbers: ["7", "٧", "07"] }]);
    expect(report.invalid.map((i) => i.index)).toEqual([1, 2, 3, 5, 6, 7]);
    expect(report.invalid[0]).toMatchObject({ index: 1, entry: "100" });
    expect(report.invalid[0]!.error).toContain("has more than 2 digits");
    expect(report.invalid[3]).toMatchObject({ index: 5, entry: null, error: "must be a string of digits, got null" });
  });

  it("two identical invalid strings are two invalid entries, not a duplicate", () => {
    const report = findDuplicateJerseyNumbers(["100", "100"]);
    expect(report.duplicates).toEqual([]);
    expect(report.invalid).toHaveLength(2);
  });

  it("refuses something that is not a list", () => {
    expect(() => findDuplicateJerseyNumbers("7" as never)).toThrow(TypeError);
  });
});

describe("the rules are data: other rules change the behaviour, not the code", () => {
  const three: JerseyNumberRules = { ...DEFAULT_JERSEY_NUMBER_RULES, maxValue: 999 };
  const nine: JerseyNumberRules = { ...DEFAULT_JERSEY_NUMBER_RULES, maxValue: 9 };
  const westernOnly: JerseyNumberRules = { maxValue: 99, digitSystems: [WESTERN_DIGITS] };

  it('with a maximum of 999, "100" and "007" are valid', () => {
    expect(checkJerseyNumber("100", three)).toMatchObject({ ok: true, value: 100 });
    expect(checkJerseyNumber("007", three)).toMatchObject({ ok: true, value: 7 });
    expect(jerseyNumberMaxLength(three)).toBe(3);
    expect(checkJerseyNumber("1000", three)).toMatchObject({ ok: false });
    expect(errorOf("1000", three)).toContain("has more than 3 digits");
  });

  it('with a maximum of 9, "10" is invalid and the message says one digit', () => {
    expect(errorOf("10", nine)).toBe('"10" has more than 1 digit (the largest jersey number is 9; leading zeros count)');
    expect(checkJerseyNumber("9", nine)).toMatchObject({ ok: true, value: 9 });
  });

  it("a maximum that is not all nines checks the value too", () => {
    const fifty: JerseyNumberRules = { ...DEFAULT_JERSEY_NUMBER_RULES, maxValue: 50 };
    expect(checkJerseyNumber("50", fifty)).toMatchObject({ ok: true });
    expect(errorOf("51", fifty)).toBe('"51" is larger than 50, the largest jersey number');
  });

  it('with only the Western system allowed, "٧" is invalid and the message says why', () => {
    expect(errorOf("٧", westernOnly)).toBe(
      '"٧" uses Arabic-Indic (٠-٩) digits, which are not allowed; allowed: Western (0-9)',
    );
    expect(checkJerseyNumber("7", westernOnly)).toMatchObject({ ok: true });
  });

  it("mixing is still reported as mixing when only one of the systems is allowed", () => {
    expect(errorOf("1٢", westernOnly)).toContain("mixes two digit systems");
  });

  it("the same rules apply to every function", () => {
    expect(isSameJerseyNumber("100", "١٠٠", three)).toBe(true);
    expect(jerseyNumberValue("007", three)).toBe(7);
    expect(findDuplicateJerseyNumbers(["100", "007", "7"], three).duplicates).toEqual([
      { value: 7, indexes: [1, 2], numbers: ["007", "7"] },
    ]);
    expect(findDuplicateJerseyNumbers(["٧", "7"], westernOnly)).toMatchObject({ duplicates: [], invalid: [{ index: 0 }] });
  });

  it("a maximum of 0 allows only zero", () => {
    const zero: JerseyNumberRules = { ...DEFAULT_JERSEY_NUMBER_RULES, maxValue: 0 };
    expect(checkJerseyNumber("0", zero)).toMatchObject({ ok: true });
    expect(checkJerseyNumber("1", zero)).toMatchObject({ ok: false });
  });

  it("the default rules are not changed by using other rules", () => {
    checkJerseyNumber("1", three);
    expect(DEFAULT_JERSEY_NUMBER_RULES.maxValue).toBe(99);
    expect(Object.isFrozen(DEFAULT_JERSEY_NUMBER_RULES)).toBe(true);
  });

  it("unusable rules are refused with a clear message, not used silently", () => {
    const bad: unknown[] = [
      null,
      {},
      { maxValue: -1, digitSystems: [WESTERN_DIGITS] },
      { maxValue: 1.5, digitSystems: [WESTERN_DIGITS] },
      { maxValue: "99", digitSystems: [WESTERN_DIGITS] },
      { maxValue: 99, digitSystems: [] },
      { maxValue: 99, digitSystems: [{ id: "x", name: "x" }] },
      { maxValue: 99, digitSystems: [WESTERN_DIGITS, WESTERN_DIGITS] },
      { maxValue: 99, digitSystems: [WESTERN_DIGITS, { id: "overlap", name: "overlap", zero: 0x35 }] },
    ];
    for (const rules of bad) {
      expect(checkJerseyNumberRules(rules)).toEqual(expect.any(String));
      expect(() => checkJerseyNumber("7", rules as JerseyNumberRules)).toThrow(RangeError);
    }
  });
});
