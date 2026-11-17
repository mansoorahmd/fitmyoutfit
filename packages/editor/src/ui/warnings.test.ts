/** E3d (07-editor-review R15, D2): the warning badge's words on the model, from the same checks as the Done panel. */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { createDesign } from "../design/create";
import { applyTemplate, type Template } from "../design/template";
import { EDITOR_WORDING as W } from "./content";
import { warningNames } from "./checks";
import { loadPlaceholderFonts, loadPlaceholderPalette, loadStandInJerseyProduct } from "../test/fixtures";

const product = loadStandInJerseyProduct();
const palette = loadPlaceholderPalette();
const fonts = loadPlaceholderFonts();
const classic = JSON.parse(readFileSync(resolve(import.meta.dirname, "../../samples/templates/stand-in-jersey/classic.json"), "utf8")) as Template;
const design = applyTemplate(createDesign(product, { teamName: "LAHORE LIONS", samplePlayer: { name: "ALI", number: "10" } }), classic, { product, fonts });

describe("warningNames", () => {
  it("names every item with an open warning, in the coach's words, and no other item", () => {
    const navy = { id: "placeholder-navy", hex: "#1B2A5C" };
    let d = design;
    for (const zone of Object.keys(d.zones)) d = { ...d, zones: { ...d.zones, [zone]: navy } };
    d = { ...d, layers: d.layers.map((l) => (l.role === "team-name" ? { ...l, fill: navy } : l)) };
    const names = warningNames(W, product, d, { palette });
    const team = d.layers.find((l) => l.role === "team-name")!;
    expect(names.get(team.id)).toBe("Needs a look: hard to read on Navy.");
    // Only items that really fail: the logo-free classic kit's navy-on-navy lettering, nothing else.
    for (const [id, words] of names) {
      expect(words).toBe("Needs a look: hard to read on Navy.");
      expect(d.layers.find((l) => l.id === id)?.kind).not.toBe("logo");
    }
  });
  it("is empty for a kit with nothing to check", () => {
    expect(warningNames(W, product, design, { palette }).size).toBe(0);
  });
});
