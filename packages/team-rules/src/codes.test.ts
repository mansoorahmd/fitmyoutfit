import { describe, expect, it } from "vitest";
import { checkRoster } from "./check.js";
import { NOTE_CODES, PROBLEM_CODES, type NoteCode, type ProblemCode, type RosterLine, type RosterSettings } from "./types.js";

// Compile-time: the lists and the types are the same set. A code added to one and not the other fails typecheck here.
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : never) : never;
const problemTypeMatches: Same<ProblemCode, (typeof PROBLEM_CODES)[number]> = true;
const noteTypeMatches: Same<NoteCode, (typeof NOTE_CODES)[number]> = true;

const SIZES = ["YS", "YM", "YL", "YXL", "XS", "S", "M", "L", "XL", "2XL", "3XL"];
const line = (partial: Partial<RosterLine> = {}): RosterLine => ({ name: "Ali Raza", number: "10", size: "M", count: 1, noName: false, noNumber: false, ...partial });

describe("the runtime lists of codes", () => {
  it("have no repeats and read as codes", () => {
    expect(problemTypeMatches && noteTypeMatches).toBe(true);
    expect(new Set(PROBLEM_CODES).size).toBe(PROBLEM_CODES.length);
    expect(new Set(NOTE_CODES).size).toBe(NOTE_CODES.length);
    for (const code of [...PROBLEM_CODES, ...NOTE_CODES]) expect(code).toMatch(/^[a-z]+(-[a-z]+)*$/);
  });

  it("are exactly what the checks return: a list made to produce every code returns each listed code and no other", () => {
    const settings: RosterSettings = {
      prints: { name: true, number: true },
      sizes: SIZES,
      limits: { maxLines: 12 },
      taken: [
        { number: "41", source: "first-order" },
        { number: "42", source: "add-on" },
      ],
    };
    const lines: RosterLine[] = [
      line({ name: "", number: "", size: "" }), // the three missing values
      line({ name: "A", number: "a" }), // not digits
      line({ name: "B", number: "100" }), // too long
      line({ name: "C", number: "1٢" }), // mixed digits
      line({ name: "D", number: "7" }),
      line({ name: "E", number: "07" }), // duplicate
      line({ name: "F", number: "41" }), // taken in the first order
      line({ name: "G", number: "42" }), // taken by an add-on
      line({ name: "Ali ★", number: "8" }), // a character that cannot print
      line({ name: "Muhammad Abdul Rehman Qureshi", number: "9" }), // too long
      line({ name: "H", number: "11", size: "4XL" }), // unknown size
      line({ name: "I", number: "12", count: 11 }), // quantity out of range
      line({ name: "Ali علي", number: "13" }), // two alphabets (a note)
      line({ name: "J", number: "٣" }), // Arabic digits with Western ones elsewhere (a note)
    ];
    const { problems, notes } = checkRoster(lines, settings);
    expect(new Set(problems.map((p) => p.code))).toEqual(new Set(PROBLEM_CODES));
    expect(new Set(notes.map((n) => n.code))).toEqual(new Set(NOTE_CODES));
  });
});
