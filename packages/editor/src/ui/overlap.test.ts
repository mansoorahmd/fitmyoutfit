/** E3d (left over from E3c): items that cover each other get a check and a one-tap fix. */
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { createDesign } from "../design/create";
import { addLayer, updateLayer } from "../design/edit";
import { nudgeLayer } from "../design/item-edits";
import { newLogoLayer } from "../design/new-layers";
import { isClipped } from "../design/print-area";
import { applyTemplate, type Template } from "../design/template";
import { designChecks, itemChecks, warningNames } from "./checks";
import { EDITOR_WORDING as W } from "./content";
import { coveredItem, moveClear, quadsOverlap } from "./overlap";
import { loadPlaceholderFonts, loadStandInJerseyProduct, loadStandInProduct } from "../test/fixtures";

const fonts = loadPlaceholderFonts();
const square = (x: number, y: number, s: number) => [
  { x, y },
  { x: x + s, y },
  { x: x + s, y: y + s },
  { x, y: y + s },
];

describe("quadsOverlap", () => {
  it("overlapping boxes overlap; touching or apart ones do not", () => {
    expect(quadsOverlap(square(0, 0, 10), square(5, 5, 10))).toBe(true);
    expect(quadsOverlap(square(0, 0, 10), square(10, 0, 10))).toBe(false);
    expect(quadsOverlap(square(0, 0, 10), square(30, 30, 10))).toBe(false);
    // A turned square whose corner reaches into the other.
    const turned = [
      { x: 15, y: 2 },
      { x: 22, y: 9 },
      { x: 15, y: 16 },
      { x: 8, y: 9 },
    ];
    expect(quadsOverlap(square(0, 0, 10), turned)).toBe(true);
  });
});

for (const [name, product, dir] of [
  ["jersey", loadStandInJerseyProduct(), "stand-in-jersey"],
  ["T-shirt", loadStandInProduct(), "stand-in-tshirt"],
] as const) {
  const base = (template: Template) => applyTemplate(createDesign(product, { teamName: "LAHORE LIONS", samplePlayer: { name: "ALI", number: "10" } }), template, { product, fonts });
  const folder = resolve(import.meta.dirname, `../../samples/templates/${dir}`);
  const templates = readdirSync(folder)
    .filter((f) => f.endsWith(".json") && f !== "index.json")
    .map((f) => JSON.parse(readFileSync(resolve(folder, f), "utf8")) as Template);

  describe(`covering, on the ${name}`, () => {
    it("no template starts with an item over another (the standard places keep them apart)", () => {
      for (const t of templates) {
        const d = base(t);
        for (const layer of d.layers) expect(coveredItem(d, layer), `${t.id}: ${layer.id}`).toBeNull();
      }
    });

    it("a logo put over the team name is named, once, on the logo; the fix moves it clear inside its area", () => {
      const d0 = base(templates[0]!);
      const team = d0.layers.find((l) => l.role === "team-name")!;
      const d = addLayer(d0, { ...newLogoLayer(product, { id: "logo-1", pieceId: team.pieceId, role: "crest", asset: { assetId: "a1", mediaType: "image/png", width: 1000, height: 1000 } }), position: { ...team.position } }, { product });
      const logo = d.layers.find((l) => l.id === "logo-1")!;
      expect(coveredItem(d, logo)?.id).toBe(team.id);
      expect(itemChecks(product, d, logo)).toContain("covers");
      expect(itemChecks(product, d, team)).not.toContain("covers");
      expect(designChecks(W, product, d).find((c) => c.check === "covers")?.text).toMatch(/: covers the team name\.$/);
      expect(warningNames(W, product, d).get("logo-1")).toContain("covers the team name.");
      const fixed = moveClear(d, "logo-1", product)!;
      expect(fixed).not.toBeNull();
      const moved = fixed.layers.find((l) => l.id === "logo-1")!;
      expect(coveredItem(fixed, moved)).toBeNull();
      expect(isClipped(product, moved)).toBe(false);
      // There is room: it is moved, not made smaller.
      expect(moved.size).toEqual(logo.size);
      expect(moved.position).not.toEqual(logo.position);
      // The nearest free place: 2 mm back towards where it was, it covers the team name again.
      const back = nudgeLayer(fixed, "logo-1", 0, -Math.sign(moved.position.y - logo.position.y) * 2, { product });
      expect(coveredItem(back, back.layers.find((l) => l.id === "logo-1")!)).not.toBeNull();
    });

    it("an item that covers nothing has no fix to make", () => {
      const d = base(templates[0]!);
      expect(moveClear(d, d.layers[0]!.id, product)).toBeNull();
      expect(moveClear(updateLayer(d, d.layers[0]!.id, {}, { product }), "nope", product)).toBeNull();
    });
  });
}
