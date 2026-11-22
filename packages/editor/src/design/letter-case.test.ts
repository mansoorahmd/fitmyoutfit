/**
 * Names in capitals by default, with "As typed" (decision 012, 08-team-list.md Q-TL2): the stored name stays as typed,
 * only the drawing changes, and Arabic-script names are untouched.
 */
import { describe, expect, it } from "vitest";
import { createDesign } from "./create.js";
import { addCatalogFont } from "./font-catalog.js";
import { addLayer } from "./edit.js";
import { drawnText, isCapitalised, upperLatin } from "./letter-case.js";
import { nameLetterCase, setNameLetterCase } from "./roles.js";
import { validateDesign } from "./validate.js";
import type { ColorRef, DesignDocument, Layer } from "./schema.js";
import { drawPatternTexture } from "../texture/pattern-texture.js";
import { fontRequests } from "../texture/fonts.js";
import { describeStage } from "../ui/stage-logic.js";
import { EDITOR_WORDING } from "../ui/content.js";
import { loadPlaceholderFonts, loadPlaceholderProduct } from "../test/fixtures.js";
import { RasterContext, type TextCall } from "../test/raster-context.js";

const product = loadPlaceholderProduct();
const catalog = loadPlaceholderFonts();
const INK: ColorRef = { id: "test-ink", hex: "#00FF00" };
let base = createDesign(product);
base = addCatalogFont(base, catalog, "oswald-700");

function nameLayer(value: string, extra: Partial<Extract<Layer, { kind: "text" }>> = {}): Layer {
  return { id: "name", kind: "text", role: "player-name", pieceId: "front", position: { x: 280, y: 300 }, size: { width: 400, height: 80 }, rotation: 0, value, direction: "auto", fontId: "oswald-700", fontSize: 60, fill: INK, align: "center", ...extra };
}
const withName = (value: string, extra: Partial<Extract<Layer, { kind: "text" }>> = {}): DesignDocument => addLayer({ ...base, samplePlayer: { name: value, number: "10" } }, nameLayer(value, extra), { product });
const drawn = (design: DesignDocument) => {
  const ctx = new RasterContext(512, 512);
  drawPatternTexture(ctx, product, design, { size: 512 });
  return ctx.calls.filter((c): c is TextCall => c.op === "fillText").map((c) => c.text);
};

describe("capitals for Latin letters only", () => {
  it("capitalises Latin names, keeps spaces, digits and punctuation, and leaves Arabic script alone", () => {
    expect(upperLatin("Ali Raza")).toBe("ALI RAZA");
    expect(upperLatin("Muhammad Abdul Rehman Qureshi")).toBe("MUHAMMAD ABDUL REHMAN QURESHI");
    expect(upperLatin("O'Neil-Smith Jr.")).toBe("O'NEIL-SMITH JR.");
    expect(upperLatin("محمد علی")).toBe("محمد علی");
    expect(upperLatin("عبدالله الهاشمي")).toBe("عبدالله الهاشمي");
    expect(upperLatin("Ali محمد")).toBe("ALI محمد");
    expect(upperLatin("Zoë Çelik")).toBe("ZOË ÇELIK");
  });
  it("only a player's name is drawn in capitals, unless it says as-typed", () => {
    expect(isCapitalised({ kind: "text", role: "player-name" })).toBe(true);
    expect(isCapitalised({ kind: "text", role: "player-name", letterCase: "as-typed" })).toBe(false);
    expect(isCapitalised({ kind: "text", role: "team-name" })).toBe(false);
    expect(isCapitalised({ kind: "text", role: "text" })).toBe(false);
    expect(isCapitalised({ kind: "number", role: "player-number" })).toBe(false);
    expect(drawnText({ kind: "text", role: "player-name", value: "Ali Raza" })).toBe("ALI RAZA");
    expect(drawnText({ kind: "text", role: "team-name", value: "Lahore Lions" })).toBe("Lahore Lions");
  });
});

describe("the drawing follows the rule; the stored name does not change", () => {
  it("draws 'Ali Raza' as ALI RAZA by default, and as typed after 'As typed'", () => {
    const design = withName("Ali Raza");
    expect(drawn(design)).toEqual(["ALI RAZA"]);
    expect(design.layers.find((l) => l.id === "name")).toMatchObject({ value: "Ali Raza" });
    const typed = setNameLetterCase(design, "as-typed");
    expect(drawn(typed)).toEqual(["Ali Raza"]);
    expect(typed.layers.find((l) => l.id === "name")).toMatchObject({ value: "Ali Raza", letterCase: "as-typed" });
  });
  it("never touches an Urdu name", () => {
    expect(drawn(withName("محمد علی"))).toEqual(["محمد علی"]);
  });
  it("loads the fonts for the letters that are drawn", () => {
    const chars = fontRequests(withName("ali")).find((r) => r.family === "Oswald")!.text;
    expect(chars).toContain("A");
    expect(chars).not.toContain("a");
  });
  it("shrinks to fit by the width of the capitals, which are wider", () => {
    const long = "Muhammad Abdul Rehman Qureshi";
    const ctx = new RasterContext(512, 512);
    const result = drawPatternTexture(ctx, product, withName(long), { size: 512 });
    const typedCtx = new RasterContext(512, 512);
    const typedResult = drawPatternTexture(typedCtx, product, setNameLetterCase(withName(long), "as-typed"), { size: 512 });
    expect(result.textFits[0]!.scale).toBeLessThanOrEqual(typedResult.textFits[0]!.scale);
  });
  it("is said as it is drawn on the stage's description", () => {
    const text = describeStage(EDITOR_WORDING, product, withName("Ali Raza"), { productName: "Jersey", side: "front" });
    expect(text).toContain("ALI RAZA");
  });
});

describe("setting it", () => {
  it("is 'upper' unless a name item says otherwise, and null with no name item", () => {
    expect(nameLetterCase(withName("Ali"))).toBe("upper");
    expect(nameLetterCase(base)).toBeNull();
    expect(nameLetterCase(setNameLetterCase(withName("Ali"), "as-typed"))).toBe("as-typed");
  });
  it("writes nothing for the default (an older design stays exactly as it was) and returns the same design when nothing changes", () => {
    const design = withName("Ali");
    expect(setNameLetterCase(design, "upper")).toBe(design);
    const typed = setNameLetterCase(design, "as-typed");
    expect(setNameLetterCase(typed, "as-typed")).toBe(typed);
    const back = setNameLetterCase(typed, "upper");
    expect("letterCase" in back.layers.find((l) => l.id === "name")!).toBe(false);
    expect(JSON.stringify(back)).toBe(JSON.stringify(design));
  });
  it("is part of the format: a design with it is valid, and a wrong value is refused", () => {
    expect(validateDesign(setNameLetterCase(withName("Ali"), "as-typed"), { product }).ok).toBe(true);
    const bad = JSON.parse(JSON.stringify(withName("Ali"))) as DesignDocument;
    (bad.layers[0] as unknown as Record<string, unknown>).letterCase = "shouting";
    expect(validateDesign(bad, { product }).ok).toBe(false);
  });
});
