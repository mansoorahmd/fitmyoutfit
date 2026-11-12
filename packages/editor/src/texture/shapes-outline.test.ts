import { describe, expect, it } from "vitest";
import { drawPatternTexture, pieceTextureRect, pieceTextureScale, pieceToTexture } from "./pattern-texture";
import { textFit, textLayout } from "./layers";
import { createDesign } from "../design/create";
import { addCatalogFont } from "../design/font-catalog";
import { addLayer } from "../design/edit";
import type { ColorValue, DesignDocument, Layer, Shape } from "../design/schema";
import { loadPlaceholderFonts, loadPlaceholderProduct } from "../test/fixtures";
import { FAKE_CHAR_EM, FAKE_LINE_EM, RasterContext, type StrokeTextCall, type TextCall } from "../test/raster-context";

const product = loadPlaceholderProduct();
const front = product.pieces.find((p) => p.id === "front")!;
const back = product.pieces.find((p) => p.id === "back")!;
const SIZE = 512;
const HOOP: ColorValue = { id: "test-hoop", hex: "#00FF00" };
const INK: ColorValue = { id: "test-ink", hex: "#FF00FF" };
const EDGE: ColorValue = { id: "test-edge", hex: "#0000FF" };

let base = createDesign(product);
base = addCatalogFont(base, loadPlaceholderFonts(), "oswald-700");
base = addCatalogFont(base, loadPlaceholderFonts(), "noto-sans-arabic-700");

/** A band across the front from x -50 to 610 mm (past both edges of the 560 mm piece), y 300 to 360. */
const hoop: Shape = { id: "shape-1", kind: "shape", group: "hoops", pieceId: "front", path: "M -50 300 H 610 V 360 H -50 Z", fill: HOOP, locked: true };

function render(design: DesignDocument, mode: "texture" | "flat" = "texture") {
  const ctx = new RasterContext(SIZE, SIZE);
  const result = drawPatternTexture(ctx, product, design, { size: SIZE, mode });
  return { ctx, result };
}
const at = (ctx: RasterContext, piece: typeof front, x: number, y: number) => {
  const p = pieceToTexture(piece, { x, y }, SIZE);
  return ctx.pixel(p.x, p.y);
};

describe("shapes in the texture", () => {
  it("are drawn over the zones on their own piece only", () => {
    const { ctx, result } = render({ ...base, shapes: [hoop] });
    expect(at(ctx, front, 280, 330)).toBe(HOOP.hex);
    expect(at(ctx, front, 280, 250)).toBe(base.zones.body!.hex);
    expect(at(ctx, back, 280, 330)).toBe(base.zones.body!.hex);
    expect(result.shapes).toBe(1);
  });

  it("are clipped to the piece: to the outline in the flat view, to the piece's area and its margin in the texture", () => {
    const flat = render({ ...base, shapes: [hoop] }, "flat").ctx;
    const rect = pieceTextureRect(front, SIZE);
    const s = pieceTextureScale(front, SIZE).x;
    const y = rect.y + 330 * s;
    // The flat view: inside the outline only. The front's outline at y = 330 mm runs from about x = 7 to 553.
    expect(flat.pixel(rect.x + 2, y)).toBe("");
    expect(flat.pixel(rect.x + 20 * s, y)).toBe(HOOP.hex);
    // The texture: the hoop's colour reaches the piece's margin, so the seam never shows a line of the body colour.
    const tex = render({ ...base, shapes: [hoop] }).ctx;
    const bleed = Math.max(2, SIZE / 128);
    expect(tex.pixel(rect.x - bleed / 2, y)).toBe(HOOP.hex);
    expect(tex.pixel(rect.x + rect.width + bleed / 2, y)).toBe(HOOP.hex);
    expect(tex.pixel(rect.x - bleed - 2, y)).not.toBe(HOOP.hex);
  });

  it("never bleed into another piece's area, however far the path reaches", () => {
    const wide: Shape = { ...hoop, path: "M -2000 -2000 H 4000 V 4000 H -2000 Z" };
    const { ctx } = render({ ...base, shapes: [wide] });
    for (const piece of product.pieces.filter((p) => p.id !== "front")) {
      const r = pieceTextureRect(piece, SIZE);
      expect(ctx.pixel(r.x + r.width / 2, r.y + r.height / 2)).not.toBe(HOOP.hex);
    }
  });

  it("are drawn under every layer and in their order", () => {
    const second: Shape = { ...hoop, id: "shape-2", fill: EDGE, path: "M -50 320 H 610 V 340 H -50 Z" };
    const layer: Layer = { id: "t", kind: "text", role: "text", pieceId: "front", position: { x: 280, y: 330 }, size: { width: 300, height: 60 }, rotation: 0, value: "AB", direction: "auto", fontId: "oswald-700", fontSize: 40, fill: INK, align: "center" };
    const { ctx } = render(addLayer({ ...base, shapes: [hoop, second] }, layer));
    expect(at(ctx, front, 280, 330)).toBe(INK.hex);
    expect(at(ctx, front, 100, 330)).toBe(EDGE.hex);
    expect(at(ctx, front, 100, 310)).toBe(HOOP.hex);
  });

  it("follow their team colour: the painted colour is the value's code", () => {
    const d: DesignDocument = { ...base, shapes: [{ ...hoop, fill: { ...base.teamColors.second, teamColor: "second" } }] };
    expect(at(render(d).ctx, front, 280, 330)).toBe(base.teamColors.second.hex);
  });
});

/** The front piece alone, filling most of a 1024 px texture (1.46 px per mm), to measure outlines finely. */
const frontOnly = { ...product, pieces: [{ ...front, uv: { x: 0, y: 0, width: 0.8, height: 1 } }] };
function renderFront(design: DesignDocument) {
  const ctx = new RasterContext(1024, 1024);
  drawPatternTexture(ctx, frontOnly, design, { size: 1024, mode: "flat" });
  return ctx;
}

function textLayer(value: string, overrides: Partial<Extract<Layer, { kind: "text" }>> = {}): Extract<Layer, { kind: "text" }> {
  return { id: "t", kind: "text", role: "text", pieceId: "front", position: { x: 280, y: 300 }, size: { width: 400, height: 80 }, rotation: 0, value, direction: "auto", fontId: "oswald-700", fontSize: 50, fill: INK, align: "center", ...overrides };
}

describe("text outlines", () => {
  const values = [
    ["Latin", "TIGERS", "ltr"],
    ["Urdu", "محمد علی", "rtl"],
    ["Arabic", "عبدالله", "rtl"],
  ] as const;
  for (const [script, value, dir] of values) {
    for (const width of [1.5, 2.5, 4]) {
      it(`${script}, ${width} mm: a stroke twice the width with round joins under the fill, the same text, place and direction`, () => {
        const layer = textLayer(value, { outline: { color: EDGE, width } });
        const ctx = renderFront(addLayer(base, layer));
        const strokes = ctx.calls.filter((c): c is StrokeTextCall => c.op === "strokeText");
        const fills = ctx.calls.filter((c): c is TextCall => c.op === "fillText");
        expect(strokes).toHaveLength(1);
        expect(ctx.calls.indexOf(strokes[0]!)).toBeLessThan(ctx.calls.indexOf(fills[0]!));
        expect(strokes[0]).toMatchObject({ text: value, style: EDGE.hex, lineWidth: 2 * width, lineJoin: "round", x: fills[0]!.x, y: fills[0]!.y });
        expect(strokes[0]!.matrix).toEqual(fills[0]!.matrix);
        expect(fills[0]!.direction).toBe(dir);
        // An even band of the outline colour round the letters: `width` mm on every side (to a pixel).
        const s = 1024 * 0.8 / front.width;
        const ink = ctx.bounds(INK.hex)!;
        const edge = ctx.bounds(EDGE.hex)!;
        for (const d of [ink.minX - edge.minX, edge.maxX - ink.maxX, ink.minY - edge.minY, edge.maxY - ink.maxY]) expect(Math.abs(d - width * s)).toBeLessThanOrEqual(1);
      });
    }
  }

  it("on a number, the same way, always left to right", () => {
    const number: Layer = { id: "n", kind: "number", role: "text", pieceId: "back", position: { x: 280, y: 350 }, size: { width: 300, height: 260 }, rotation: 0, value: "٧", fontId: "oswald-700", fontSize: 215, fill: INK, align: "center", outline: { color: EDGE, width: 6.45 } };
    const { ctx } = render(addLayer(base, number));
    const stroke = ctx.calls.find((c): c is StrokeTextCall => c.op === "strokeText")!;
    expect(stroke).toMatchObject({ text: "٧", lineWidth: 12.9, lineJoin: "round" });
    expect((ctx.calls.find((c) => c.op === "fillText") as TextCall).direction).toBe("ltr");
  });

  it("keeps the outline inside the box: the letters and their outline fit the box together", () => {
    // 30 characters at 50 mm: 900 mm wide in the fake metrics, in a 400 mm box with a 4 mm outline.
    const long = textLayer("ABCDEFGHIJKLMNOPQRSTUVWXYZABCD", { outline: { color: EDGE, width: 4 } });
    const layout = textLayout(long, 30 * FAKE_CHAR_EM * 50);
    expect(layout.scale).toBeCloseTo(400 / 908, 9);
    const { ctx } = render(addLayer(base, long));
    const edge = ctx.bounds(EDGE.hex)!;
    const s = pieceTextureScale(front, SIZE).x;
    expect((edge.maxX - edge.minX) / s).toBeLessThanOrEqual(400 + 1);
    expect((edge.maxX - edge.minX) / s).toBeGreaterThan(400 - 4);
    // Without an outline nothing changes: no stroke, the whole box for the line.
    const plain = render(addLayer(base, textLayer("TIGERS"))).ctx;
    expect(plain.calls.some((c) => c.op === "strokeText")).toBe(false);
    expect(FAKE_LINE_EM).toBeGreaterThan(0);
  });

  it("a long name shrunk to fit: the outline follows the size the letters are drawn at (E3a-2 fault 3)", () => {
    // A thick outline (8% of 52 mm = 4.16 mm) on a 30-character name at the back-name preset's 340 mm box.
    const long = textLayer("MUHAMMAD ABDUL REHMAN QURESHI X", { size: { width: 340, height: 72.8 }, fontSize: 52, outline: { color: EDGE, width: 4.16 } });
    const measured = long.value.length * FAKE_CHAR_EM * 52;
    const layout = textLayout(long, measured);
    expect(layout.scale).toBeLessThan(0.5);
    // Drawn outline: the full width times the shrink, so the outline keeps its proportion to the letters.
    expect(layout.outlineWidth).toBeCloseTo(4.16 * layout.scale, 9);
    const { ctx } = render(addLayer(base, long));
    const stroke = ctx.calls.find((c): c is StrokeTextCall => c.op === "strokeText")!;
    // lineWidth is in the shrunk frame: times the shrink gives the width on the garment (twice the outline).
    expect(stroke.lineWidth * layout.scale).toBeCloseTo(2 * 4.16 * layout.scale, 6);
    expect(stroke.lineWidth * layout.scale).toBeLessThan(2 * 4.16 * 0.5);
    // An unshrunk line keeps its full outline.
    const short = textLayer("ALI", { size: { width: 340, height: 72.8 }, fontSize: 52, outline: { color: EDGE, width: 4.16 } });
    expect(textLayout(short, 3 * FAKE_CHAR_EM * 52)).toMatchObject({ scale: 1, outlineWidth: 4.16 });
  });

  it("a shrunk outline never goes below the thinnest printable width (1 mm)", () => {
    // A thin 1.5 mm outline on a line shrunk to about a quarter: 1 mm, not 0.4 mm.
    const long = textLayer("ABCDEFGHIJKLMNOPQRSTUVWXYZABCDEFGHIJKLMNOPQRSTUVWXYZ", { outline: { color: EDGE, width: 1.5 } });
    const layout = textLayout(long, long.value.length * FAKE_CHAR_EM * 50);
    expect(layout.outlineWidth).toBe(1);
    expect(layout.scale).toBeCloseTo(398 / (long.value.length * FAKE_CHAR_EM * 50), 9);
    // An outline already thinner than the floor keeps its own width.
    const hair = textLayer(long.value, { outline: { color: EDGE, width: 0.5 } });
    expect(textLayout(hair, long.value.length * FAKE_CHAR_EM * 50).outlineWidth).toBe(0.5);
  });

  it("an empty team name draws nothing, outline included", () => {
    const empty = textLayer("", { role: "team-name", outline: { color: EDGE, width: 2 } });
    const { ctx } = render({ ...base, layers: [empty] });
    expect(ctx.count(EDGE.hex)).toBe(0);
    expect(ctx.count(INK.hex)).toBe(0);
  });
});

describe("text fits: whether a line was shrunk (N12)", () => {
  it("reports every text and number layer, shrunk or not, with the shrink", () => {
    const short = textLayer("ALI", { id: "short", role: "player-name" });
    const long = textLayer("ABDULLAH AL-HASHIMI THE YOUNGER", { id: "long", role: "player-name" });
    const { result } = render({ ...base, samplePlayer: { name: "x", number: "" }, layers: [short, long] });
    expect(result.textFits).toEqual([
      { layerId: "short", role: "player-name", scale: 1, shrunk: false },
      { layerId: "long", role: "player-name", scale: expect.closeTo(400 / (31 * FAKE_CHAR_EM * 50), 9), shrunk: true },
    ]);
    expect(textFit(long, 31 * FAKE_CHAR_EM * 50).shrunk).toBe(true);
    expect(textFit(long, 100).shrunk).toBe(false);
  });
});
