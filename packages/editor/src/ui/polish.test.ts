/**
 * E3b part 1, the polish from the review of E3a-2: the model credit's form,
 * readability warnings that name their item and never stack, and the flat
 * view drawn as the garment (front and back) with taps that select.
 */
import { describe, expect, it } from "vitest";
import { createDesign } from "../design/create";
import { addCatalogFont } from "../design/font-catalog";
import { setRoleSlot } from "../design/roles";
import type { DesignDocument } from "../design/schema";
import { composeGarmentView, renderGarmentView } from "../texture/garment-view";
import { loadPlaceholderFonts, loadPlaceholderPalette, loadStandInJerseyProduct } from "../test/fixtures";
import { loadGarmentMeshes } from "../test/garment-meshes";
import { readabilityWarnings } from "./checks";
import { EDITOR_WORDING as W } from "./content";
import { flatViewPlaces, garmentAspect, itemAtViewPoint } from "./FlatView";
import { itemWords } from "./items";
import { creditForm } from "./stage-logic";

const product = loadStandInJerseyProduct();
const palette = loadPlaceholderPalette();
const fonts = loadPlaceholderFonts();
const NAVY = { id: "placeholder-navy", hex: "#1B2A5C" };
const WHITE = { id: "placeholder-white", hex: "#FFFFFF" };

/** A navy kit with navy numbers front and back and a navy name: every letter hard to read. */
function navyOnNavy(): DesignDocument {
  let d = createDesign(product, { teamName: "TIGERS", samplePlayer: { name: "ALI RAZA", number: "10" }, teamColors: { main: NAVY, second: WHITE } });
  for (const zone of Object.keys(d.zones)) d = { ...d, zones: { ...d.zones, [zone]: { ...NAVY } } };
  const style = { fontId: "oswald-700", fill: { ...NAVY } };
  d = addCatalogFont(d, fonts, "oswald-700");
  d = addCatalogFont(d, fonts, "graduate-400");
  d = setRoleSlot(d, "player-name", "back-name", true, { product, fonts, style });
  d = setRoleSlot(d, "player-number", "back-number", true, { product, fonts, style: { fontId: "graduate-400", fill: { ...NAVY } } });
  d = setRoleSlot(d, "player-number", "front-number", true, { product, fonts, style: { fontId: "graduate-400", fill: { ...NAVY } } });
  d = setRoleSlot(d, "team-name", "chest-centre", true, { product, fonts, style });
  return d;
}

describe("the model credit (part 1, point 2)", () => {
  it("is one line: the whole credit where it fits, the short form (with the full one behind a button) on a phone", () => {
    expect(creditForm(360)).toBe("short");
    expect(creditForm(390)).toBe("short");
    expect(creditForm(780)).toBe("full"); // a phone in landscape: the stage beside the rail
    expect(creditForm(918)).toBe("full"); // 1366 wide, beside the rail and the panel
  });
});

describe("readability warnings name their item (part 1, point 4)", () => {
  it("each says which item and where, in the wording module's sentence", () => {
    const warnings = readabilityWarnings(W, product, navyOnNavy(), palette);
    const texts = warnings.map((w) => w.text);
    expect(texts).toContain("Player name on the back is hard to read on Navy.");
    expect(texts).toContain("Number on the back is hard to read on Navy.");
    expect(texts).toContain("Number on the front is hard to read on Navy.");
    expect(texts).toContain("Team name on the chest is hard to read on Navy.");
    // Never two identical warnings.
    expect(new Set(texts).size).toBe(texts.length);
  });

  it("two items with the same words share one warning, and its fix covers both", () => {
    let d = navyOnNavy();
    // A second number on the back, at the same preset: the same words.
    const number = d.layers.find((l) => l.role === "player-number" && l.preset === "back-number")!;
    d = { ...d, layers: [...d.layers, { ...number, id: "number-twin", position: { ...number.position, y: number.position.y + 5 } }] };
    const backNumbers = readabilityWarnings(W, product, d, palette).filter((w) => w.text.startsWith("Number on the back"));
    expect(backNumbers).toHaveLength(1);
    expect(backNumbers[0]!.layerIds).toEqual(expect.arrayContaining([number.id, "number-twin"]));
  });

  it("filters by role for a tool (Players shows names and numbers, not the team name)", () => {
    const players = readabilityWarnings(W, product, navyOnNavy(), palette, ["player-name", "player-number"]).map((w) => w.text);
    expect(players.some((t) => t.startsWith("Team name"))).toBe(false);
    expect(players).toHaveLength(3);
  });

  it("item words: the role, the value or file, and where", () => {
    const d = navyOnNavy();
    const team = d.layers.find((l) => l.role === "team-name")!;
    expect(itemWords(W, product, team)).toMatchObject({ kind: "Team name", name: "Team name: TIGERS", where: "Chest", at: "Team name on the chest" });
    const logo = { id: "crest", kind: "logo" as const, role: "crest" as const, pieceId: "front", preset: "left-chest", position: { x: 440, y: 200 }, size: { width: 80, height: 80 }, rotation: 0, asset: { assetId: "a1", mediaType: "image/png" as const, width: 600, height: 600 } };
    expect(itemWords(W, product, logo, { fileName: () => "crest.png" })).toMatchObject({ name: "Logo: crest.png", where: "Left chest", at: "Logo on the left chest" });
    // Off any preset: the piece's name.
    expect(itemWords(W, product, { ...logo, preset: undefined, pieceId: "sleeve_left" }).where).toBe("Left sleeve");
  });
});

describe("the flat view is the garment, front and back (part 1, point 5)", () => {
  const meshes = loadGarmentMeshes("stand-in-jersey.glb");

  it("lays the two views out where the garment shows largest: side by side on a wide stage, stacked on a tall phone", () => {
    const aspect = garmentAspect(meshes);
    expect(aspect).toBeGreaterThan(0.6);
    expect(aspect).toBeLessThan(1.4);
    const wide = flatViewPlaces(900, 700, aspect);
    expect(wide.stacked).toBe(false);
    expect(wide.back.x).toBeGreaterThanOrEqual(wide.front.x + wide.front.w);
    expect(wide.back.x + wide.back.w).toBeLessThanOrEqual(900);
    const tall = flatViewPlaces(366, 640, aspect);
    expect(tall.stacked).toBe(true);
    expect(tall.back.y).toBeGreaterThanOrEqual(tall.front.y + tall.front.h);
    expect(tall.back.y + tall.back.h).toBeLessThanOrEqual(640);
    // Stacked shows each garment larger than side by side would on that phone.
    const sideBySideWidth = (366 - Math.round(366 * 0.03)) / 2;
    expect(tall.front.w).toBeGreaterThan(sideBySideWidth);
    // Every place keeps the garment's proportions and leaves room for its caption above.
    for (const p of [wide.front, wide.back, tall.front, tall.back]) {
      expect(p.y).toBeGreaterThanOrEqual(20);
      expect(Math.abs(p.w / p.h - aspect)).toBeLessThan(0.05);
    }
  });

  it("a tap on an item in the front or the back view selects it; a tap on bare fabric or beside the garment selects nothing", () => {
    const d = navyOnNavy();
    const front = renderGarmentView(meshes, { width: 180, height: 220, side: "front", supersample: 1 });
    const back = renderGarmentView(meshes, { width: 180, height: 220, side: "back", supersample: 1 });
    // Find, by scanning, the pixels whose UV lies on the front number and on the back name.
    const find = (view: typeof front, layerId: string) => {
      for (let y = 0; y < view.height; y++) for (let x = 0; x < view.width; x++) if (itemAtViewPoint(product, d, view, x + 0.5, y + 0.5, 0)?.layerId === layerId) return { x, y };
      return null;
    };
    const frontNumber = d.layers.find((l) => l.role === "player-number" && l.preset === "front-number")!;
    const backName = d.layers.find((l) => l.role === "player-name")!;
    const onNumber = find(front, frontNumber.id);
    expect(onNumber).not.toBeNull();
    // The number sits in the middle of the chest, below the team name.
    expect(onNumber!.x).toBeGreaterThan(front.width * 0.3);
    expect(onNumber!.x).toBeLessThan(front.width * 0.7);
    expect(find(back, backName.id)).not.toBeNull();
    // A corner of the picture is background; the hem is fabric with nothing on it.
    expect(itemAtViewPoint(product, d, front, 1, 1)).toBeNull();
    const hem = itemAtViewPoint(product, d, front, front.width / 2, front.height * 0.9, 0);
    expect(hem).not.toBeNull();
    expect(hem!.layerId).toBeNull();
  });
});

describe("the flat view's inside of the neck (part 1, point 5)", () => {
  it("is coloured by its own sampler, so a print on the back does not show, mirrored, through the neck", () => {
    const meshes = loadGarmentMeshes("stand-in-jersey.glb");
    const view = renderGarmentView(meshes, { width: 120, height: 150, side: "front", supersample: 1 });
    const insideAt = view.kind.findIndex((k) => k === 2);
    expect(insideAt).toBeGreaterThanOrEqual(0);
    const out = new Uint8ClampedArray(view.width * view.height * 4);
    composeGarmentView(view, () => 0xff0000, out, () => 0x0000ff);
    // The inside pixel is blue (the inside sampler), an outside one red.
    expect(out[insideAt * 4 + 2]).toBeGreaterThan(out[insideAt * 4]!);
    const outsideAt = view.kind.findIndex((k) => k === 1);
    expect(out[outsideAt * 4]).toBeGreaterThan(out[outsideAt * 4 + 2]!);
  });
});
