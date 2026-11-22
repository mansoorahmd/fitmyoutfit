/**
 * Saving with the design on the device, and the interface to the host (08-team-list.md 11.1, 12): the list is kept in
 * the same record as the design, comes back after a reload, and everything the host gives is optional with data defaults.
 */
import { describe, expect, it } from "vitest";
import { resolveLimits } from "@fitmyoutfit/team-rules";
import { createDesign } from "../design/create.js";
import { DeviceDesignStore, createAutosave, createMemoryKeyValueStore } from "../storage/device-store.js";
import * as entry from "../index.js";
import { loadStandInJerseyProduct } from "../test/fixtures.js";
import { toSavedList } from "./checks.js";
import { readSavedList } from "./saved.js";
import { DEFAULT_TEAM_NOUN, DEFAULT_TEAM_SIZES, type EditorLine, type SavedTeamList, type TeamListHost } from "./types.js";

const product = loadStandInJerseyProduct();
const line = (id: string, name: string, number: string, size: string, extra: Partial<EditorLine> = {}): EditorLine => ({ id, name, number, size, count: 1, noName: false, noNumber: false, ...extra });
const settings = { prints: { name: true, number: true }, sizes: DEFAULT_TEAM_SIZES };

describe("the list kept with the design on the device", () => {
  const lines = [line("a", "Ali Raza", "10", "M"), line("b", "محمد علی", "٧", "XL", { count: 2 }), line("c", "", "5", "L", { noName: true })];
  it("is saved in the same record and comes back with the design", async () => {
    const store = new DeviceDesignStore(createMemoryKeyValueStore());
    const design = createDesign(product, { teamName: "LIONS" });
    const teamList = toSavedList(lines, product.id, settings);
    await store.saveDesign(product.id, design, { now: 1, teamList });
    const back = await store.loadDesign(product);
    expect(back?.teamList).toEqual(teamList);
    const restored = readSavedList(back?.teamList, { productId: product.id });
    expect(restored.map((l) => [l.id, l.name, l.number, l.size, l.count, l.noName])).toEqual([["a", "Ali Raza", "10", "M", 1, false], ["b", "محمد علی", "٧", "XL", 2, false], ["c", "", "5", "L", 1, true]]);
  });
  it("a design saved without a list comes back without one, and a list never leaks to another product", async () => {
    const store = new DeviceDesignStore(createMemoryKeyValueStore());
    await store.saveDesign(product.id, createDesign(product), { now: 1 });
    expect((await store.loadDesign(product))?.teamList).toBeUndefined();
    expect(readSavedList(toSavedList(lines, "other-product", settings), { productId: product.id })).toEqual([]);
  });
  it("goes through the autosave with the design: one save for a change to either", async () => {
    const store = new DeviceDesignStore(createMemoryKeyValueStore());
    let list: SavedTeamList | null = null;
    const states: string[] = [];
    const timers: Array<() => void> = [];
    const autosave = createAutosave({
      save: (design) => store.saveDesign(product.id, design, { teamList: list }),
      onState: (s) => states.push(s),
      setTimer: (fn) => (timers.push(fn), timers.length),
      clearTimer: () => undefined,
    });
    list = toSavedList(lines, product.id, settings);
    autosave.schedule(createDesign(product));
    await autosave.flush();
    expect(states.at(-1)).toBe("saved");
    expect((await store.loadDesign(product))?.teamList?.lines).toHaveLength(3);
  });
});

describe("what the host gives and gets", () => {
  it("everything is optional: the defaults are data (sizes YS to 3XL, a noun, the package's limits)", () => {
    const host: TeamListHost = {};
    expect(host).toEqual({});
    expect(DEFAULT_TEAM_SIZES.map((s) => s.code)).toEqual(["YS", "YM", "YL", "YXL", "XS", "S", "M", "L", "XL", "2XL", "3XL"]);
    expect(DEFAULT_TEAM_SIZES.filter((s) => s.group === "youth")).toHaveLength(4);
    expect(DEFAULT_TEAM_NOUN).toEqual({ one: "shirt", many: "shirts" });
    expect(resolveLimits()).toMatchObject({ maxLines: 100, minCount: 1, maxCount: 10, maxNameLength: 18 });
  });
  it("limits are the host's when it gives them, and none is a constant of the editor", () => {
    expect(resolveLimits({ maxLines: 40, maxCount: 4, maxNameLength: 12 })).toMatchObject({ maxLines: 40, minCount: 1, maxCount: 4, maxNameLength: 12 });
    const many = { version: 1, productId: product.id, lines: Array.from({ length: 41 }, (_, i) => ({ name: `P${i}` })) };
    expect(readSavedList(many, { productId: product.id, limits: { maxLines: 40 } })).toEqual([]);
    expect(readSavedList(many, { productId: product.id })).toHaveLength(41);
  });
  it("the types and defaults are exported from the package's entry point", () => {
    expect(entry.DEFAULT_TEAM_SIZES).toBe(DEFAULT_TEAM_SIZES);
    expect(entry.DEFAULT_TEAM_NOUN).toBe(DEFAULT_TEAM_NOUN);
    expect(typeof entry.readSavedList).toBe("function");
    expect(typeof entry.EditorShell).toBe("function");
  });
  it("the list handed to the host is the filled lines in order with what the design prints and the product's id", () => {
    const saved = toSavedList([line("a", "A", "1", "M"), line("e", "", "", ""), line("b", "B", "2", "L")], product.id, { prints: { name: true, number: false }, sizes: DEFAULT_TEAM_SIZES });
    expect(saved).toMatchObject({ version: 1, productId: product.id, prints: { name: true, number: false } });
    expect(saved.lines.map((l) => l.id)).toEqual(["a", "b"]);
  });
});
