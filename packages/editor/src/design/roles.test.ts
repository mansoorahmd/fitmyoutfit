import { describe, expect, it } from "vitest";
import { createDesign } from "./create";
import { addCatalogFont } from "./font-catalog";
import {
  designForPlayer,
  findLayers,
  findRoleLayersOnSide,
  isRoleSlotOn,
  layerSide,
  outlineWidthMm,
  placeAtPreset,
  setOutline,
  setRoleSlot,
  setSamplePlayer,
  setSizeStep,
  setTeamName,
  sizeStepOf,
  type LetteringStyle,
} from "./roles";
import type { DesignDocument, Layer } from "./schema";
import { teamColourValue } from "./team-colours";
import { validateDesign } from "./validate";
import { newLogoLayer } from "./new-layers";
import { addLayer } from "./edit";
import { loadPlaceholderFonts, loadStandInJerseyProduct } from "../test/fixtures";

const product = loadStandInJerseyProduct();
const fonts = loadPlaceholderFonts();
const NAVY = { id: "placeholder-navy", hex: "#1B2A5C" };

const nameStyle: LetteringStyle = { fontId: "oswald-700", fill: NAVY };
const numberStyle: LetteringStyle = { fontId: "graduate-400", fill: NAVY, outline: { step: "thin", color: { id: "placeholder-white", hex: "#FFFFFF" } } };

/** A kit with the team name on the chest, the player's name and number on the back. */
function kit(): DesignDocument {
  let d = createDesign(product);
  d = setTeamName(d, "TIGERS");
  d = setSamplePlayer(d, { name: "ALI", number: "10" });
  d = setRoleSlot(d, "team-name", "chest-centre", true, { product, fonts, style: nameStyle });
  d = setRoleSlot(d, "player-name", "back-name", true, { product, fonts, style: nameStyle });
  d = setRoleSlot(d, "player-number", "back-number", true, { product, fonts, style: numberStyle });
  return d;
}

const value = (layer: Layer | undefined) => (layer && (layer.kind === "text" || layer.kind === "number") ? layer.value : undefined);

describe("roles: find the player's name and number without guessing from positions", () => {
  it("finds the number on the back, and the name, by role and side", () => {
    const d = kit();
    const [number] = findRoleLayersOnSide(d, product, "player-number", "back");
    expect(number).toMatchObject({ kind: "number", role: "player-number", preset: "back-number", pieceId: "back", value: "10" });
    expect(findRoleLayersOnSide(d, product, "player-number", "front")).toEqual([]);
    expect(findLayers(d, { role: "player-name" }).map(value)).toEqual(["ALI"]);
    expect(findLayers(d, { role: "team-name", preset: "chest-centre" }).map(value)).toEqual(["TIGERS"]);
    expect(validateDesign(d, { product }).ok).toBe(true);
  });

  it("knows the side of a layer from its preset, or from the presets on its piece", () => {
    expect(layerSide(product, { pieceId: "sleeve_left", preset: "sleeve-left" })).toBe("left");
    expect(layerSide(product, { pieceId: "sleeve_right" })).toBe("right");
    expect(layerSide(product, { pieceId: "back" })).toBe("back");
    expect(layerSide(product, { pieceId: "collar" })).toBeNull();
  });
});

describe("designForPlayer: the roster preview's swap", () => {
  it.each([
    ["Latin, English digits", "Hamza Khan", "7"],
    ["Urdu, Arabic-Indic digits", "محمد علی", "٧"],
    ["Arabic, Extended Arabic-Indic (Urdu-form) digits", "عبدالله الهاشمي", "۲۳"],
    ["Latin, leading zero", "O'Neil", "07"],
  ])("%s: every player-name and player-number layer shows the player, nothing else changes", (_, name, number) => {
    let d = kit();
    d = setRoleSlot(d, "player-number", "front-number", true, { product }); // a second number layer
    const p = designForPlayer(d, { name, number });
    expect(findLayers(p, { role: "player-name" }).map(value)).toEqual([name.normalize("NFC")]);
    expect(findLayers(p, { role: "player-number" }).map(value)).toEqual([number, number]);
    expect(findLayers(p, { role: "team-name" }).map(value)).toEqual(["TIGERS"]);
    expect(p.samplePlayer).toEqual({ name: name.normalize("NFC"), number });
    expect(p.zones).toBe(d.zones);
    expect(validateDesign(p, { product }).ok).toBe(true);
  });

  it("normalises names to NFC, so the same name typed two ways is the same", () => {
    const decomposed = "José";
    const p = designForPlayer(kit(), { name: decomposed, number: "9" });
    expect(value(findLayers(p, { role: "player-name" })[0])).toBe("José");
  });

  it("keeps the jersey number rule: at most 99, one digit system, digits only", () => {
    expect(() => designForPlayer(kit(), { name: "A", number: "100" })).toThrow(/more than 2 digits/);
    expect(() => designForPlayer(kit(), { name: "A", number: "1٢" })).toThrow(/mixes two digit systems/);
    expect(() => designForPlayer(kit(), { name: "A", number: "" })).toThrow(/turn the number off first/);
    expect(() => designForPlayer(kit(), { name: "A\nB", number: "1" })).toThrow(/one line/);
  });
});

describe("role slots at presets (the Players switches, the Team tool's Where)", () => {
  it("turns the number on the front on in the back number's style, and off again; the value stays", () => {
    const d = setRoleSlot(kit(), "player-number", "front-number", true, { product });
    const front = findLayers(d, { role: "player-number", preset: "front-number" })[0]!;
    const back = findLayers(d, { role: "player-number", preset: "back-number" })[0]!;
    expect(front).toMatchObject({ pieceId: "front", position: { x: 335.5, y: 405 }, fontId: (back as { fontId: string }).fontId, value: "10" });
    expect(isRoleSlotOn(d, "player-number", "front-number")).toBe(true);
    const off = setRoleSlot(d, "player-number", "front-number", false, { product });
    expect(isRoleSlotOn(off, "player-number", "front-number")).toBe(false);
    expect(off.samplePlayer.number).toBe("10");
    // Already on / already off: nothing changes.
    expect(setRoleSlot(d, "player-number", "front-number", true, { product })).toBe(d);
    expect(setRoleSlot(off, "player-number", "front-number", false, { product })).toBe(off);
  });

  it("team name Off keeps the text; On again shows it", () => {
    const off = setRoleSlot(kit(), "team-name", "chest-centre", false, { product });
    expect(findLayers(off, { role: "team-name" })).toEqual([]);
    expect(off.teamName).toBe("TIGERS");
    const on = setRoleSlot(off, "team-name", "chest-centre", true, { product, fonts, style: nameStyle });
    expect(value(findLayers(on, { role: "team-name" })[0])).toBe("TIGERS");
  });

  it("refuses a preset that does not take the role, and a slot with no style to copy", () => {
    expect(() => setRoleSlot(kit(), "player-number", "chest-centre", true, { product })).toThrow(/preset "chest-centre": it takes team-name/);
    expect(() => setRoleSlot(createDesign(product), "player-name", "back-name", true, { product })).toThrow(/no style was given/);
    expect(() => setRoleSlot(kit(), "player-name", "pocket", true, { product })).toThrow(/no placement preset "pocket"/);
  });

  it("moves the team name to the upper back at its size step; a logo keeps its proportions in the preset's box", () => {
    const d = kit();
    const id = findLayers(d, { role: "team-name" })[0]!.id;
    const moved = placeAtPreset(d, id, "upper-back", { product });
    expect(moved.layers.find((l) => l.id === id)).toMatchObject({ pieceId: "back", preset: "upper-back", position: { x: 244, y: 62 }, fontSize: 34 });
    const withLogo = addLayer(d, newLogoLayer(product, { id: "crest", preset: "left-chest", asset: { assetId: "a", mediaType: "image/png", width: 1200, height: 600 } }), { product });
    const sleeve = placeAtPreset(withLogo, "crest", "sleeve-left", { product });
    expect(sleeve.layers.find((l) => l.id === "crest")!.size).toEqual({ width: 80, height: 40 });
    expect(() => placeAtPreset(d, id, "back-number", { product })).toThrow(/takes player-number/);
  });

  it("size steps and outlines are relative to the preset's font size", () => {
    const d = kit();
    const id = findLayers(d, { role: "player-number" })[0]!.id;
    const large = setSizeStep(d, id, "large", { product });
    const layer = large.layers.find((l) => l.id === id) as Extract<Layer, { kind: "number" }>;
    expect(layer.fontSize).toBeCloseTo(215 * 1.25, 3);
    expect(layer.size).toEqual({ width: 300, height: 250 });
    expect(sizeStepOf(product, layer)).toBe("large");
    // The outline grows with the number.
    expect(layer.outline!.width).toBe(outlineWidthMm(layer.fontSize, "thin"));
    const thick = setOutline(large, id, { step: "thick", color: teamColourValue(large, "main") }, { product });
    expect((thick.layers.find((l) => l.id === id) as typeof layer).outline!.width).toBe(outlineWidthMm(layer.fontSize, "thick"));
    const none = setOutline(thick, id, null);
    expect((none.layers.find((l) => l.id === id) as typeof layer).outline).toBeUndefined();
    expect(validateDesign(none, { product }).ok).toBe(true);
  });
});

describe("a font catalogue is needed for a style naming a font the design does not list", () => {
  it("adds the font from the catalogue, or explains", () => {
    const d = setSamplePlayer(createDesign(product), { number: "9" });
    expect(() => setRoleSlot(d, "player-number", "back-number", true, { product, style: numberStyle })).toThrow(/pass the font catalogue/);
    const ok = setRoleSlot(d, "player-number", "back-number", true, { product, fonts, style: numberStyle });
    expect(ok.fonts.map((f) => f.id)).toContain("graduate-400");
    expect(addCatalogFont(ok, fonts, "graduate-400").fonts).toHaveLength(ok.fonts.length);
  });
});
