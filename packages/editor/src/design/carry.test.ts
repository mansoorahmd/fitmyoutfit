/** Carrying a design to another garment (G4): plain functions on design documents. */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { carryDesign, sharesPattern } from "./carry.js";
import { createDesign } from "./create.js";
import { addLayer } from "./edit.js";
import { newLogoLayer } from "./new-layers.js";
import { applyTemplate, type Template } from "./template.js";
import { validateDesign } from "./validate.js";
import type { DesignDocument, ProductDefinition } from "./schema.js";
import { loadMatchJerseyProduct, loadMatchJerseyRoundProduct, loadPlaceholderFonts, loadStandInProduct } from "../test/fixtures.js";

const vneck = loadMatchJerseyProduct();
const round = loadMatchJerseyRoundProduct();
const tshirt = loadStandInProduct();
const fonts = loadPlaceholderFonts();
const template = (dir: string, id: string) => JSON.parse(readFileSync(resolve(import.meta.dirname, `../../samples/templates/${dir}/${id}.json`), "utf8")) as Template;
const asset = { assetId: "a-crest", mediaType: "image/png", width: 800, height: 800 } as const;

function jerseyDesign(): DesignDocument {
  const base = createDesign(vneck, { teamName: "LAHORE LIONS", samplePlayer: { name: "ALI", number: "10" } });
  const withTemplate = applyTemplate(base, template("match-jersey-vneck", "hoops"), { product: vneck, fonts });
  return addLayer(withTemplate, newLogoLayer(vneck, { id: "crest-1", pieceId: "front", preset: "left-chest", asset }), { product: vneck });
}

describe("the two necks of the match jersey share their pattern: everything is kept", () => {
  it("is recognised from the data (pieces, zones, placements), and the T-shirt is another garment", () => {
    expect(sharesPattern(vneck, round)).toBe(true);
    expect(sharesPattern(vneck, tshirt)).toBe(false);
  });
  it("the design comes across unchanged apart from the product's id: zones, shapes, items, team and template", () => {
    const design = jerseyDesign();
    const out = carryDesign(design, vneck, round);
    expect(out.samePattern).toBe(true);
    expect(out.leftBehind).toEqual([]);
    expect(out.patternLeftBehind).toBe(false);
    expect(out.design).toEqual({ ...design, product: { id: round.id }, layers: out.design.layers });
    expect(out.design.layers).toEqual(design.layers.map((l, i) => ({ ...l, ...out.design.layers[i] })));
    expect(out.adjusted).toEqual([]);
    expect(validateDesign(out.design, { product: round }).ok).toBe(true);
  });
  it("an item the new neck's print area cannot hold is moved in by the print-area rule and reported", () => {
    const design = jerseyDesign();
    const tight: ProductDefinition = structuredClone(round);
    const front = tight.pieces.find((p) => p.id === "front")!;
    front.printArea = { x: 330, y: 300, width: 120, height: 200 };
    const out = carryDesign(design, vneck, tight);
    expect(out.samePattern).toBe(true);
    expect(out.adjusted.length).toBeGreaterThan(0);
    expect(out.leftBehind).toEqual([]);
  });
});

describe("another garment: what is kept, what is left behind", () => {
  it("keeps the team colours, team name, sample player and every item that has a place, at its placement; drops the template and the stripes", () => {
    const design = jerseyDesign();
    const out = carryDesign(design, vneck, tshirt);
    expect(out.samePattern).toBe(false);
    expect(out.design.product.id).toBe(tshirt.id);
    expect(out.design.teamColors).toEqual(design.teamColors);
    expect(out.design.teamName).toBe("LAHORE LIONS");
    expect(out.design.samplePlayer).toEqual({ name: "ALI", number: "10" });
    expect(out.design.template).toBeNull();
    expect(out.design.shapes).toEqual([]);
    expect(out.patternLeftBehind).toBe(true);
    expect(out.leftBehind).toEqual([]);
    const roles = (d: DesignDocument) => d.layers.map((l) => `${l.role}@${l.preset}`).sort();
    expect(roles(out.design)).toEqual(roles(design));
    for (const layer of out.design.layers) expect(tshirt.placements.find((p) => p.id === layer.preset)?.pieceId).toBe(layer.pieceId);
    expect(out.design.zones.body_front).toEqual(design.zones.body_front);
    expect(validateDesign(out.design, { product: tshirt }).ok).toBe(true);
  });
  it("an item whose role has no placement on the new garment is not carried and is returned, never silently lost", () => {
    const design = jerseyDesign();
    const bare: ProductDefinition = structuredClone(tshirt);
    for (const p of bare.placements) p.roles = p.roles.filter((r) => r !== "crest") as typeof p.roles;
    bare.placements = bare.placements.filter((p) => p.roles.length > 0);
    const out = carryDesign(design, vneck, bare);
    expect(out.leftBehind.map((l) => l.id)).toEqual(["crest-1"]);
    expect(out.design.layers.some((l) => l.id === "crest-1")).toBe(false);
    expect(out.design.layers.length).toBe(design.layers.length - 1);
  });
  it("an item at a placement the new garment lacks goes to a free placement for its role on the same side", () => {
    const design = jerseyDesign();
    const other: ProductDefinition = structuredClone(tshirt);
    // No left chest here, but the right chest takes a crest: the crest moves there.
    other.placements = other.placements.filter((p) => p.id !== "left-chest");
    const out = carryDesign(design, vneck, other);
    expect(out.leftBehind).toEqual([]);
    const crest = out.design.layers.find((l) => l.id === "crest-1")!;
    expect(crest.preset).not.toBe("left-chest");
    expect(other.placements.find((p) => p.id === crest.preset)?.side).toBe("front");
    expect(out.adjusted).toContain("crest-1");
  });
  it("does not change the design it was given", () => {
    const design = jerseyDesign();
    const before = JSON.stringify(design);
    carryDesign(design, vneck, tshirt);
    carryDesign(design, vneck, round);
    expect(JSON.stringify(design)).toBe(before);
  });
});
