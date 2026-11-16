/**
 * The print-area rule (E3c, B2): every edit that can change an item's place,
 * size or turn ends with its whole turned box inside its piece's print area,
 * scaled down when it cannot fit, never past it. Property-style over both
 * stand-in products: every preset x every size step x turns of 0, 30, 45, 60,
 * 90 and 135 degrees x text and logos. And the print areas themselves cover
 * only cloth that is visible (inside the piece's cut outline).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { createDesign } from "./create";
import { addLayer } from "./edit";
import { addCatalogFont } from "./font-catalog";
import { centreLayer, duplicateLayer, nudgeLayer, rotateLayerTo, scaleLayerBy } from "./item-edits";
import { newLogoLayer, newTextLayer } from "./new-layers";
import { isInsidePiece } from "./pattern";
import { DEFAULT_MIN_ITEM_SIDE_MM, collectFitNotices, fitDesignToAreas, fitLayerToArea, layerBounds, minItemSide, printAreaOf } from "./print-area";
import { placeAtPreset, setSizeStep, SIZE_STEPS, type SizeStep } from "./roles";
import type { DesignDocument, Layer, ProductDefinition } from "./schema";
import { applyTemplate, type Template } from "./template";
import { validateDesign } from "./validate";
import { loadPlaceholderFonts, loadStandInJerseyProduct, loadStandInProduct } from "../test/fixtures";

const root = resolve(import.meta.dirname, "../..");
const fonts = loadPlaceholderFonts();
const products = [loadStandInJerseyProduct(), loadStandInProduct()];
const TURNS = [0, 30, 45, 60, 90, 135];
const STEPS = Object.keys(SIZE_STEPS) as SizeStep[];
const TOLERANCE = 0.01; // mm: positions are rounded to 0.001 mm

function firstTemplate(product: ProductDefinition): Template {
  const dir = resolve(root, "samples/templates", product.id);
  const index = JSON.parse(readFileSync(resolve(dir, "index.json"), "utf8")) as { templates: string[] };
  return JSON.parse(readFileSync(resolve(dir, `${index.templates[0]}.json`), "utf8")) as Template;
}

/** How far the item's turned box goes past its print area (0 inside). */
function outside(product: ProductDefinition, layer: Layer): number {
  const area = printAreaOf(product.pieces.find((p) => p.id === layer.pieceId)!);
  const b = layerBounds(layer);
  return Math.max(0, area.x - b.x, b.x + b.width - (area.x + area.width), area.y - b.y, b.y + b.height - (area.y + area.height));
}

function kit(product: ProductDefinition): DesignDocument {
  let d = createDesign(product, { teamName: "", samplePlayer: { name: "PLAYER", number: "10" } });
  d = applyTemplate(d, firstTemplate(product), { product, fonts });
  const font = fonts.fonts.find((f) => f.uses.includes("text"))!;
  d = addCatalogFont(d, fonts, font.id);
  d = addLayer(d, newTextLayer(product, { id: "text-1", role: "text", preset: "lower-back", value: "MUHAMMAD ABDUL REHMAN QURESHI SPORTS CLUB LAHORE", fontId: font.id, fill: d.teamColors.second }), { product });
  // A square crest and a wide sponsor logo.
  d = addLayer(d, newLogoLayer(product, { id: "logo-1", preset: "left-chest", role: "crest", asset: { assetId: "a1", mediaType: "image/png", width: 3000, height: 3000 } }), { product });
  d = addLayer(d, newLogoLayer(product, { id: "logo-2", preset: "lower-back", role: "sponsor", asset: { assetId: "a2", mediaType: "image/png", width: 4000, height: 1000 } }), { product });
  return d;
}

const get = (d: DesignDocument, id: string) => d.layers.find((l) => l.id === id)!;

describe("the print-area rule, over both stand-ins (B2)", () => {
  for (const product of products) {
    const base = kit(product);
    const opts = { product };

    it(`${product.id}: every preset x size step x turn x text item ends inside its area`, () => {
      const items = base.layers.filter((l) => l.kind === "text" || l.kind === "number");
      expect(items.length).toBeGreaterThanOrEqual(3);
      let cases = 0;
      for (const item of items) {
        for (const preset of product.placements.filter((p) => p.roles.includes(item.role))) {
          for (const step of STEPS) {
            for (const turn of TURNS) {
              const placed = setSizeStep(placeAtPreset(base, item.id, preset.id, opts), item.id, step, opts);
              const turned = rotateLayerTo(placed, item.id, turn, opts);
              // QA's case: turned first, then a "Where" chip, then the size step again.
              const where = placeAtPreset(turned, item.id, preset.id, opts);
              const sized = setSizeStep(where, item.id, step === "large" ? "small" : "large", opts);
              let pushed = sized;
              for (let k = 0; k < 40; k++) pushed = nudgeLayer(pushed, item.id, 10, -10, opts);
              const large = setSizeStep(pushed, item.id, "large", opts);
              for (const d of [placed, turned, where, sized, pushed, large]) {
                expect(outside(product, get(d, item.id)), `${item.role} at ${preset.id}, ${step}, ${turn} degrees`).toBeLessThan(TOLERANCE);
                cases++;
              }
            }
          }
        }
      }
      expect(cases).toBeGreaterThan(300);
    });

    it(`${product.id}: every preset x size x turn x logo ends inside its area`, () => {
      let cases = 0;
      for (const id of ["logo-1", "logo-2"]) {
        const logo = get(base, id);
        for (const preset of product.placements.filter((p) => p.roles.includes(logo.role))) {
          for (const factor of [0.5, 1, 1.5, 10]) {
            for (const turn of TURNS) {
              const placed = scaleLayerBy(placeAtPreset(base, id, preset.id, opts), id, factor, opts);
              const turned = rotateLayerTo(placed, id, turn, opts);
              const where = placeAtPreset(turned, id, preset.id, opts);
              const bigger = scaleLayerBy(where, id, 10, opts);
              const centred = centreLayer(bigger, id, opts);
              const copy = duplicateLayer(centred, id, opts);
              for (const d of [placed, turned, where, bigger, centred]) {
                expect(outside(product, get(d, id)), `${id} at ${preset.id}, x${factor}, ${turn} degrees`).toBeLessThan(TOLERANCE);
                cases++;
              }
              expect(outside(product, get(copy.design, copy.id))).toBeLessThan(TOLERANCE);
            }
          }
        }
      }
      expect(cases).toBeGreaterThan(300);
    });

    it(`${product.id}: QA's cases end inside (a turned name then "Upper back"; a big sleeve logo turned 60 degrees)`, () => {
      const name = base.layers.find((l) => l.role === "team-name" || l.role === "player-name")!;
      for (const turn of [45, 90]) {
        const d = placeAtPreset(rotateLayerTo(base, name.id, turn, opts), name.id, "upper-back", opts);
        expect(outside(product, get(d, name.id))).toBeLessThan(TOLERANCE);
      }
      const onSleeve = scaleLayerBy(placeAtPreset(base, "logo-1", "sleeve-left", opts), "logo-1", 10, opts);
      const turned = collectFitNotices(() => rotateLayerTo(onSleeve, "logo-1", 60, opts));
      expect(outside(product, get(turned.value, "logo-1"))).toBeLessThan(TOLERANCE);
      // Never silently: the shrink is reported (the interface says so).
      expect(turned.notices.map((n) => n.layerId)).toEqual(["logo-1"]);
      expect(get(turned.value, "logo-1").size.width).toBeLessThan(get(onSleeve, "logo-1").size.width);
      expect(validateDesign(turned.value, { product }).ok).toBe(true);
    });
  }
});

describe("fitLayerToArea", () => {
  const product = products[0]!;
  const front = printAreaOf(product.pieces.find((p) => p.id === "front")!);
  const logo = (size: number, rotation = 0): Layer => ({
    id: "l",
    kind: "logo",
    role: "crest",
    pieceId: "front",
    position: { x: front.x + front.width / 2, y: front.y + front.height / 2 },
    size: { width: size, height: size },
    rotation,
    asset: { assetId: "a", mediaType: "image/png", width: 1000, height: 1000 },
  });

  it("leaves an item that fits as it is (the same object)", () => {
    const l = logo(100);
    expect(fitLayerToArea(product, l)).toBe(l);
  });

  it("scales an oversized box down to the largest size that fits, never centring it over the edge", () => {
    const { value, notices } = collectFitNotices(() => fitLayerToArea(product, logo(900, 45)));
    expect(outside(product, value)).toBeLessThan(TOLERANCE);
    const b = layerBounds(value);
    expect(Math.max(b.width / front.width, b.height / front.height)).toBeGreaterThan(0.999);
    expect(notices).toHaveLength(1);
    expect(notices[0]!.factor).toBeLessThan(1);
  });

  it("scales text with its font size", () => {
    const t = newTextLayer(product, { id: "t", preset: "chest-centre", value: "TIGERS", fontId: "f", fill: { id: "placeholder-red", hex: "#C8102E" } });
    const turned = fitLayerToArea(product, { ...t, size: { width: 600, height: 80 }, rotation: 90 });
    expect(outside(product, turned)).toBeLessThan(TOLERANCE);
    expect(turned.kind === "text" && turned.fontSize / t.fontSize).toBeCloseTo(turned.size.width / 600, 3);
  });

  it("keeps an item at least the product's smallest size for its kind (placeholder data, not code)", () => {
    expect(minItemSide(product, "logo")).toBe(product.minItemSize!.logo);
    expect(minItemSide({ minItemSize: undefined }, "logo")).toBe(DEFAULT_MIN_ITEM_SIDE_MM);
    const tiny = fitLayerToArea(product, logo(4));
    expect(Math.min(tiny.size.width, tiny.size.height)).toBeCloseTo(product.minItemSize!.logo, 3);
    // Resizing stops there too.
    let d = createDesign(product);
    d = addLayer(d, logo(40), { product });
    for (let k = 0; k < 30; k++) d = scaleLayerBy(d, "l", 0.8, { product });
    expect(Math.min(get(d, "l").size.width, get(d, "l").size.height)).toBeCloseTo(product.minItemSize!.logo, 2);
  });

  it("fits every item of a design at once (a design brought back), and is a no-op on one that fits", () => {
    let d = createDesign(product);
    d = { ...d, layers: [logo(900, 30), logo(50)].map((l, k) => ({ ...l, id: `l${k}` })) };
    const fitted = fitDesignToAreas(product, d);
    for (const l of fitted.layers) expect(outside(product, l)).toBeLessThan(TOLERANCE);
    expect(fitDesignToAreas(product, fitted)).toBe(fitted);
  });
});

describe("the stand-ins' print areas cover only visible cloth (B2)", () => {
  for (const product of products) {
    it(`${product.id}: every point of every print area is inside its piece's cut outline`, () => {
      for (const piece of product.pieces) {
        if (!piece.printArea) continue;
        const a = piece.printArea;
        for (let x = a.x; x <= a.x + a.width + 1e-9; x += a.width / 40) {
          for (let y = a.y; y <= a.y + a.height + 1e-9; y += a.height / 40) {
            expect(isInsidePiece(piece, { x, y }), `${piece.id} (${x.toFixed(1)}, ${y.toFixed(1)})`).toBe(true);
          }
        }
      }
    });

    it(`${product.id}: every preset's box at Medium fits its area`, () => {
      for (const preset of product.placements) {
        const area = printAreaOf(product.pieces.find((p) => p.id === preset.pieceId)!);
        expect(preset.centre.x - preset.maxSize.width / 2, preset.id).toBeGreaterThanOrEqual(area.x - 1e-9);
        expect(preset.centre.x + preset.maxSize.width / 2, preset.id).toBeLessThanOrEqual(area.x + area.width + 1e-9);
      }
    });
  }
});
