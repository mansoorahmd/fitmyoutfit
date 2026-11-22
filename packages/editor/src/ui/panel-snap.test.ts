/** E3e (QA 17, R39 finished): a phone panel ends on a whole row, or fades; no input is half covered. */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { EDITOR_CSS } from "./styles";
import { SNAP_GROW_MAX, snapDelta } from "./finish";

describe("snapDelta: the panel's resting height", () => {
  it("nothing across the foot: no change", () => {
    // (E3g: the last row ends 30 px above the foot, clear of the foot's 16 px fade.)
    expect(snapDelta(160, [{ top: 0, bottom: 60 }, { top: 70, bottom: 140 }])).toBe(0);
  });
  it("an input cut across its middle: the panel grows to show the whole row, with air under it", () => {
    // A label and input group 80 px tall from 120 to 200; the foot is at 162.
    expect(snapDelta(162, [{ top: 120, bottom: 200 }, { top: 150, bottom: 198 }])).toBe(200 - 162 + 12);
  });
  it("the largest part across the foot is the row (the field, not its input)", () => {
    expect(snapDelta(170, [{ top: 150, bottom: 198 }, { top: 110, bottom: 200 }])).toBe(200 - 170 + 12);
  });
  it("a row too far over the foot to be worth showing whole: the panel ends above it", () => {
    // 140 px tall from 100 to 240, foot at 150: showing it whole costs 102 (over 72); ending above it gives up 62 of 150 (over 40%): the fade stays.
    expect(snapDelta(100, [{ top: 35, bottom: 175 }])).toBe(0);
    // The same kind of row with more body above it: the foot ends at its top.
    expect(snapDelta(150, [{ top: 100, bottom: 240 }])).toBe(-50);
    // The same row with the foot at 190: showing it whole costs 62.
    expect(snapDelta(190, [{ top: 100, bottom: 240 }])).toBe(62);
    // A smaller cut-off of a row starting low: ends above it.
    expect(snapDelta(160, [{ top: 130, bottom: 235 }])).toBe(-(160 - 130));
  });
  it("E3g: a whole row inside the foot's 16 px fade looks cut: the panel grows to give it air; clear of the fade it is left alone", () => {
    // A swatch row 52 px tall from 724 to 776, the foot at 780: 4 px of air, under the fade.
    expect(snapDelta(780, [{ top: 724, bottom: 776 }])).toBe(776 - 780 + 16);
    // 16 px of air or more: nothing to do.
    expect(snapDelta(780, [{ top: 700, bottom: 760 }])).toBe(0);
    // With no room to grow (a small phone) the panel ends above it instead when that is cheap, else it stays.
    expect(snapDelta(780, [{ top: 724, bottom: 776 }], { growMax: 0 })).toBe(-(780 - 724));
    expect(snapDelta(100, [{ top: 50, bottom: 98 }], { growMax: 0 })).toBe(0);
  });
  it("lists and slivers are not rows: taller than 140 px or shorter than 20 px", () => {
    expect(snapDelta(160, [{ top: 20, bottom: 400 }, { top: 158, bottom: 170 }])).toBe(0);
  });
  it("never grows by more than the limit", () => {
    for (const bottom of [180, 220, 260]) expect(snapDelta(120, [{ top: 100, bottom }])).toBeLessThanOrEqual(SNAP_GROW_MAX);
  });
});

describe("the panel uses it, and fades when it did not end on a row", () => {
  it("the compact panel's height follows the snap, at both resting heights", () => {
    const src = readFileSync(new URL("./ToolPanel.tsx", import.meta.url), "utf8");
    expect(src).toContain("heights.normal + snap");
    expect(src).toContain("heights.expanded + snap");
    expect(src).toContain("snapDelta(cut, rowBoxes(b),");
  });
  it("the foot's fade is 16 px (E3g: it was 28)", () => {
    expect(EDITOR_CSS).toMatch(/data-more-below="true"\]\s*\{[^}]*linear-gradient\(to top, transparent 0, #000 16px\)/);
  });
});

describe("the room a panel has to grow (E3e)", () => {
  it("a 360 x 640 phone keeps its stage as it is: no growth; a tall phone may grow by the most", async () => {
    const { panelGrowRoom } = await import("./layout");
    expect(panelGrowRoom(640).normal).toBe(0);
    expect(panelGrowRoom(844).normal).toBeGreaterThanOrEqual(SNAP_GROW_MAX);
  });
  it("the panel asks for it", () => {
    const src = readFileSync(new URL("./ToolPanel.tsx", import.meta.url), "utf8");
    expect(src).toContain("growMax: Math.min(SNAP_GROW_MAX, room)");
  });
});
