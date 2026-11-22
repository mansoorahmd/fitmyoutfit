/**
 * Readability over the whole item (E3a-2, fault 2): a team name that crosses
 * a sash is judged on the body AND on the sash, and every sample template
 * passes in both sample colour sets.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { createDesign } from "./create";
import { findLayers, placeAtPreset, setOutline } from "./roles";
import { INK_HEIGHT_EM, designReadability, itemReadability, readabilityArea, readabilityRemedy, readabilitySamples } from "./readability";
import type { DesignDocument, ProductDefinition, TeamColors } from "./schema";
import { teamColourValue } from "./team-colours";
import { applyTemplate, type Template } from "./template";
import { updateLayer } from "./edit";
import { loadMatchJerseyProduct, loadPlaceholderFonts, loadPlaceholderPalette, loadStandInJerseyProduct, loadStandInProduct } from "../test/fixtures";

const root = resolve(import.meta.dirname, "../..");
const fonts = loadPlaceholderFonts();
const jersey = loadStandInJerseyProduct();
const tshirt = loadStandInProduct();
const match = loadMatchJerseyProduct();
const RED = { id: "placeholder-red", hex: "#C8102E" };
const WHITE = { id: "placeholder-white", hex: "#FFFFFF" };
const GOLD = { id: "placeholder-gold", hex: "#F2B705" };
const NAVY = { id: "placeholder-navy", hex: "#1B2A5C" };
/** The two sample colour sets the template tests use. */
const SETS: Array<[string, TeamColors]> = [
  ["red, white and gold", { main: RED, second: WHITE, accent: GOLD }],
  ["navy and gold", { main: NAVY, second: GOLD }],
];

function templatesOf(productId: string): Template[] {
  const dir = resolve(root, "samples/templates", productId);
  const index = JSON.parse(readFileSync(resolve(dir, "index.json"), "utf8")) as { templates: string[] };
  return index.templates.map((id) => JSON.parse(readFileSync(resolve(dir, `${id}.json`), "utf8")) as Template);
}

function start(product: ProductDefinition, teamColors: TeamColors): DesignDocument {
  return createDesign(product, { teamColors, teamName: "LAHORE LIONS", samplePlayer: { name: "MUHAMMAD ALI", number: "10" } });
}

describe("the area judged", () => {
  it("is the layer box's width and the letters' height (plus the outline), turned with the item", () => {
    const layer = { position: { x: 100, y: 200 }, rotation: 90, size: { width: 300, height: 80 }, fontSize: 52, outline: undefined };
    expect(readabilityArea(layer)).toEqual({ width: 300, height: 52 * INK_HEIGHT_EM });
    expect(readabilityArea({ ...layer, outline: { color: RED, width: 2 } }).height).toBeCloseTo(52 * INK_HEIGHT_EM + 4, 9);
    // Never taller than the box.
    expect(readabilityArea({ ...layer, fontSize: 200 }).height).toBe(80);
    // Turned 90 degrees: the long side runs down the piece.
    const points = readabilitySamples(layer);
    const ys = points.map((p) => p.y);
    const xs = points.map((p) => p.x);
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(300, 6);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(52 * INK_HEIGHT_EM, 6);
  });
});

describe("a name across a sash (fault 2)", () => {
  // The sash shape as the sample template draws it, with the team name put back on the chest, across it.
  const sash = templatesOf("stand-in-jersey").find((t) => t.id === "sash")!;
  function acrossTheSash(): DesignDocument {
    let d = applyTemplate(start(jersey, SETS[0]![1]), sash, { product: jersey, fonts });
    const name = findLayers(d, { role: "team-name" })[0]!;
    if (name.preset !== "chest-centre") d = placeAtPreset(d, name.id, "chest-centre", { product: jersey });
    // White letters with a red outline: on the red body the letters show; on the white sash only the outline does.
    d = updateLayer(d, name.id, { fill: teamColourValue(d, "second") }, { product: jersey });
    return setOutline(d, name.id, { step: "medium", color: teamColourValue(d, "main") }, { product: jersey });
  }

  it("sees the body and the sash under the name, and fails it as hollow letters over part", () => {
    const d = acrossTheSash();
    const id = findLayers(d, { role: "team-name" })[0]!.id;
    const r = itemReadability(jersey, d, id)!;
    expect(r.backgrounds.map((b) => b.kind).sort()).toEqual(["shape", "zone"]);
    expect(r.background).toMatchObject({ kind: "shape", group: "sash" });
    // The letters show on the body but vanish into the sash (only the outline is left there): not readable.
    expect(r.ratio).toBeLessThan(3);
    expect(r.mixed).toBe(true);
    expect(r.passes).toBe(false);
  });

  it("an outline that stands out everywhere does not save letters that vanish on part (hollow over the sash)", () => {
    const d = acrossTheSash();
    const id = findLayers(d, { role: "team-name" })[0]!.id;
    // A black outline shows on the red body and on the white sash; the white letters still vanish on the sash.
    const outlined = setOutline(d, id, { step: "medium", color: { id: "placeholder-black", hex: "#111111" } }, { product: jersey });
    const r = itemReadability(jersey, outlined, id)!;
    expect(r.outlineRatio).toBeGreaterThanOrEqual(3);
    expect(r).toMatchObject({ mixed: true, passes: false });
  });

  it("the one-tap fix is a letter colour that stands out from the body and the sash", () => {
    const d = acrossTheSash();
    const id = findLayers(d, { role: "team-name" })[0]!.id;
    const r = itemReadability(jersey, d, id)!;
    // Red body, white sash: no team colour stands out from both (gold on white is 1.8:1); from the palette, black does.
    expect(readabilityRemedy(d, r)).toMatchObject({ kind: "fill", role: "accent" });
    const remedy = readabilityRemedy(d, r, { palette: loadPlaceholderPalette() });
    expect(remedy).toMatchObject({ kind: "fill", role: null, colour: { id: "placeholder-black" } });
    const fixed = updateLayer(d, id, { fill: remedy.colour }, { product: jersey });
    expect(itemReadability(jersey, fixed, id)).toMatchObject({ mixed: false, passes: true });
    // Navy and gold: navy body, gold sash; white letters stand out from both.
    const navy = applyTemplate(start(jersey, { main: NAVY, second: GOLD, accent: WHITE }), sash, { product: jersey, fonts });
    const n = findLayers(navy, { role: "team-name" })[0]!;
    const across = updateLayer(placeAtPreset(navy, n.id, "chest-centre", { product: jersey }), n.id, { fill: teamColourValue(navy, "second") }, { product: jersey });
    const rn = itemReadability(jersey, across, n.id)!;
    expect(rn.mixed).toBe(true);
    expect(readabilityRemedy(across, rn)).toMatchObject({ kind: "fill", role: "accent", colour: { hex: WHITE.hex, teamColor: "accent" } });
  });

  it("on one colour, the fix is an outline (Add outline)", () => {
    const d = start(jersey, SETS[1]![1]);
    const t = applyTemplate(d, templatesOf("stand-in-jersey").find((x) => x.id === "classic")!, { product: jersey, fonts });
    const name = findLayers(t, { role: "team-name" })[0]!;
    const navyOnNavy = updateLayer(t, name.id, { fill: teamColourValue(t, "main") }, { product: jersey });
    const r = itemReadability(jersey, navyOnNavy, name.id)!;
    expect(r.passes).toBe(false);
    expect(r.mixed).toBe(false);
    // E3c (B4): the letters first (white letters on navy); an outline when the coach chose the letters' colour.
    expect(readabilityRemedy(navyOnNavy, r)).toMatchObject({ kind: "fill", role: "second" });
    expect(readabilityRemedy(navyOnNavy, r, { prefer: "outline" })).toMatchObject({ kind: "outline", role: "second" });
  });
});

describe("every sample template is readable in both sample colour sets", () => {
  for (const [product, id] of [[jersey, "stand-in-jersey"], [tshirt, "stand-in-tshirt"], [match, "match-jersey-vneck"]] as const) {
    for (const t of templatesOf(id)) {
      for (const [setName, colours] of SETS) {
        it(`${id} / ${t.id} in ${setName}`, () => {
          const d = applyTemplate(start(product, colours), t, { product, fonts });
          const all = designReadability(product, d);
          expect(all.length).toBeGreaterThanOrEqual(3);
          const failing = all.filter((r) => !r.passes).map((r) => `${d.layers.find((l) => l.id === r.layerId)!.role} on ${r.background.kind === "zone" ? r.background.zoneId : r.background.group} (${r.ratio.toFixed(2)}:1${r.mixed ? ", mixed" : ""})`);
          expect(failing).toEqual([]);
          // No item that passes only by its outline over several colours: the letters show everywhere.
          expect(all.filter((r) => r.mixed)).toEqual([]);
        });
      }
    }
  }
});
