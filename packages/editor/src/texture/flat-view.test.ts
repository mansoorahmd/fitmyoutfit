import { describe, expect, it } from "vitest";
import { flatViewProduct, sleevePieces } from "./flat-view";
import { drawPatternTexture } from "./pattern-texture";
import { drawZoneHighlight, HIGHLIGHT_INK } from "./zone-highlight";
import { createDesign } from "../design/create";
import { setZoneColor } from "../design/edit";
import { loadPlaceholderProduct, loadStandInJerseyProduct } from "../test/fixtures";
import { RasterContext } from "../test/raster-context";

const jersey = loadStandInJerseyProduct();
const GREEN = { id: "placeholder-green", hex: "#0B6B3A" };

describe("the flat view (no WebGL)", () => {
  it("shows the front and the back side by side, the sleeves under them, inside the box", () => {
    const layout = flatViewProduct(jersey, { width: 360, height: 400 });
    expect(layout.product.pieces.map((p) => p.id)).toEqual(["front", "back", "sleeve_right", "sleeve_left"]);
    const [front, back, s1, s2] = layout.places;
    expect(front!.x + front!.width).toBeLessThanOrEqual(back!.x);
    expect(s1!.y).toBeGreaterThan(front!.y + front!.height);
    expect(s2!.y).toBeCloseTo(s1!.y, 6);
    for (const p of layout.places) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.x + p.width).toBeLessThanOrEqual(360 + 1e-6);
      expect(p.y + p.height).toBeLessThanOrEqual(400 + 1e-6);
    }
    // Pieces keep their proportions.
    const piece = jersey.pieces.find((p) => p.id === "front")!;
    expect(front!.width / front!.height).toBeCloseTo(piece.width / piece.height, 6);
    expect(sleevePieces(jersey).left!.id).toBe("sleeve_left");
  });

  it("draws with the same function as the model: zone colours on every piece shown", () => {
    const layout = flatViewProduct(jersey, { width: 200, height: 240 });
    const ctx = new RasterContext(layout.size, layout.size);
    const design = setZoneColor(createDesign(jersey), "sleeves", GREEN);
    drawPatternTexture(ctx, layout.product, design, { size: layout.size, mode: "flat" });
    const sleeve = layout.places[2]!;
    expect(ctx.pixel(sleeve.x + sleeve.width / 2, sleeve.y + sleeve.height * 0.6)).toBe(GREEN.hex);
  });

  it("a product without sleeve presets shows the front and the back only", () => {
    const product = { ...loadPlaceholderProduct(), placements: [] };
    expect(flatViewProduct(product, { width: 300, height: 300 }).product.pieces.map((p) => p.id)).toEqual([product.views.front, product.views.back]);
  });
});

describe("the zone highlight (N8)", () => {
  it("draws the chosen zone's edge in white and ink, inside the garment, and nothing at alpha 0", () => {
    const layout = flatViewProduct(jersey, { width: 200, height: 240 });
    const ctx = new RasterContext(layout.size, layout.size);
    const design = createDesign(jersey);
    drawPatternTexture(ctx, layout.product, design, { size: layout.size, mode: "flat", highlight: { zoneId: "sleeves", alpha: 1 } });
    const ink = `rgba(${HIGHLIGHT_INK}, 1)`;
    // One white band and one ink line per edge: the two sleeves (the only pieces of that zone shown).
    // (The flat view strokes each piece's cut line in grey first.)
    const strokes = ctx.calls.filter((c) => c.op === "stroke").map((c) => (c as { style: string }).style).filter((s) => s !== "#333333");
    expect(strokes).toEqual(["rgba(255, 255, 255, 1)", ink, "rgba(255, 255, 255, 1)", ink]);
    const half = new RasterContext(layout.size, layout.size);
    drawPatternTexture(half, layout.product, design, { size: layout.size, mode: "flat", highlight: { zoneId: "sleeves", alpha: 0.5 } });
    expect(half.calls.some((c) => c.op === "stroke" && (c as { style: string }).style === `rgba(${HIGHLIGHT_INK}, 0.5)`)).toBe(true);
    const none = new RasterContext(layout.size, layout.size);
    expect(drawZoneHighlight(none, layout.product, design, { zoneId: "sleeves", alpha: 0 }, () => [1, 0, 0, 1, 0, 0])).toBe(0);
    expect(drawZoneHighlight(none, layout.product, design, {}, () => [1, 0, 0, 1, 0, 0])).toBe(0);
  });
});
