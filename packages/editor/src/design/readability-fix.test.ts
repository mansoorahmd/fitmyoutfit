/**
 * The readability fix (E3c, B4): the one-tap fix always ends with the item
 * passing the rule, whatever the garment and letter colours; and a design,
 * when it is applied, starts without warnings, in every sample template and
 * every pair of team colours.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { createDesign } from "./create";
import { updateLayer } from "./edit";
import { paletteColourRef } from "./palette";
import { applyReadabilityRemedy, designReadability, itemReadability, makeReadable, readabilityRemedy } from "./readability";
import { findLayers, setOutline, setSamplePlayer, setTeamName } from "./roles";
import type { DesignDocument, ProductDefinition } from "./schema";
import { setTeamColor, swapTeamColors } from "./team-colours";
import { applyTemplate, type Template } from "./template";
import { validateDesign } from "./validate";
import { loadPlaceholderFonts, loadPlaceholderPalette, loadStandInJerseyProduct, loadStandInProduct } from "../test/fixtures";
import { EDITOR_WORDING } from "../ui/content";
import { remedyWords } from "../ui/checks";

const root = resolve(import.meta.dirname, "../..");
const fonts = loadPlaceholderFonts();
const palette = loadPlaceholderPalette();
const jersey = loadStandInJerseyProduct();
const tshirt = loadStandInProduct();
const colour = (id: string) => paletteColourRef(palette.colors.find((c) => c.id === id)!);

function templatesOf(productId: string): Template[] {
  const dir = resolve(root, "samples/templates", productId);
  const index = JSON.parse(readFileSync(resolve(dir, "index.json"), "utf8")) as { templates: string[] };
  return index.templates.map((id) => JSON.parse(readFileSync(resolve(dir, `${id}.json`), "utf8")) as Template);
}

function kit(product: ProductDefinition, template: Template): DesignDocument {
  const d = createDesign(product, { teamName: "LAHORE LIONS", samplePlayer: { name: "MUHAMMAD ALI", number: "10" } });
  return applyTemplate(d, template, { product, fonts });
}

describe("the one-tap fix always passes (B4)", () => {
  it("every palette colour as the garment x every palette colour as the letters: after the fix the item passes", () => {
    const base = kit(jersey, templatesOf("stand-in-jersey").find((t) => t.id === "classic")!);
    const number = findLayers(base, { role: "player-number" }).find((l) => l.pieceId === "back")!;
    // QA's team: red and navy.
    const team = setTeamColor(setTeamColor(base, "main", colour("placeholder-red")), "second", colour("placeholder-navy"));
    let failing = 0;
    for (const garment of palette.colors) {
      for (const letters of palette.colors) {
        const d = updateLayer({ ...team, zones: { ...team.zones, body_back: paletteColourRef(garment) } }, number.id, { fill: paletteColourRef(letters) }, { product: jersey });
        const r = itemReadability(jersey, d, number.id)!;
        if (r.passes) continue;
        failing++;
        for (const prefer of ["letters", "outline"] as const) {
          const remedy = readabilityRemedy(d, r, { palette, prefer });
          const fixed = applyReadabilityRemedy(d, [number.id], remedy, { product: jersey });
          expect(itemReadability(jersey, fixed, number.id)!.passes, `${letters.name} on ${garment.name}, ${prefer}: ${remedy.kind} ${remedy.colour.id}`).toBe(true);
          // The coach's own letters are kept when they chose them.
          if (prefer === "outline") expect(remedy.kind).toBe("outline");
        }
      }
    }
    expect(failing).toBeGreaterThan(100);
  }, 60_000);

  it("QA's case: navy on navy with a red and navy team gets white, never red, and the button says so", () => {
    const base = kit(jersey, templatesOf("stand-in-jersey").find((t) => t.id === "classic")!);
    const navy = colour("placeholder-navy");
    let d = setTeamColor(setTeamColor(base, "main", navy), "second", colour("placeholder-red"));
    const number = findLayers(d, { role: "player-number" }).find((l) => l.pieceId === "back")!;
    d = updateLayer(d, number.id, { fill: navy }, { product: jersey });
    const r = itemReadability(jersey, d, number.id)!;
    expect(r.passes).toBe(false);
    const letters = readabilityRemedy(d, r, { palette });
    expect(letters).toMatchObject({ kind: "fill", colour: { id: "placeholder-white" } });
    expect(remedyWords(EDITOR_WORDING, palette, letters)).toBe("Use white letters");
    const outline = readabilityRemedy(d, r, { palette, prefer: "outline" });
    expect(outline).toMatchObject({ kind: "outline", colour: { id: "placeholder-white" } });
    expect(remedyWords(EDITOR_WORDING, palette, outline)).toBe("Add white outline");
    for (const remedy of [letters, outline]) expect(itemReadability(jersey, applyReadabilityRemedy(d, [number.id], remedy, { product: jersey }), number.id)!.passes).toBe(true);
  });

  it("new letters in the colour of their outline drop the outline (it would hide them)", () => {
    const base = kit(jersey, templatesOf("stand-in-jersey")[0]!);
    const name = findLayers(base, { role: "team-name" })[0]!;
    const white = colour("placeholder-white");
    const d = setOutline(base, name.id, { step: "thin", color: white }, { product: jersey });
    const fixed = applyReadabilityRemedy(d, [name.id], { kind: "fill", role: null, colour: white, ratio: 10 }, { product: jersey });
    expect(fixed.layers.find((l) => l.id === name.id)).not.toHaveProperty("outline");
  });
});

describe("a design starts without warnings (B4, the first impression)", () => {
  for (const [product, id] of [
    [jersey, "stand-in-jersey"],
    [tshirt, "stand-in-tshirt"],
  ] as const) {
    for (const template of templatesOf(id)) {
      it(`${id} / ${template.id}: every ordered pair of palette colours as Main and Second`, () => {
        const base = kit(product, template);
        let pairs = 0;
        for (const main of palette.colors) {
          for (const second of palette.colors) {
            if (main.id === second.id) continue;
            // The start card: team colours on the applied template; then made readable.
            const d = makeReadable(product, setTeamColor(setTeamColor(base, "main", paletteColourRef(main)), "second", paletteColourRef(second)), palette);
            const failing = designReadability(product, d).filter((r) => !r.passes);
            expect(failing.map((r) => r.layerId), `${main.name} and ${second.name}`).toEqual([]);
            pairs++;
          }
        }
        expect(pairs).toBe(palette.colors.length * (palette.colors.length - 1));
      }, 120_000);
    }
  }

  it("the red-and-navy kit QA opened starts with no warning, stays valid, and a swap too", () => {
    for (const [product, id] of [
      [jersey, "stand-in-jersey"],
      [tshirt, "stand-in-tshirt"],
    ] as const) {
      for (const template of templatesOf(id)) {
        let d = setTeamColor(setTeamColor(kit(product, template), "main", colour("placeholder-red")), "second", colour("placeholder-navy"));
        d = makeReadable(product, d, palette);
        expect(designReadability(product, d).filter((r) => !r.passes)).toEqual([]);
        expect(validateDesign(d, { product, palette }).ok).toBe(true);
        const swapped = makeReadable(product, swapTeamColors(d), palette);
        expect(designReadability(product, swapped).filter((r) => !r.passes)).toEqual([]);
      }
    }
   }, 60_000);

  it("a slot still empty when the colours are chosen (the team name typed after them) is made readable too", () => {
    const empty = applyTemplate(createDesign(jersey, { teamName: "", samplePlayer: { name: "", number: "10" } }), templatesOf("stand-in-jersey").find((t) => t.id === "classic")!, { product: jersey, fonts });
    const d = makeReadable(jersey, setTeamColor(setTeamColor(empty, "main", colour("placeholder-red")), "second", colour("placeholder-navy")), palette);
    const named = setTeamName(setSamplePlayer(d, { name: "MUHAMMAD ALI" }), "TIGERS");
    expect(designReadability(jersey, named).filter((r) => !r.passes)).toEqual([]);
  });

  it("never overrides a colour the coach chose (their warning shows instead)", () => {
    const base = kit(jersey, templatesOf("stand-in-jersey").find((t) => t.id === "classic")!);
    const navy = colour("placeholder-navy");
    const number = findLayers(base, { role: "player-number" }).find((l) => l.pieceId === "back")!;
    const chosen = updateLayer({ ...base, zones: { ...base.zones, body_back: navy } }, number.id, { fill: navy }, { product: jersey });
    const kept = makeReadable(jersey, chosen, palette, { keep: new Set([number.id]) });
    expect(kept.layers.find((l) => l.id === number.id)).toEqual(chosen.layers.find((l) => l.id === number.id));
    expect(itemReadability(jersey, kept, number.id)!.passes).toBe(false);
    // Without the coach's choice it is made readable; a design that reads well is left as it is.
    const fixed = makeReadable(jersey, chosen, palette);
    expect(itemReadability(jersey, fixed, number.id)!.passes).toBe(true);
    expect(makeReadable(jersey, fixed, palette)).toBe(fixed);
  });
});
