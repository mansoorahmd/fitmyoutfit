import { describe, expect, it } from "vitest";
import { drawPatternTexture, pieceTextureScale, pieceToTexture } from "./pattern-texture";
import { textLayout } from "./layers";
import { createDesign } from "../design/create";
import { addCatalogFont } from "../design/font-catalog";
import { addLayer } from "../design/edit";
import type { ColorRef, DesignDocument, Layer } from "../design/schema";
import { loadPlaceholderFonts, loadPlaceholderProduct } from "../test/fixtures";
import { FAKE_CHAR_EM, FAKE_LINE_EM, RasterContext, fakeImage, type TextCall } from "../test/raster-context";

const product = loadPlaceholderProduct();
const catalog = loadPlaceholderFonts();
const front = product.pieces.find((p) => p.id === "front")!;
const SIZE = 512;
const INK: ColorRef = { id: "test-ink", hex: "#00FF00" };
const INK2: ColorRef = { id: "test-ink-2", hex: "#FF00FF" };

let base = createDesign(product);
base = addCatalogFont(base, catalog, "oswald-700");
base = addCatalogFont(base, catalog, "graduate-400");

function text(overrides: Partial<Extract<Layer, { kind: "text" }>> = {}): Layer {
  return {
    id: "name",
    kind: "text",
    pieceId: "front",
    position: { x: 280, y: 300 },
    size: { width: 400, height: 80 },
    rotation: 0,
    value: "TIGERS",
    direction: "auto",
    fontId: "oswald-700",
    fontSize: 60,
    fill: INK,
    align: "center",
    ...overrides,
  };
}

function render(design: DesignDocument, options: Parameters<typeof drawPatternTexture>[3] = {}) {
  const ctx = new RasterContext(SIZE, SIZE);
  const result = drawPatternTexture(ctx, product, design, { size: SIZE, ...options });
  return { ctx, result, texts: ctx.calls.filter((c): c is TextCall => c.op === "fillText") };
}

/** The painted bounds of a colour, in the front piece's millimetres. */
function boundsMm(ctx: RasterContext, colour: string) {
  const b = ctx.bounds(colour);
  if (!b) return null;
  const s = pieceTextureScale(front, SIZE).x;
  const origin = pieceToTexture(front, { x: 0, y: 0 }, SIZE);
  return { minX: (b.minX - origin.x) / s, maxX: (b.maxX - origin.x) / s, minY: (b.minY - origin.y) / s, maxY: (b.maxY - origin.y) / s };
}

describe("text layers in the texture", () => {
  it("are drawn after the zones, as text with the layer's font stack, at the layer's place on its piece", () => {
    const { ctx, result, texts } = render(addLayer(base, text(), { product }));
    expect(result.layers).toBe(1);
    const fills = ctx.calls.map((c) => c.op);
    expect(fills.lastIndexOf("fillText")).toBeGreaterThan(fills.lastIndexOf("fill"));
    expect(texts).toHaveLength(1);
    expect(texts[0]).toMatchObject({
      text: "TIGERS",
      font: 'normal 700 60px "Oswald", "Noto Sans Arabic", sans-serif',
      textAlign: "center",
      textBaseline: "middle",
      direction: "ltr",
      style: "#00FF00",
    });
    // 6 characters x 0.6 em x 60 mm = 216 mm wide, centred on x = 280; 0.7 em = 42 mm tall, centred on y = 300.
    const b = boundsMm(ctx, "#00FF00")!;
    const px = 1 / pieceTextureScale(front, SIZE).x;
    expect(Math.abs(b.minX - (280 - 108))).toBeLessThan(2 * px);
    expect(Math.abs(b.maxX - (280 + 108))).toBeLessThan(2 * px);
    expect(Math.abs(b.minY - (300 - 21))).toBeLessThan(2 * px);
    expect(Math.abs(b.maxY - (300 + 21))).toBeLessThan(2 * px);
  });

  it("align start is the left edge for Latin text and the right edge for Urdu and Arabic", () => {
    const px = 2 / pieceTextureScale(front, SIZE).x;
    const latin = render(addLayer(base, text({ align: "start" }), { product }));
    expect(latin.texts[0]).toMatchObject({ direction: "ltr", textAlign: "left", x: -200 });
    expect(Math.abs(boundsMm(latin.ctx, "#00FF00")!.minX - 80)).toBeLessThan(px);

    for (const value of ["محمد علی", "عبدالله الهاشمي"]) {
      const rtl = render(addLayer(base, text({ value, align: "start", fontSize: 30 }), { product }));
      expect(rtl.texts[0]).toMatchObject({ text: value, direction: "rtl", textAlign: "right", x: 200 });
      expect(Math.abs(boundsMm(rtl.ctx, "#00FF00")!.maxX - 480)).toBeLessThan(px);
      const end = render(addLayer(base, text({ value, align: "end", fontSize: 30 }), { product }));
      expect(end.texts[0]).toMatchObject({ direction: "rtl", textAlign: "left", x: -200 });
    }
  });

  it("an explicit direction overrides the text", () => {
    const { texts } = render(addLayer(base, text({ direction: "rtl", align: "start" }), { product }));
    expect(texts[0]).toMatchObject({ direction: "rtl", textAlign: "right" });
  });

  it("a line wider than its box is shrunk evenly to fit the box's width", () => {
    const long = text({ value: "ABCDEFGHIJKLMNOPQRST", align: "start" }); // 20 x 0.6 x 60 = 720 mm in a 400 mm box
    expect(textLayout(long as never, 720)).toMatchObject({ scale: 400 / 720, x: -200 / (400 / 720) });
    const b = boundsMm(render(addLayer(base, long, { product })).ctx, "#00FF00")!;
    const px = 2 / pieceTextureScale(front, SIZE).x;
    expect(Math.abs(b.maxX - b.minX - 400)).toBeLessThan(px);
    expect(Math.abs(b.maxY - b.minY - 42 * (400 / 720))).toBeLessThan(px);
    // A line that fits is never stretched.
    expect(textLayout(text() as never, 100).scale).toBe(1);
  });

  it("is turned clockwise by its rotation", () => {
    const flat = boundsMm(render(addLayer(base, text({ value: "AB" }), { product })).ctx, "#00FF00")!;
    const turned = boundsMm(render(addLayer(base, text({ value: "AB", rotation: 90 }), { product })).ctx, "#00FF00")!;
    expect(flat.maxX - flat.minX).toBeGreaterThan(flat.maxY - flat.minY);
    expect(turned.maxY - turned.minY).toBeGreaterThan(turned.maxX - turned.minX);
    expect(turned.maxY - turned.minY).toBeCloseTo(flat.maxX - flat.minX, -1);
  });

  it("is clipped to its piece's outline", () => {
    // A wide line across the shoulder: the front's outline starts at x = 160 at the top.
    const { ctx } = render(addLayer(base, text({ value: "W".repeat(30), position: { x: 280, y: 8 }, size: { width: 560, height: 16 }, fontSize: 30 }), { product }));
    const outside = pieceToTexture(front, { x: 20, y: 8 }, SIZE);
    const inside = pieceToTexture(front, { x: 280, y: 8 }, SIZE);
    expect(ctx.pixel(inside.x, inside.y)).toBe("#00FF00");
    expect(ctx.pixel(outside.x, outside.y)).not.toBe("#00FF00");
    // Nothing of it reaches the back piece next to the front.
    const back = product.pieces.find((p) => p.id === "back")!;
    const onBack = pieceToTexture(back, { x: 20, y: 8 }, SIZE);
    expect(ctx.pixel(onBack.x, onBack.y)).not.toBe("#00FF00");
  });

  it("layers are drawn bottom to top", () => {
    let design = addLayer(base, text({ id: "under" }), { product });
    design = addLayer(design, text({ id: "over", value: "TI", fill: INK2 }), { product });
    const { ctx } = render(design);
    const centre = pieceToTexture(front, { x: 280, y: 300 }, SIZE);
    expect(ctx.pixel(centre.x, centre.y)).toBe("#FF00FF");
  });

  it("is drawn in the flat pattern too", () => {
    const { texts } = render(addLayer(base, text(), { product }), { mode: "flat" });
    expect(texts).toHaveLength(1);
  });
});

describe("number layers in the texture", () => {
  const number = (value: string): Layer => ({
    id: "number",
    kind: "number",
    pieceId: "back",
    position: { x: 280, y: 350 },
    size: { width: 300, height: 300 },
    rotation: 0,
    value,
    fontId: "graduate-400",
    fontSize: 250,
    fill: INK,
    align: "center",
  });

  it("are drawn left to right, in English or Arabic digits, with the Arabic fallback in the stack", () => {
    for (const value of ["10", "٧", "۱۰"]) {
      const { texts } = render(addLayer(base, number(value), { product }));
      expect(texts[0]).toMatchObject({
        text: value,
        direction: "ltr",
        font: 'normal 400 250px "Graduate", "Noto Sans Arabic", sans-serif',
      });
    }
  });
});

describe("logo layers in the texture", () => {
  const logo = (overrides: Partial<Extract<Layer, { kind: "logo" }>> = {}): Layer => ({
    id: "logo",
    kind: "logo",
    pieceId: "front",
    position: { x: 150, y: 200 },
    size: { width: 100, height: 100 },
    rotation: 0,
    asset: { assetId: "upload-1", mediaType: "image/png", width: 400, height: 200 },
    ...overrides,
  });

  it("draw the image as large as fits in the box, keeping its proportions", () => {
    const { ctx, result } = render(addLayer(base, logo(), { product }), { images: (asset) => fakeImage(asset.assetId) });
    expect(result.missingImages).toEqual([]);
    const b = boundsMm(ctx, "image:upload-1")!;
    const px = 2 / pieceTextureScale(front, SIZE).x;
    expect(Math.abs(b.maxX - b.minX - 100)).toBeLessThan(px);
    expect(Math.abs(b.maxY - b.minY - 50)).toBeLessThan(px);
    expect(Math.abs((b.minY + b.maxY) / 2 - 200)).toBeLessThan(px);
  });

  it("draw a grey placeholder, and report the asset, while the image is not available", () => {
    const { ctx, result } = render(addLayer(base, logo(), { product }));
    expect(result.missingImages).toEqual(["upload-1"]);
    expect(ctx.count("rgba(127, 127, 127, 0.35)")).toBeGreaterThan(0);
  });
});

describe("the selected layer", () => {
  it("is outlined only when asked (never in a proof)", () => {
    const design = addLayer(base, text(), { product });
    const strokes = (selected?: string) => render(design, { selectedLayerId: selected }).ctx.calls.filter((c) => c.op === "stroke").length;
    expect(strokes()).toBe(0);
    expect(strokes("name")).toBe(2);
    expect(strokes("nope")).toBe(0);
  });
});

describe("layers on a piece the product does not have", () => {
  it("are skipped, not drawn somewhere else", () => {
    const design = { ...base, layers: [text({ pieceId: "hood" })] };
    const { result, texts } = render(design);
    expect(result.layers).toBe(0);
    expect(texts).toHaveLength(0);
  });
});

describe("the fake metrics used above", () => {
  it("are what the tests assume", () => {
    expect(FAKE_CHAR_EM).toBe(0.6);
    expect(FAKE_LINE_EM).toBe(0.7);
  });
});
