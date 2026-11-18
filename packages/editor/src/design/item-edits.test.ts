import { describe, expect, it } from "vitest";
import { loadStandInJerseyProduct } from "../test/fixtures";
import { createDesign } from "./create";
import { addLayer } from "./edit";
import { addCatalogFont } from "./font-catalog";
import { DUPLICATE_OFFSET_MM, NUDGE_MM, bringForward, canDuplicate, centreLayer, duplicateLayer, duplicatePlace, nudgeLayer, stoppedByArea, rotateLayerBy, rotateLayerTo, scaleLayerBy, sendBack } from "./item-edits";
import { newLogoLayer, newTextLayer } from "./new-layers";
import { clampIntoArea, layerBounds, printAreaOf } from "./print-area";
import { loadPlaceholderFonts } from "../test/fixtures";
import type { DesignDocument } from "./schema";

const product = loadStandInJerseyProduct();
const fonts = loadPlaceholderFonts();
const opts = { product };
const front = printAreaOf(product.pieces.find((p) => p.id === "front")!);

function design(): DesignDocument {
  let d = createDesign(product, { teamName: "TIGERS" });
  const font = fonts.fonts.find((f) => f.uses.includes("text"))!;
  d = addCatalogFont(d, fonts, font.id);
  d = addLayer(d, newLogoLayer(product, { id: "logo-1", preset: "left-chest", role: "crest", asset: { assetId: "a1", mediaType: "image/png", width: 800, height: 800 } }), opts);
  d = addLayer(d, newTextLayer(product, { id: "text-1", preset: "lower-back", value: "SINCE 1990", fontId: font.id, fill: d.teamColors.second }), opts);
  return d;
}
const get = (d: DesignDocument, id: string) => d.layers.find((l) => l.id === id)!;

describe("fine-tune and keyboard edits", () => {
  it("nudges by millimetres and stops at the print area", () => {
    const d = design();
    const before = get(d, "logo-1").position;
    const moved = get(nudgeLayer(d, "logo-1", 2, -2, opts), "logo-1").position;
    expect(moved).toEqual({ x: before.x + 2, y: before.y - 2 });
    const far = get(nudgeLayer(d, "logo-1", 500, 0, opts), "logo-1");
    expect(layerBounds(far).x + layerBounds(far).width).toBeCloseTo(front.x + front.width, 3);
  });

  it("sizes in 10% steps, keeping proportions, and never past the print area", () => {
    const d = design();
    const L = get(d, "logo-1");
    const bigger = get(scaleLayerBy(d, "logo-1", 1.1, opts), "logo-1");
    expect(bigger.size.width).toBeCloseTo(L.size.width * 1.1, 2);
    expect(bigger.size.width / bigger.size.height).toBeCloseTo(L.size.width / L.size.height, 3);
    let huge = d;
    for (let k = 0; k < 40; k++) huge = scaleLayerBy(huge, "logo-1", 1.1, opts);
    const b = layerBounds(get(huge, "logo-1"));
    expect(b.width).toBeLessThanOrEqual(front.width + 1e-6);
    expect(b.height).toBeLessThanOrEqual(front.height + 1e-6);
    expect(b.x).toBeGreaterThanOrEqual(front.x - 1e-6);
    const smaller = get(scaleLayerBy(d, "logo-1", 1 / 1.1, opts), "logo-1");
    expect(smaller.size.width).toBeCloseTo(L.size.width / 1.1, 2);
  });

  it("turns in steps, straightens, and centres on the shirt", () => {
    const d = design();
    const turned = rotateLayerBy(rotateLayerBy(d, "logo-1", 15, opts), "logo-1", 15, opts);
    expect(get(turned, "logo-1").rotation).toBe(30);
    expect(get(rotateLayerBy(d, "logo-1", -15, opts), "logo-1").rotation).toBe(-15);
    expect(get(rotateLayerTo(turned, "logo-1", 0, opts), "logo-1").rotation).toBe(0);
    const centred = get(centreLayer(d, "logo-1", opts), "logo-1");
    expect(centred.position.x).toBe(front.x + front.width / 2);
    expect(centred.position.y).toBe(get(d, "logo-1").position.y);
  });

  it("duplicates logos and free text just above the original, a little offset; not names or numbers", () => {
    const d = design();
    expect(canDuplicate(get(d, "logo-1"))).toBe(true);
    expect(canDuplicate(get(d, "text-1"))).toBe(true);
    const team = d.layers.find((l) => l.role === "team-name");
    if (team) {
      expect(canDuplicate(team)).toBe(false);
      expect(() => duplicateLayer(d, team.id, opts)).toThrow();
    }
    const { design: copied, id } = duplicateLayer(d, "logo-1", opts);
    expect(copied.layers).toHaveLength(d.layers.length + 1);
    const k = copied.layers.findIndex((l) => l.id === "logo-1");
    expect(copied.layers[k + 1]!.id).toBe(id);
    const copy = get(copied, id);
    // Offset from the original (down and right, or to the side with more room when the right side is short of it).
    expect(copy.position.x).not.toBe(get(d, "logo-1").position.x);
    expect(copy.position.y).toBeGreaterThan(get(d, "logo-1").position.y);
    expect(copy.preset).toBeUndefined();
  });

  it("brings forward and sends back one place; unchanged at the ends", () => {
    const d = design();
    const ids = d.layers.map((l) => l.id);
    const top = ids[ids.length - 1]!;
    const bottom = ids[0]!;
    expect(bringForward(d, top)).toBe(d);
    expect(sendBack(d, bottom)).toBe(d);
    const forward = bringForward(d, bottom).layers.map((l) => l.id);
    expect(forward[1]).toBe(bottom);
    expect(sendBack(bringForward(d, bottom), bottom).layers.map((l) => l.id)).toEqual(ids);
  });
});

describe("a duplicate can still be moved (E3e, QA 17 B3)", () => {
  const back = printAreaOf(product.pieces.find((p) => p.id === "back")!);
  /** A text nearly as wide as its print area (300 of 318 mm), turned up from the preset's place. */
  function wide(x: number) {
    const font = fonts.fonts.find((f) => f.uses.includes("text"))!;
    let d = addCatalogFont(createDesign(product, { teamName: "TIGERS" }), fonts, font.id);
    d = addLayer(d, { ...newTextLayer(product, { id: "text-1", pieceId: "back", value: "LAHORE LIONS FOR EVER", fontId: font.id, fill: d.teamColors.second }), size: { width: 300, height: 40 }, position: { x, y: 300 } }, opts);
    return d;
  }
  const room = (d: DesignDocument, id: string) => {
    const l = get(d, id);
    const lo = clampIntoArea(back, l, { x: -1e6, y: -1e6 });
    const hi = clampIntoArea(back, l, { x: 1e6, y: 1e6 });
    return { left: l.position.x - lo.x, right: hi.x - l.position.x, up: l.position.y - lo.y, down: hi.y - l.position.y };
  };

  it("a text 300 mm wide: the copy keeps room to move to the right and to the left, and the old offset is kept where it fits", () => {
    const d = wide(back.x + back.width / 2 - 3);
    const original = room(d, "text-1");
    expect(original.left).toBeGreaterThan(1);
    expect(original.right).toBeGreaterThan(1);
    const { design: copied, id } = duplicateLayer(d, "text-1", opts);
    const copy = room(copied, id);
    // Every direction the original could move, the copy can: at least one fine-tune step each way.
    expect(copy.left).toBeGreaterThanOrEqual(NUDGE_MM - 1e-6);
    expect(copy.right).toBeGreaterThanOrEqual(NUDGE_MM - 1e-6);
    // The arrow moves it (the case QA found: it stood on the limit and the right arrow did nothing).
    const right = get(nudgeLayer(copied, id, 1, 0, opts), id).position.x;
    expect(right).toBeCloseTo(get(copied, id).position.x + 1, 6);
    // Vertically there was plenty of room: the usual offset down.
    expect(get(copied, id).position.y).toBeCloseTo(300 + DUPLICATE_OFFSET_MM, 6);
  });

  it("an offset towards the side with more room: near the right limit the copy goes left", () => {
    const area = back;
    const d = wide(area.x + area.width / 2 + 6);
    const original = room(d, "text-1");
    expect(original.right).toBeLessThan(DUPLICATE_OFFSET_MM + NUDGE_MM);
    expect(original.left).toBeGreaterThan(original.right);
    const { design: copied, id } = duplicateLayer(d, "text-1", opts);
    expect(get(copied, id).position.x).toBeLessThan(get(d, "text-1").position.x);
    const copy = room(copied, id);
    expect(copy.left).toBeGreaterThanOrEqual(NUDGE_MM - 1e-6);
    expect(copy.right).toBeGreaterThanOrEqual(NUDGE_MM - 1e-6);
  });

  it("where there is plenty of room the copy is 12 mm down and right, as before", () => {
    const d = centreLayer(design(), "logo-1", opts);
    const from = get(d, "logo-1").position;
    expect(duplicatePlace(product, get(d, "logo-1"))).toEqual({ x: from.x + DUPLICATE_OFFSET_MM, y: from.y + DUPLICATE_OFFSET_MM });
  });

  it("an axis with no room at all stays where it is", () => {
    const d = wide(back.x + back.width / 2);
    const full = { ...get(d, "text-1"), size: { width: back.width, height: 40 } };
    expect(duplicatePlace(product, full).x).toBeCloseTo(full.position.x, 6);
  });
});

describe("a step the print area stops (E3e)", () => {
  it("is told apart from one it lets through", () => {
    const d = design();
    const l = get(d, "logo-1");
    const free = get(nudgeLayer(d, "logo-1", -2, 0, opts), "logo-1");
    expect(stoppedByArea(l, free, -2, 0)).toBe(false);
    const far = get(nudgeLayer(d, "logo-1", 500, 0, opts), "logo-1");
    expect(stoppedByArea(l, far, 500, 0)).toBe(true);
    // At the limit already: one more millimetre does nothing, and that is told.
    const atLimit = nudgeLayer(d, "logo-1", 500, 0, opts);
    const again = get(nudgeLayer(atLimit, "logo-1", 1, 0, opts), "logo-1");
    expect(stoppedByArea(get(atLimit, "logo-1"), again, 1, 0)).toBe(true);
    expect(stoppedByArea(get(atLimit, "logo-1"), get(nudgeLayer(atLimit, "logo-1", -1, 0, opts), "logo-1"), -1, 0)).toBe(false);
  });
});
