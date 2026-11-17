/** E3e (QA 17, R39 finished): a phone panel ends on a whole row, or fades; no input is half covered. */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { EDITOR_CSS } from "./styles";
import { SNAP_GROW_MAX, snapDelta } from "./finish";

describe("snapDelta: the panel's resting height", () => {
  it("nothing across the foot: no change", () => {
    expect(snapDelta(160, [{ top: 0, bottom: 60 }, { top: 70, bottom: 150 }])).toBe(0);
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
    expect(snapDelta(150, [{ top: 100, bottom: 240 }])).toBe(0);
    // The same row with the foot at 190: showing it whole costs 62.
    expect(snapDelta(190, [{ top: 100, bottom: 240 }])).toBe(62);
    // A smaller cut-off of a row starting low: ends above it.
    expect(snapDelta(160, [{ top: 130, bottom: 235 }])).toBe(-(160 - 130 + 12));
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
    expect(src).toContain("snapDelta(cut, rowBoxes(b))");
  });
  it("the foot's fade is 28 px", () => {
    expect(EDITOR_CSS).toMatch(/data-more-below="true"\]\s*\{[^}]*linear-gradient\(to top, transparent 0, #000 28px\)/);
  });
});
