/** Undo and redo say what changed in the coach's words (E3c minor; 06-editor.md 10.5: "Undone: Body colour"). */
import { describe, expect, it } from "vitest";
import { createDesign } from "../design/create";
import { addLayer, setZoneColor } from "../design/edit";
import { nudgeLayer } from "../design/item-edits";
import { newLogoLayer } from "../design/new-layers";
import { loadStandInJerseyProduct } from "../test/fixtures";
import { EDITOR_WORDING as W, changeWords } from "./content";
import { namedLabel } from "./items";

const product = loadStandInJerseyProduct();

describe("undo labels", () => {
  it("name the part of the kit and the item", () => {
    const d = createDesign(product);
    const red = setZoneColor(d, "body_front", { id: "placeholder-red", hex: "#C8102E" }, { product });
    expect(changeWords(W, namedLabel(W, product, "zone-colour", d, red))).toBe("Body front colour");
    const logo = addLayer(d, newLogoLayer(product, { id: "logo-1", preset: "left-chest", asset: { assetId: "a", mediaType: "image/png", width: 600, height: 600 } }), { product });
    expect(changeWords(W, namedLabel(W, product, "add-item", d, logo))).toBe("Logo added");
    const moved = nudgeLayer(logo, "logo-1", 5, 0, { product });
    expect(changeWords(W, namedLabel(W, product, "move", logo, moved))).toBe("Logo position");
    expect(changeWords(W, namedLabel(W, product, "replace-logo", logo, moved))).toBe("Logo replaced");
    expect(changeWords(W, namedLabel(W, product, "remove-item", logo, d))).toBe("Logo removed");
  });

  it("fall back to the plain words when nothing names the change", () => {
    expect(changeWords(W, "template")).toBe("Design");
    expect(changeWords(W, null)).toBe(W.changes.fallback);
    expect(changeWords(W, "move")).toBe("Position");
  });
});
