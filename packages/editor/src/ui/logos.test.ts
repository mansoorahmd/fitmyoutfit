/**
 * The Logos tool's rules (06-editor.md 4.6) and the Done panel's checks
 * summary (9.2): the usual places, the size in words, the resolution warning
 * and Make it sharp, Replace keeping the place, and every open warning named.
 */
import { describe, expect, it } from "vitest";
import { createDesign } from "../design/create";
import { addLayer, updateLayer } from "../design/edit";
import { newLogoLayer } from "../design/new-layers";
import { setZoneColor } from "../design/edit";
import { logoLayerDpi } from "../design/upload-checks";
import { loadPlaceholderFonts, loadPlaceholderPalette, loadStandInJerseyProduct } from "../test/fixtures";
import { addCatalogFont } from "../design/font-catalog";
import { setRoleSlot } from "../design/roles";
import { designChecks, itemChecks } from "./checks";
import { EDITOR_WORDING as W } from "./content";
import { countLogos, logoIsBlurry, logoLimit, logoSizeWord, makeLogoSharp, nextPreset, placementOrder, replaceLogoAsset, sharpWidth } from "./logos";
import type { DesignDocument, LogoAssetRef } from "../design/schema";

const product = loadStandInJerseyProduct();
const palette = loadPlaceholderPalette();
const fonts = loadPlaceholderFonts();
const opts = { product };
const asset = (width: number, height = width, id = "a1"): LogoAssetRef => ({ assetId: id, mediaType: "image/png", width, height });

function withLogo(px: number, preset = "left-chest"): DesignDocument {
  let d = createDesign(product, { teamName: "TIGERS" });
  d = addCatalogFont(d, fonts, "oswald-700");
  d = setRoleSlot(d, "team-name", "chest-centre", true, { product, fonts, style: { fontId: "oswald-700", fill: { id: "placeholder-white", hex: "#FFFFFF" } } });
  return addLayer(d, newLogoLayer(product, { id: "logo-1", preset, role: "crest", asset: asset(px) }), opts);
}
const logo = (d: DesignDocument) => d.layers.find((l) => l.id === "logo-1") as Extract<DesignDocument["layers"][number], { kind: "logo" }>;

describe("where logos go (4.6)", () => {
  it("first on the left chest, then the centre of the chest, then the upper back", () => {
    const presets = product.placements.filter((p) => p.roles.includes("sponsor"));
    // The order is product data (E3c), not code.
    expect(placementOrder(product, "logo").slice(0, 3)).toEqual(["left-chest", "chest-centre", "upper-back"]);
    expect(nextPreset(product, "logo", { layers: [] }, presets)!.id).toBe("left-chest");
    expect(nextPreset(product, "logo", { layers: [{ preset: "left-chest" }] } as never, presets)!.id).toBe("chest-centre");
    expect(nextPreset(product, "logo", { layers: [{ preset: "left-chest" }, { preset: "chest-centre" }] } as never, presets)!.id).toBe("upper-back");
  });

  it("follows the product's own order when it gives another, and its presets' order without one", () => {
    const presets = product.placements.filter((p) => p.roles.includes("sponsor"));
    const other = { ...product, placementOrder: { logo: ["upper-back", "left-chest"], text: [] } };
    expect(nextPreset(other, "logo", { layers: [] }, presets)!.id).toBe("upper-back");
    const none = { ...product, placementOrder: undefined };
    expect(placementOrder(none, "logo")).toEqual(product.placements.map((p) => p.id));
  });
});

describe("a logo's size and sharpness", () => {
  it("says its size in words against its place's usual size", () => {
    const d = withLogo(1200);
    expect(logoSizeWord(product, logo(d))).toBe("medium");
    const big = updateLayer(d, "logo-1", { size: { width: logo(d).size.width * 1.4, height: logo(d).size.height * 1.4 } }, opts);
    expect(logoSizeWord(product, logo(big))).toBe("large");
    const small = updateLayer(d, "logo-1", { size: { width: logo(d).size.width * 0.6, height: logo(d).size.height * 0.6 } }, opts);
    expect(logoSizeWord(product, logo(small))).toBe("small");
  });

  it("warns when it would print blurry, says up to what width it is sharp, and Make it sharp shrinks it to that", () => {
    // 300 px: sharp up to 50.8 mm at 150 DPI; placed at that width, so not blurry yet.
    const d = withLogo(300);
    expect(logoIsBlurry(logo(d))).toBe(false);
    expect(sharpWidth(logo(d))).toEqual({ mm: 50.8, cm: 5 });
    const big = updateLayer(d, "logo-1", { size: { width: 80, height: 80 } }, opts);
    expect(logoIsBlurry(logo(big))).toBe(true);
    const sharp = makeLogoSharp(big, "logo-1", opts);
    expect(logoIsBlurry(logo(sharp))).toBe(false);
    expect(logoLayerDpi(logo(sharp))).toBeGreaterThanOrEqual(149.99);
    expect(logo(sharp).size.width).toBeCloseTo(50.8, 1);
    expect(logo(sharp).position).toEqual(logo(big).position);
    // Already sharp: unchanged.
    expect(makeLogoSharp(d, "logo-1", opts)).toBe(d);
  });

  it("Replace keeps the logo's place and width, with the new file's proportions", () => {
    const d = withLogo(1200);
    const before = logo(d);
    const replaced = logo(replaceLogoAsset(d, "logo-1", asset(1200, 600, "a2"), opts));
    expect(replaced.asset.assetId).toBe("a2");
    expect(replaced.position).toEqual(before.position);
    expect(replaced.size.width).toBe(before.size.width);
    expect(replaced.size.height).toBeCloseTo(before.size.width / 2, 2);
    expect(replaced.preset).toBe("left-chest");
  });
});

describe("the checks summary (9.2)", () => {
  it("names every open warning with its item: blurry, a box, cut off at the seam, hard to read", () => {
    let d = withLogo(300);
    d = updateLayer(d, "logo-1", { size: { width: 80, height: 80 } }, opts); // blurry
    const team = d.layers.find((l) => l.role === "team-name")!;
    d = updateLayer(d, team.id, { position: { x: 335.5, y: 95 }, size: { width: 300, height: 70 } }, opts); // under the V-neck: clipped
    const navy = palette.colors.find((c) => c.name === "Navy")!;
    for (const zone of Object.keys(d.zones)) d = setZoneColor(d, zone, { id: navy.id, hex: navy.hex }, opts);
    d = updateLayer(d, team.id, { fill: { id: navy.id, hex: navy.hex } }, opts); // navy on navy
    const notes = { a1: { box: true } };
    const checks = designChecks(W, product, d, { notes, palette, fileName: () => "crest.png" });
    const texts = checks.map((c) => c.text);
    expect(texts).toContain("Logo on the left chest: may print blurry at this size.");
    expect(texts).toContain("Logo on the left chest: prints as a box with its background colour.");
    expect(texts).toContain("Team name on the chest: part of it is cut off at the seam.");
    expect(texts).toContain("Team name on the chest: hard to read on Navy.");
    expect(checks.every((c) => c.layerId)).toBe(true);
    // Kept boxes are not open warnings.
    expect(itemChecks(product, d, logo(d), { notes: { a1: { box: true, kept: true } } })).toEqual(["blurry"]);
  });

  it("is empty for a kit with nothing to check", () => {
    const d = withLogo(1200);
    expect(designChecks(W, product, d, { notes: {}, palette }).filter((c) => c.layerId === "logo-1")).toEqual([]);
  });
});

describe("several logos at once (E3c minor)", () => {
  it("allows one per place that takes a logo, from the product's data", () => {
    const limit = logoLimit(product);
    expect(limit).toBe(product.placements.filter((p) => p.roles.includes("crest") || p.roles.includes("sponsor")).length);
    expect(limit).toBeGreaterThanOrEqual(3);
    expect(countLogos(withLogo(800))).toBe(1);
  });
});
