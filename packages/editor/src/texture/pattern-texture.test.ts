import { describe, expect, it } from "vitest";
import {
  DEFAULT_TEXTURE_SIZE,
  TEXTURE_BACKGROUND,
  drawPatternTexture,
  pieceTextureRect,
  pieceTextureScale,
  pieceToTexture,
  textureToPiece,
  zoneColor,
} from "./pattern-texture";
import { createDesign } from "../design/create";
import { setZoneColor } from "../design/edit";
import { pieceToUv, zoneAtPiecePoint } from "../design/pattern";
import type { ColorRef, DesignDocument } from "../design/schema";
import { loadPlaceholderProduct } from "../test/fixtures";
import { RasterContext } from "../test/raster-context";

const product = loadPlaceholderProduct();
const piece = (id: string) => product.pieces.find((p) => p.id === id)!;
const front = piece("front");

/** A design where every zone has its own colour, so a pixel's colour names its zone. */
function distinctDesign(): DesignDocument {
  const colours: Record<string, string> = {
    body: "#FFFFFF",
    yoke: "#1B2A5C",
    side_panels: "#C8102E",
    sleeves: "#0B6B3A",
    cuffs: "#F2B705",
    collar: "#5B9BD5",
  };
  let design = createDesign(product);
  for (const [zone, hex] of Object.entries(colours)) {
    design = setZoneColor(design, zone, { id: `test-${zone.replace("_", "-")}`, hex }, { product });
  }
  return design;
}

const SIZE = 256;
function render(design: DesignDocument, mode: "texture" | "flat" = "texture", size = SIZE) {
  const ctx = new RasterContext(size, size);
  const result = drawPatternTexture(ctx, product, design, { size, mode });
  return { ctx, result };
}

describe("pattern-to-texture mapping", () => {
  it("puts each piece's box at its UV rectangle times the texture size", () => {
    expect(pieceTextureRect(front, 2048)).toEqual({ x: 40.96, y: 40.96, width: 917.504, height: 1146.88 });
    const collar = pieceTextureRect(piece("collar"), 1000);
    expect(collar.x).toBeCloseTo(20);
    expect(collar.y).toBeCloseTo(890);
    expect(collar.width).toBeCloseTo(960);
    expect(collar.height).toBeCloseTo(60);
  });

  it("maps piece millimetres to pixels, and back", () => {
    const p = pieceToTexture(front, { x: 280, y: 350 }, 2048);
    expect(p.x).toBeCloseTo(40.96 + 917.504 / 2, 9);
    expect(p.y).toBeCloseTo(40.96 + 1146.88 / 2, 9);
    for (const pc of product.pieces) {
      const point = { x: pc.width * 0.3, y: pc.height * 0.8 };
      const back = textureToPiece(pc, pieceToTexture(pc, point, DEFAULT_TEXTURE_SIZE), DEFAULT_TEXTURE_SIZE);
      expect(back.x).toBeCloseTo(point.x, 9);
      expect(back.y).toBeCloseTo(point.y, 9);
    }
  });

  it("agrees with the UV mapping the model uses (pixel = UV times size)", () => {
    for (const pc of product.pieces) {
      const point = { x: pc.width / 3, y: pc.height / 4 };
      const uv = pieceToUv(pc, point);
      const px = pieceToTexture(pc, point, 1024);
      expect(px.x).toBeCloseTo(uv.u * 1024, 9);
      expect(px.y).toBeCloseTo(uv.v * 1024, 9);
    }
  });

  it("has the same scale across and down on every piece", () => {
    for (const pc of product.pieces) {
      const s = pieceTextureScale(pc, 2048);
      expect(s.x / s.y).toBeCloseTo(1, 2);
    }
    // The front gets about 1.6 pixels per millimetre at the default size.
    expect(pieceTextureScale(front, DEFAULT_TEXTURE_SIZE).x).toBeCloseTo(1.6384, 4);
  });

  it("falls back to the product's default colour for a zone the design lacks", () => {
    const design = createDesign(product);
    const zones = { ...design.zones };
    delete zones.body;
    expect(zoneColor(product, { ...design, zones }, "body")).toEqual(product.zones[0]!.defaultColor);
    expect(zoneColor(product, design, "nothing")).toBeUndefined();
  });
});

describe("drawPatternTexture", () => {
  const design = distinctDesign();
  const { ctx, result } = render(design);
  const colourOf = (zone: string) => design.zones[zone]!.hex;
  const texel = (pieceId: string, point: { x: number; y: number }) => {
    const p = pieceToTexture(piece(pieceId), point, SIZE);
    return ctx.pixel(p.x, p.y);
  };

  it("paints every point of every piece in the colour of the zone found there", () => {
    let checked = 0;
    for (const pc of product.pieces) {
      // A grid of points over the piece; skip points within a pixel of a zone border (sampling).
      for (let gx = 0.5; gx < 20; gx++) {
        for (let gy = 0.5; gy < 20; gy++) {
          const point = { x: (gx / 20) * pc.width, y: (gy / 20) * pc.height };
          const zone = zoneAtPiecePoint(pc, point);
          if (zone === null) continue;
          const px = pieceToTexture(pc, point, SIZE);
          const mmPerPixel = 1 / pieceTextureScale(pc, SIZE).x;
          const nearBorder = [-1, 1].some((dx) =>
            [-1, 1].some(
              (dy) => zoneAtPiecePoint(pc, { x: point.x + dx * mmPerPixel, y: point.y + dy * mmPerPixel }) !== zone,
            ),
          );
          if (nearBorder) continue;
          expect(ctx.pixel(px.x, px.y), `${pc.id} at ${point.x},${point.y} (${zone})`).toBe(colourOf(zone));
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThan(1200);
  });

  it("draws the zones where the product says: yoke, side panels, body on the front", () => {
    expect(texel("front", { x: 280, y: 400 })).toBe(colourOf("body"));
    expect(texel("front", { x: 280, y: 60 })).toBe(colourOf("yoke"));
    expect(texel("front", { x: 40, y: 500 })).toBe(colourOf("side_panels"));
    expect(texel("back", { x: 280, y: 135 })).toBe(colourOf("body"));
    expect(texel("sleeve_right", { x: 220, y: 205 })).toBe(colourOf("cuffs"));
    expect(texel("collar", { x: 240, y: 15 })).toBe(colourOf("collar"));
  });

  it("fills each piece's whole box plus a margin, and leaves the gaps between pieces as background", () => {
    for (const pc of product.pieces) {
      const r = pieceTextureRect(pc, SIZE);
      // Corners of the box (outside the outline) and one pixel beyond it still carry piece colours.
      for (const [x, y] of [
        [r.x + 0.5, r.y + 0.5],
        [r.x + r.width - 0.5, r.y + r.height - 0.5],
        [r.x - 1, r.y + r.height / 2],
      ] as const) {
        expect(ctx.pixel(x, y), `${pc.id} at ${x},${y}`).not.toBe(TEXTURE_BACKGROUND);
        expect(ctx.pixel(x, y)).not.toBe("");
      }
    }
    // Between the front and the back, away from both margins.
    expect(ctx.pixel(SIZE * 0.5, SIZE * 0.3)).toBe(TEXTURE_BACKGROUND);
    expect(result).toEqual({ size: SIZE, pieces: 5, fills: 2 * (3 + 3 + 2 + 2 + 1) });
  });

  it("changing one zone's colour changes that zone's pixels and nothing else", () => {
    const green: ColorRef = { id: "test-new", hex: "#00FF00" };
    const after = render(setZoneColor(design, "side_panels", green, { product })).ctx;
    let changed = 0;
    for (let k = 0; k < ctx.pixels.length; k++) {
      if (ctx.pixels[k] !== after.pixels[k]) {
        changed++;
        expect(ctx.pixels[k]).toBe(colourOf("side_panels"));
        expect(after.pixels[k]).toBe("#00FF00");
      }
    }
    expect(changed).toBeGreaterThan(100);
    // Every side-panel pixel changed: none of the old colour is left.
    expect(after.pixels.includes(colourOf("side_panels"))).toBe(false);
  });

  it("gives the same pixels for the same inputs", () => {
    expect(render(design).ctx.pixels).toEqual(ctx.pixels);
  });

  it("does not change the design or the product", () => {
    const designCopy = JSON.parse(JSON.stringify(design)) as unknown;
    const productCopy = JSON.parse(JSON.stringify(product)) as unknown;
    render(design);
    expect(design).toEqual(designCopy);
    expect(product).toEqual(productCopy);
  });

  it("in flat mode clips each piece to its outline, on a transparent background, and strokes the outline", () => {
    const flat = render(design, "flat");
    // Inside the outline: the zone colour. The box corner outside the shoulder: transparent.
    const inside = pieceToTexture(front, { x: 280, y: 400 }, SIZE);
    expect(flat.ctx.pixel(inside.x, inside.y)).toBe(colourOf("body"));
    const corner = pieceToTexture(front, { x: 3, y: 3 }, SIZE);
    expect(flat.ctx.pixel(corner.x, corner.y)).toBe("");
    expect(flat.ctx.pixel(SIZE * 0.5, SIZE * 0.3)).toBe("");
    expect(flat.ctx.calls.filter((c) => c.op === "stroke")).toHaveLength(product.pieces.length);
  });

  it("draws in piece millimetres: one transform per piece maps (0, 0) and (width, height) to its pixel box", () => {
    const transforms: number[][] = [];
    const recorder = new RasterContext(8, 8);
    const original = recorder.setTransform.bind(recorder);
    recorder.setTransform = (...m: [number, number, number, number, number, number]) => {
      transforms.push(m);
      original(...m);
    };
    drawPatternTexture(recorder, product, design, { size: 2048 });
    const r = pieceTextureRect(front, 2048);
    const s = pieceTextureScale(front, 2048);
    expect(transforms).toContainEqual([s.x, 0, 0, s.y, r.x, r.y]);
    expect(s.x * front.width + r.x).toBeCloseTo(r.x + r.width, 9);
    expect(s.y * front.height + r.y).toBeCloseTo(r.y + r.height, 9);
  });
});
