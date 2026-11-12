import { describe, expect, it } from "vitest";
import { loadStandInJerseyProduct } from "../test/fixtures";
import { createDesign } from "./create";
import { addLayer } from "./edit";
import { addCatalogFont } from "./font-catalog";
import { bringForward, canDuplicate, centreLayer, duplicateLayer, nudgeLayer, rotateLayerBy, rotateLayerTo, scaleLayerBy, sendBack } from "./item-edits";
import { newLogoLayer, newTextLayer } from "./new-layers";
import { layerBounds, printAreaOf } from "./print-area";
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
    expect(copy.position.x).toBeGreaterThan(get(d, "logo-1").position.x);
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
