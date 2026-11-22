/** The player chip's state (08-team-list.md 7.2, 7.3): stepping, the ends, the sample, the states a line can be in. */
import { describe, expect, it } from "vitest";
import { chipState, stepTarget, type ChipInput } from "./chip.js";
import { newLine } from "./lines.js";
import type { EditorLine } from "./types.js";

const line = (id: string, name: string, number: string, extra: Partial<EditorLine> = {}): EditorLine => ({ ...newLine(id), name, number, size: "M", ...extra });
const input = (lines: EditorLine[], chosenId: string | null, over: Partial<ChipInput> = {}): ChipInput => ({ lines, chosenId, toFix: [], prints: { name: true, number: true }, sample: { name: "PLAYER", number: "10" }, capitals: true, ...over });
const five = ["Ali Raza", "Bilal Ahmed", "Usman Tariq", "Hamza", "Imran Khan"].map((n, i) => line(`p${i}`, n, String(i + 1)));

describe("stepping through the team in list order", () => {
  it("knows the line before and the line after, none at the ends (they do not wrap)", () => {
    expect(chipState(input(five, "p0"))).toMatchObject({ index: 0, total: 5, prevId: null, nextId: "p1" });
    expect(chipState(input(five, "p2"))).toMatchObject({ index: 2, prevId: "p1", nextId: "p3" });
    expect(chipState(input(five, "p4"))).toMatchObject({ index: 4, prevId: "p3", nextId: null });
  });
  it("five forward and two back from the first line lands on the fourth", () => {
    let at = "p0";
    const steps: number[] = [];
    for (let i = 0; i < 4; i++) {
      const next = stepTarget(chipState(input(five, at)), 1);
      if (next) at = next;
      steps.push(Number(at.slice(1)));
    }
    // the fifth step forward is not possible from the last line: it does nothing
    expect(stepTarget(chipState(input(five, at)), 1)).toBeNull();
    for (let i = 0; i < 2; i++) at = stepTarget(chipState(input(five, at)), -1) ?? at;
    expect(steps).toEqual([1, 2, 3, 4]);
    expect(at).toBe("p2");
  });
  it("with one line both ends are inactive", () => {
    const s = chipState(input([five[0]!], "p0"));
    expect(s.prevId).toBeNull();
    expect(s.nextId).toBeNull();
    expect(s.total).toBe(1);
  });
  it("a chosen id that is no longer in the list falls back to the first line (only an empty list has no chosen line)", () => {
    expect(chipState(input(five, "gone")).index).toBe(0);
    expect(chipState(input(five, null)).line?.id).toBe("p0");
  });
});

describe("the states the chip shows", () => {
  it("shows the sample player, labelled as the sample, with both ends inactive, when the list is empty", () => {
    const s = chipState(input([], null));
    expect(s).toMatchObject({ kind: "sample", total: 0, prevId: null, nextId: null, name: "PLAYER", number: "10" });
  });
  it("draws the name in capitals (the Latin letters only) when the design says so, and as typed otherwise", () => {
    expect(chipState(input([line("a", "Ali Raza", "10")], "a")).name).toBe("ALI RAZA");
    expect(chipState(input([line("a", "Ali Raza", "10")], "a", { capitals: false })).name).toBe("Ali Raza");
    expect(chipState(input([line("a", "محمد علی", "٧")], "a"))).toMatchObject({ name: "محمد علی", number: "٧" });
    expect(chipState(input([line("a", "Ali محمد", "7")], "a")).name).toBe("ALI محمد");
  });
  it("a spare shirt has no name and keeps its number: '10 · No name'", () => {
    const s = chipState(input([line("a", "Ali", "10", { noName: true })], "a"));
    expect(s).toMatchObject({ spare: true, name: "", number: "10" });
  });
  it("a count of 2 shows, and a line with a problem is marked", () => {
    const s = chipState(input([line("a", "Ali", "10", { count: 2 })], "a", { toFix: ["a"] }));
    expect(s).toMatchObject({ count: 2, problem: true });
    expect(chipState(input([line("a", "Ali", "10")], "a")).problem).toBe(false);
  });
  it("a design without numbers shows no number, and a line with no number on purpose shows none", () => {
    expect(chipState(input(five, "p0", { prints: { name: true, number: false } })).number).toBe("");
    expect(chipState(input([line("a", "Ali", "10", { noNumber: true })], "a")).number).toBe("");
  });
});
