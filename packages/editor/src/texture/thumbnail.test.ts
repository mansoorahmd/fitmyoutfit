import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { drawPieceView, drawTemplateThumbnail, pieceViewProduct } from "./thumbnail";
import { drawPatternTexture, pieceTextureRect } from "./pattern-texture";
import { createDesign } from "../design/create";
import { addLayer } from "../design/edit";
import { newLogoLayer } from "../design/new-layers";
import type { Template } from "../design/template";
import { loadPlaceholderFonts, loadStandInJerseyProduct } from "../test/fixtures";
import { RasterContext, fakeImage, type TextCall } from "../test/raster-context";

const product = loadStandInJerseyProduct();
const fonts = loadPlaceholderFonts();
const dir = resolve(import.meta.dirname, "../../samples/templates/stand-in-jersey");
const hoops = JSON.parse(readFileSync(resolve(dir, "hoops.json"), "utf8")) as Template;
const RED = { id: "placeholder-red", hex: "#C8102E" };
const WHITE = { id: "placeholder-white", hex: "#FFFFFF" };

function teamDesign() {
  const d = createDesign(product, { teamColors: { main: RED, second: WHITE }, teamName: "LAHORE LIONS", samplePlayer: { name: "ALI", number: "9" } });
  return addLayer(d, newLogoLayer(product, { id: "crest", preset: "left-chest", asset: { assetId: "crest-png", mediaType: "image/png", width: 600, height: 600 } }), { product });
}

describe("template thumbnails (N13)", () => {
  it("draw the front only, in the team's colours, with the team name and the crest, at 120 x 150", () => {
    const ctx = new RasterContext(120, 150);
    const { design, result } = drawTemplateThumbnail(ctx, product, teamDesign(), hoops, { fonts, width: 120, height: 150, images: (a) => fakeImage(a.assetId) });
    expect(result.pieces).toBe(1);
    const texts = ctx.calls.filter((c): c is TextCall => c.op === "fillText").map((c) => c.text);
    expect(texts).toEqual(["LAHORE LIONS"]); // the back's name and number are not on the front
    expect(ctx.count("image:crest-png")).toBeGreaterThan(0);
    expect(ctx.count(RED.hex)).toBeGreaterThan(500);
    expect(ctx.count(WHITE.hex)).toBeGreaterThan(200); // the hoops, and the name
    expect(design.template).toEqual({ id: "hoops", version: hoops.version });
    // Nothing outside the 120 x 150 box.
    expect(ctx.bounds(RED.hex)!.maxX).toBeLessThanOrEqual(120);
  });

  it("uses the same painting as the model: the same text call as the full flat view, scaled", () => {
    const thumb = new RasterContext(120, 150);
    const { design } = drawTemplateThumbnail(thumb, product, teamDesign(), hoops, { fonts, width: 120, height: 150 });
    const full = new RasterContext(256, 256);
    drawPatternTexture(full, product, design, { size: 256, mode: "flat" });
    const a = thumb.calls.find((c): c is TextCall => c.op === "fillText")!;
    const b = full.calls.find((c): c is TextCall => c.op === "fillText" && (c as TextCall).text === "LAHORE LIONS")!;
    expect([a.font, a.textAlign, a.direction, a.style]).toEqual([b.font, b.textAlign, b.direction, b.style]);
  });

  it("fits any piece into the box, centred, keeping its proportions", () => {
    const view = pieceViewProduct(product, { piece: "back", width: 120, height: 150, padding: 0 });
    const piece = view.pieces[0]!;
    expect(piece.id).toBe("back");
    const rect = pieceTextureRect(piece, 150);
    expect(rect.width / rect.height).toBeCloseTo(piece.width / piece.height, 9);
    expect(Math.min(rect.width, rect.height)).toBeGreaterThan(0);
    expect(rect.x + rect.width / 2).toBeCloseTo(60, 6);
    expect(rect.y).toBeCloseTo(0, 6);
    expect(() => pieceViewProduct(product, { piece: "pocket", width: 10, height: 10 })).toThrow(/no piece "pocket"/);
    const back = new RasterContext(120, 150);
    expect(drawPieceView(back, product, teamDesign(), { piece: "back", width: 120, height: 150 }).pieces).toBe(1);
  });
});
