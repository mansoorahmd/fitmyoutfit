/**
 * Template cards look like the garment (E3a-2, fault 1): a jersey with its
 * sleeves and a hem no wider than the chest, not the flat front piece (which,
 * for the stand-in jersey's front that wraps round under the side panels, is
 * widest at the hem and has no sleeves: a dress).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { composeGarmentView, garmentRows, renderGarmentView, samplerFromRgba, type GarmentView, type TextureSampler } from "./garment-view";
import { drawDesignView, drawTemplateCard, drawTemplateThumbnail } from "./thumbnail";
import { createDesign } from "../design/create";
import { setZoneColor } from "../design/edit";
import type { DesignDocument, ProductDefinition } from "../design/schema";
import type { Template } from "../design/template";
import { loadPlaceholderFonts, loadStandInJerseyProduct, loadStandInProduct } from "../test/fixtures";
import { loadGarmentMeshes } from "../test/garment-meshes";
import { RasterContext } from "../test/raster-context";

const fonts = loadPlaceholderFonts();
const jersey = loadStandInJerseyProduct();
const tshirt = loadStandInProduct();
const RED = { id: "placeholder-red", hex: "#C8102E" };
const WHITE = { id: "placeholder-white", hex: "#FFFFFF" };
const GREEN = { id: "placeholder-kelly-green", hex: "#2E9E4E" };
const jerseyMeshes = loadGarmentMeshes("stand-in-jersey.glb");
const tshirtMeshes = loadGarmentMeshes("stand-in-tshirt.glb");

function template(productId: string, id: string): Template {
  return JSON.parse(readFileSync(resolve(import.meta.dirname, `../../samples/templates/${productId}/${id}.json`), "utf8")) as Template;
}

/** A card texture drawn into the software raster context, read back as a sampler. */
function rasterTexture(size = 256) {
  const ctx = new RasterContext(size, size);
  const read = (): TextureSampler => (u, v) => {
    const hex = ctx.pixel(Math.min(size - 1, u * size), Math.min(size - 1, v * size));
    return hex.startsWith("#") ? parseInt(hex.slice(1, 7), 16) : 0x7f7f7f;
  };
  return { ctx, size, read };
}

function isGreen(r: number, g: number, b: number) {
  return g > r * 1.6 && g > b * 1.3;
}

function picture(view: GarmentView, product: ProductDefinition, design: DesignDocument) {
  const out = new Uint8ClampedArray(view.width * view.height * 4);
  drawDesignView(out, product, design, { view, texture: rasterTexture() });
  return out;
}

/** Widest row in the upper part (the sleeves), the hem's width, and green (sleeve) pixels on each side. */
function shapeOf(view: GarmentView, out: Uint8ClampedArray) {
  const rows = garmentRows(view);
  const filled = rows.map((r, y) => ({ r, y })).filter((x) => x.r !== null) as Array<{ r: { from: number; to: number }; y: number }>;
  const top = filled[0]!.y;
  const bottom = filled[filled.length - 1]!.y;
  const height = bottom - top;
  const width = (row: { from: number; to: number }) => row.to - row.from + 1;
  const upper = filled.filter((x) => x.y <= top + 0.45 * height).map((x) => width(x.r));
  const hem = filled.filter((x) => x.y >= bottom - 0.06 * height).map((x) => width(x.r));
  let greenLeft = 0;
  let greenRight = 0;
  for (let y = 0; y < view.height; y++) {
    for (let x = 0; x < view.width; x++) {
      const k = (y * view.width + x) * 4;
      if (out[k + 3]! > 200 && isGreen(out[k]!, out[k + 1]!, out[k + 2]!)) {
        if (x < view.width * 0.3) greenLeft++;
        if (x > view.width * 0.7) greenRight++;
      }
    }
  }
  return { sleeves: Math.max(...upper), hem: Math.max(...hem), greenLeft, greenRight, height };
}

describe("the garment's view buffer (renderGarmentView)", () => {
  it("covers the garment, keeps it inside the picture, and marks the inside seen through the neck", () => {
    const view = renderGarmentView(jerseyMeshes, { width: 120, height: 150 });
    expect(view.width).toBe(120);
    expect(view.kind.length).toBe(240 * 300);
    const covered = view.kind.reduce((n, k) => n + (k > 0 ? 1 : 0), 0);
    expect(covered / view.kind.length).toBeGreaterThan(0.35);
    expect(view.kind.some((k) => k === 2)).toBe(true); // the inside of the back, through the V-neck
    const rows = garmentRows(view);
    expect(rows[0]).toBeNull(); // padding round the garment
    expect(rows[149]).toBeNull();
    for (let k = 0; k < view.u.length; k++) if (view.kind[k]) expect(view.u[k]! >= 0 && view.u[k]! <= 1 && view.v[k]! >= 0 && view.v[k]! <= 1).toBe(true);
  });

  it("from the back, mirrored: the same outline, other UVs (the back piece)", () => {
    const front = renderGarmentView(jerseyMeshes, { width: 60, height: 75, supersample: 1 });
    const back = renderGarmentView(jerseyMeshes, { width: 60, height: 75, supersample: 1, side: "back" });
    const f = garmentRows(front);
    const b = garmentRows(back);
    let same = 0;
    for (let y = 0; y < 75; y++) if (f[y] && b[y] && Math.abs(f[y]!.from - (59 - b[y]!.to)) <= 2) same++;
    expect(same).toBeGreaterThan(50);
    const middle = 37 * 60 + 30;
    expect(Math.abs(front.u[middle]! - back.u[middle]!) + Math.abs(front.v[middle]! - back.v[middle]!)).toBeGreaterThan(0.01);
  });
});

describe("template cards look like the garment (fault 1)", () => {
  for (const [name, product, meshes] of [["jersey", jersey, jerseyMeshes], ["T-shirt", tshirt, tshirtMeshes]] as const) {
    it(`${name}: sleeves on both sides, a hem clearly narrower than the sleeves`, () => {
      const view = renderGarmentView(meshes, { width: 120, height: 150 });
      let design = createDesign(product, { teamColors: { main: RED, second: WHITE } });
      for (const zone of product.zones) design = setZoneColor(design, zone.id, zone.id === "sleeves" ? GREEN : RED);
      const out = picture(view, product, design);
      const shape = shapeOf(view, out);
      // A shirt: the sleeves make the upper body the widest part; the hem is clearly narrower.
      expect(shape.sleeves).toBeGreaterThan(1.3 * shape.hem);
      expect(shape.greenLeft).toBeGreaterThan(40);
      expect(shape.greenRight).toBeGreaterThan(40);
      // The garment fills most of the card's height.
      expect(shape.height).toBeGreaterThan(110);
    });
  }

  it("the old flat front of the jersey is the dress this replaces: widest at the hem, no sleeves", () => {
    const ctx = new RasterContext(120, 150);
    drawTemplateThumbnail(ctx, jersey, createDesign(jersey, { teamColors: { main: RED, second: WHITE } }), template("stand-in-jersey", "classic"), { fonts, width: 120, height: 150 });
    const widths: number[] = [];
    for (let y = 0; y < 150; y++) {
      let n = 0;
      for (let x = 0; x < 120; x++) if (ctx.pixel(x, y) !== "") n++;
      if (n > 0) widths.push(n);
    }
    expect(widths[widths.length - 2]!).toBeGreaterThanOrEqual(Math.max(...widths.slice(0, Math.floor(widths.length * 0.45))));
  });

  it("a template card: the template applied in the team's colours, its shapes and the team name on the chest", () => {
    const view = renderGarmentView(jerseyMeshes, { width: 120, height: 150 });
    const out = new Uint8ClampedArray(120 * 150 * 4);
    const start = createDesign(jersey, { teamColors: { main: RED, second: WHITE }, teamName: "LAHORE LIONS", samplePlayer: { name: "ALI", number: "9" } });
    const { design, result } = drawTemplateCard(out, jersey, start, template("stand-in-jersey", "hoops"), { fonts, view, texture: rasterTexture() });
    expect(design.template).toMatchObject({ id: "hoops" });
    expect(result.layers).toBe(3);
    // Red body and white hoops (and the white name): both show, shaded.
    let red = 0;
    let white = 0;
    for (let k = 0; k < out.length; k += 4) {
      if (out[k + 3]! < 250) continue;
      if (out[k]! > 120 && out[k + 1]! < 60) red++;
      if (out[k]! > 170 && out[k + 1]! > 170 && out[k + 2]! > 170) white++;
    }
    expect(red).toBeGreaterThan(1500);
    expect(white).toBeGreaterThan(400);
  });

  it("samples RGBA pixels by UV, nearest, clamped; an empty view is transparent", () => {
    const data = new Uint8ClampedArray([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 255, 255]);
    const s = samplerFromRgba(data, 2, 2);
    expect(s(0.1, 0.1)).toBe(0xff0000);
    expect(s(0.9, 0.1)).toBe(0x00ff00);
    expect(s(0.1, 0.9)).toBe(0x0000ff);
    expect(s(5, 5)).toBe(0xffffff);
    const empty = renderGarmentView([], { width: 4, height: 4 });
    const out = new Uint8ClampedArray(64).fill(9);
    composeGarmentView(empty, s, out);
    expect([...out].every((v) => v === 0)).toBe(true);
  });
});
