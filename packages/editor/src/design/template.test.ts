import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { createDesign } from "./create";
import { addLayer } from "./edit";
import { addCatalogFont } from "./font-catalog";
import { newLogoLayer, newTextLayer } from "./new-layers";
import { findLayers, placeAtPreset, setOutline, setRoleSlot, setSizeStep } from "./roles";
import type { DesignDocument, ProductDefinition, TeamColors } from "./schema";
import { setTeamColor, swapTeamColors, teamColourValue } from "./team-colours";
import { applyTemplate, validateTemplate, type Template } from "./template";
import { validateDesign, validateProductDefinition } from "./validate";
import { commit, createHistory, sameJson, undo } from "../state/history";
import { loadMatchJerseyProduct, loadPlaceholderFonts, loadPlaceholderPalette, loadStandInJerseyProduct, loadStandInProduct } from "../test/fixtures";

const root = resolve(import.meta.dirname, "../..");
const fonts = loadPlaceholderFonts();
const palette = loadPlaceholderPalette();
const jersey = loadStandInJerseyProduct();
const tshirt = loadStandInProduct();
const match = loadMatchJerseyProduct();

function templatesOf(productId: string): Template[] {
  const dir = resolve(root, "samples/templates", productId);
  const index = JSON.parse(readFileSync(resolve(dir, "index.json"), "utf8")) as { productId: string; templates: string[] };
  expect(index.productId).toBe(productId);
  return index.templates.map((id) => JSON.parse(readFileSync(resolve(dir, `${id}.json`), "utf8")) as Template);
}
const jerseyTemplates = templatesOf("stand-in-jersey");
const tshirtTemplates = templatesOf("stand-in-tshirt");
/** G3: the match jersey's own versions of the jersey's five (its zones and its cut). */
const matchTemplates = templatesOf("match-jersey-vneck");
const matchRoundTemplates = templatesOf("match-jersey-round");
const matchRound = validateProductDefinition(JSON.parse(readFileSync(resolve(root, "samples/products/match-jersey-round.json"), "utf8")) as unknown);
const byId = (list: Template[], id: string) => list.find((t) => t.id === id)!;
/**
 * The sample hoops, with the medium Main outline on the number that it set until E3a-2 (its number now
 * sits on a plain back panel and needs none): the engine tests below need a template that sets an outline.
 */
const outlinedHoops = (t: Template): Template => ({
  ...t,
  slots: t.slots.map((slot) => (slot.role === "player-number" ? { ...slot, style: { ...slot.style, outline: { step: "medium", color: { team: "main" } } } } : slot)),
});

const RED = { id: "placeholder-red", hex: "#C8102E" };
const WHITE = { id: "placeholder-white", hex: "#FFFFFF" };
const GOLD = { id: "placeholder-gold", hex: "#F2B705" };
const NAVY = { id: "placeholder-navy", hex: "#1B2A5C" };
const SETS: Array<[string, TeamColors]> = [
  ["red, white and gold", { main: RED, second: WHITE, accent: GOLD }],
  ["navy and gold", { main: NAVY, second: GOLD }],
];

function start(product: ProductDefinition, teamColors: TeamColors = SETS[0]![1]): DesignDocument {
  return createDesign(product, { teamColors, teamName: "LAHORE LIONS", samplePlayer: { name: "محمد علی", number: "٧" } });
}

const value = (l: DesignDocument["layers"][number] | undefined) => (l && (l.kind === "text" || l.kind === "number") ? l.value : undefined);

describe("the sample templates", () => {
  it("five for the jersey, three for the T-shirt, each a valid template for its product and fonts", () => {
    expect(jerseyTemplates.map((t) => t.id)).toEqual(["classic", "hoops", "stripes", "sash", "chevron"]);
    expect(tshirtTemplates.map((t) => t.id)).toEqual(["plain", "contrast", "band"]);
    expect(matchTemplates.map((t) => t.id)).toEqual(["classic", "hoops", "stripes", "sash", "chevron"]);
    for (const [product, list] of [[jersey, jerseyTemplates], [tshirt, tshirtTemplates], [match, matchTemplates], [matchRound.ok ? matchRound.value : match, matchRoundTemplates]] as const) {
      for (const t of list) {
        const r = validateTemplate(t, { product, fonts });
        expect(r.ok, `${t.id}: ${r.ok ? "" : r.errors.map((e) => e.message).join("; ")}`).toBe(true);
        expect(t.about).toMatch(/Placeholder template drawn by us/);
      }
    }
    // Every file in the folders is listed.
    expect(readdirSync(resolve(root, "samples/templates/stand-in-jersey")).length).toBe(jerseyTemplates.length + 1);
    expect(readdirSync(resolve(root, "samples/templates/match-jersey-vneck")).length).toBe(matchTemplates.length + 1);
  });

  it("the hoops, stripes, sash and chevron carry shapes; hoops run round the front, back and both side panels", () => {
    const shapesOn = (id: string) => new Set(byId(jerseyTemplates, id).shapes.map((s) => s.pieceId));
    expect([...shapesOn("hoops")].sort()).toEqual(["back", "front", "side_panel_left", "side_panel_right"]);
    expect([...shapesOn("stripes")].sort()).toEqual(["back", "front"]);
    expect([...shapesOn("sash")]).toEqual(["front"]);
    expect([...shapesOn("chevron")]).toEqual(["front"]);
    expect(byId(jerseyTemplates, "classic").shapes).toEqual([]);
  });

  it("the match jersey's hoops also run round the front, back and both side panels, its sash and chevron on the front", () => {
    const shapesOn = (id: string) => new Set(byId(matchTemplates, id).shapes.map((s) => s.pieceId));
    expect([...shapesOn("hoops")].sort()).toEqual(["back", "front", "side_panel_left", "side_panel_right"]);
    expect([...shapesOn("sash")]).toEqual(["front"]);
    expect([...shapesOn("chevron")]).toEqual(["front"]);
  });

  for (const [product, list] of [[jersey, jerseyTemplates], [tshirt, tshirtTemplates], [match, matchTemplates]] as const) {
    for (const t of list) {
      for (const [setName, teamColors] of SETS) {
        it(`${product.id} / ${t.id} in ${setName}: applies, valid, on the palette, colours follow the team, names and number at their presets`, () => {
          const d = applyTemplate(start(product, teamColors), t, { product, fonts });
          expect(validateDesign(d, { product, palette }).ok).toBe(true);
          expect(d.template).toEqual({ id: t.id, version: t.version });
          for (const [zone, colour] of Object.entries(t.zones)) {
            if ("team" in colour) {
              const role = colour.team === "accent" && !teamColors.accent ? "second" : colour.team;
              expect(d.zones[zone]).toEqual({ ...teamColors[role]!, teamColor: role });
            }
          }
          expect(d.shapes).toHaveLength(t.shapes.length);
          expect(d.shapes.every((s) => s.locked)).toBe(true);
          // The sash crosses the chest, so its template puts the team name on the upper back (E3a-2, readability).
          expect(findLayers(d, { role: "team-name" })).toMatchObject([{ preset: t.id === "sash" ? "upper-back" : "chest-centre", value: "LAHORE LIONS" }]);
          expect(findLayers(d, { role: "player-name" })).toMatchObject([{ preset: "back-name", value: "محمد علی" }]);
          expect(findLayers(d, { role: "player-number" })).toMatchObject([{ preset: "back-number", value: "٧", pieceId: "back" }]);
        });
      }
    }
  }
});

describe("applyTemplate: what is kept and what changes (06-editor.md 4.1)", () => {
  const hoops = outlinedHoops(byId(jerseyTemplates, "hoops"));
  const classic = byId(jerseyTemplates, "classic");

  /** Classic, then a crest on the left chest, a sponsor text, and the coach's own outline on the name. */
  function coached(): DesignDocument {
    let d = applyTemplate(start(jersey), classic, { product: jersey, fonts });
    d = addLayer(d, newLogoLayer(jersey, { id: "crest", preset: "left-chest", asset: { assetId: "upload-1", mediaType: "image/png", width: 800, height: 800 } }), { product: jersey });
    d = addCatalogFont(d, fonts, "oswald-700");
    d = addLayer(d, newTextLayer(jersey, { id: "sponsor", role: "sponsor", preset: "lower-back", value: "ACME", fontId: "oswald-700", fill: NAVY }), { product: jersey });
    const nameId = findLayers(d, { role: "player-name" })[0]!.id;
    d = setOutline(d, nameId, { step: "thick", color: teamColourValue(d, "main") }, { product: jersey });
    return d;
  }

  it("keeps the team colours, the team name, every logo with its preset, free text, the sample player", () => {
    const before = coached();
    const after = applyTemplate(before, hoops, { product: jersey, fonts, previous: classic });
    expect(after.teamColors).toEqual(before.teamColors);
    expect(after.teamName).toBe("LAHORE LIONS");
    expect(after.samplePlayer).toEqual(before.samplePlayer);
    expect(after.layers.find((l) => l.id === "crest")).toEqual(before.layers.find((l) => l.id === "crest"));
    expect(after.layers.find((l) => l.id === "sponsor")).toEqual(before.layers.find((l) => l.id === "sponsor"));
  });

  it("keeps style choices the template leaves open (the coach's outline on the name) and takes the ones it sets", () => {
    const before = coached();
    const after = applyTemplate(before, hoops, { product: jersey, fonts, previous: classic });
    const name = findLayers(after, { role: "player-name" })[0] as Extract<DesignDocument["layers"][number], { kind: "text" }>;
    // Hoops does not set the name's outline: the coach's thick Main outline stays.
    expect(name.outline?.color).toEqual({ ...RED, teamColor: "main" });
    // Hoops sets the number's outline (medium, Main): it changes.
    const number = findLayers(after, { role: "player-number" })[0] as Extract<DesignDocument["layers"][number], { kind: "number" }>;
    expect(number.outline).toEqual({ color: { ...RED, teamColor: "main" }, width: expect.any(Number) });
    // Layer ids stay, so a selection survives the switch.
    expect(findLayers(after, { role: "player-name" })[0]!.id).toBe(findLayers(before, { role: "player-name" })[0]!.id);
  });

  it("changes the layout: zone colours, shapes, the slots' positions and fonts", () => {
    const before = coached();
    const moved = placeAtPreset(before, findLayers(before, { role: "player-number" })[0]!.id, "back-number", { product: jersey });
    const after = applyTemplate(moved, byId(jerseyTemplates, "stripes"), { product: jersey, fonts, previous: classic });
    expect(after.zones.sleeves).toEqual({ ...WHITE, teamColor: "second" });
    expect(after.shapes.length).toBeGreaterThan(5);
    // The stripes, the plain chest band for the team name and the back's panel for the name and number.
    expect(new Set(after.shapes.map((s) => s.group))).toEqual(new Set(["stripes", "band", "panel"]));
    const shapeIds = new Set(after.shapes.map((s) => s.id));
    expect(after.layers.some((l) => shapeIds.has(l.id))).toBe(false);
  });

  it("keeps the coach's own switches: a number turned on at the front, a team name turned off or moved", () => {
    let d = coached();
    d = setRoleSlot(d, "player-number", "front-number", true, { product: jersey });
    d = setRoleSlot(d, "team-name", "chest-centre", false, { product: jersey });
    const after = applyTemplate(d, hoops, { product: jersey, fonts, previous: classic });
    expect(findLayers(after, { role: "player-number" }).map((l) => l.preset).sort()).toEqual(["back-number", "front-number"]);
    expect(findLayers(after, { role: "team-name" })).toEqual([]);
    expect(after.teamName).toBe("LAHORE LIONS");
    // Moved to the upper back: stays there.
    const movedName = placeAtPreset(coached(), findLayers(coached(), { role: "team-name" })[0]!.id, "upper-back", { product: jersey });
    const after2 = applyTemplate(movedName, hoops, { product: jersey, fonts, previous: classic });
    expect(findLayers(after2, { role: "team-name" }).map((l) => l.preset)).toEqual(["upper-back"]);
    // Without the previous template: the new template's slots, except a role turned off, which stays off.
    const after3 = applyTemplate(movedName, hoops, { product: jersey, fonts });
    expect(findLayers(after3, { role: "team-name" }).map((l) => l.preset)).toEqual(["chest-centre"]);
  });

  it("keeps a size step the template does not set", () => {
    const d = coached();
    const id = findLayers(d, { role: "team-name" })[0]!.id;
    const large = setSizeStep(d, id, "large", { product: jersey });
    const after = applyTemplate(large, hoops, { product: jersey, fonts, previous: classic });
    expect((findLayers(after, { role: "team-name" })[0] as { fontSize: number }).fontSize).toBeCloseTo(52 * 1.25, 3);
  });

  it("is one undo step, and undo gives the design back exactly", () => {
    const before = coached();
    let h = commit(createHistory(before, { equals: sameJson }), applyTemplate(before, hoops, { product: jersey, fonts, previous: classic }), "template");
    expect(h.past).toHaveLength(1);
    h = undo(h);
    expect(h.present).toEqual(before);
  });

  it("recolours with the team: changing Main or swapping after a template recolours the shapes and slots that follow", () => {
    const d = applyTemplate(start(jersey), hoops, { product: jersey, fonts });
    const swapped = swapTeamColors(d);
    expect(swapped.shapes.filter((s) => s.group === "hoops").every((s) => s.fill.hex === RED.hex)).toBe(true);
    // The back's number panel follows Main: white after the swap.
    expect(swapped.shapes.filter((s) => s.group === "panel").map((s) => s.fill.hex)).toEqual([WHITE.hex]);
    expect(swapped.zones.body_front!.hex).toBe(WHITE.hex);
    const maroon = setTeamColor(d, "main", { id: "placeholder-maroon", hex: "#6E1E2C" });
    expect(maroon.zones.body_front!.hex).toBe("#6E1E2C");
    expect(validateDesign(maroon, { product: jersey, palette }).ok).toBe(true);
  });

  it("gives a number from the template when the sample player has none", () => {
    const d = applyTemplate(createDesign(jersey), classic, { product: jersey, fonts });
    expect(d.samplePlayer.number).toBe("10");
    expect(value(findLayers(d, { role: "player-number" })[0])).toBe("10");
  });

  it("refuses a template for another product, one missing a zone, with an unknown preset or font", () => {
    const bad = (mutate: (t: any) => void, product: ProductDefinition = jersey) => {
      const t = JSON.parse(JSON.stringify(classic));
      mutate(t);
      return () => applyTemplate(start(product), t, { product, fonts });
    };
    expect(bad(() => undefined, tshirt)).toThrow(/is for "stand-in-jersey", not "stand-in-tshirt"/);
    expect(bad((t) => delete t.zones.cuffs)).toThrow(/has no colour for the product's zone "cuffs"/);
    expect(bad((t) => (t.slots[0].preset = "pocket"))).toThrow(/no placement preset "pocket"/);
    expect(bad((t) => (t.slots[0].preset = "back-number"))).toThrow(/takes player-number, not the team-name/);
    expect(bad((t) => (t.slots[0].style.fontId = "comic-sans"))).toThrow(/font "comic-sans" is not in the font catalogue/);
    expect(bad((t) => t.shapes.push({ group: "x", pieceId: "front", path: "M 900 900 H 950 V 950 Z", fill: { team: "main" } }))).toThrow(/lies outside piece "front"/);
    expect(bad((t) => (t.sampleNumber = "100"))).toThrow(/more than 2 digits/);
  });
});

describe("applyTemplate: what the previous template set is not the coach's choice", () => {
  const hoops = outlinedHoops(byId(jerseyTemplates, "hoops"));
  const classic = byId(jerseyTemplates, "classic");

  it("drops the previous template's number outline when the new template leaves outlines open; keeps one the coach changed", () => {
    const onHoops = applyTemplate(start(jersey), hoops, { product: jersey, fonts });
    const number = () => findLayers(onHoops, { role: "player-number" })[0] as Extract<DesignDocument["layers"][number], { kind: "number" }>;
    expect(number().outline).toBeDefined(); // hoops sets a medium Main outline on the number
    const back = applyTemplate(onHoops, classic, { product: jersey, fonts, previous: hoops });
    expect((findLayers(back, { role: "player-number" })[0] as typeof number extends () => infer L ? L : never).outline).toBeUndefined();
    // The coach made it thick and gold: that is a choice, and it stays.
    const coached = setOutline(onHoops, number().id, { step: "thick", color: teamColourValue(onHoops, "accent") }, { product: jersey });
    const kept = applyTemplate(coached, classic, { product: jersey, fonts, previous: hoops });
    expect((findLayers(kept, { role: "player-number" })[0] as { outline?: unknown }).outline).toEqual({ color: { ...GOLD, teamColor: "accent" }, width: expect.any(Number) });
  });
});
