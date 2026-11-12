import { describe, expect, it } from "vitest";
import { createDesign } from "./create";
import { addLayer } from "./edit";
import { addCatalogFont } from "./font-catalog";
import { newTextLayer } from "./new-layers";
import type { DesignDocument } from "./schema";
import { setShapeGroupColor, setTeamColor, setZoneTeamColor, swapTeamColors, teamColourRoles, teamColourUses, teamColourValue } from "./team-colours";
import { validateDesign } from "./validate";
import { loadPlaceholderFonts, loadPlaceholderPalette, loadPlaceholderProduct } from "../test/fixtures";

const product = loadPlaceholderProduct();
const palette = loadPlaceholderPalette();
const RED = { id: "placeholder-red", hex: "#C8102E" };
const NAVY = { id: "placeholder-navy", hex: "#1B2A5C" };
const GOLD = { id: "placeholder-gold", hex: "#F2B705" };
const MAROON = { id: "placeholder-maroon", hex: "#6E1E2C" };

/** A kit: body follows Main, yoke and sleeves follow Second, a stripe follows Accent, a name in Second outlined in Main. */
function kit(): DesignDocument {
  let d = createDesign(product, { teamColors: { main: RED, second: NAVY, accent: GOLD } });
  d = setZoneTeamColor(d, "body", "main");
  d = setZoneTeamColor(d, "yoke", "second");
  d = setZoneTeamColor(d, "sleeves", "second");
  d = { ...d, shapes: [{ id: "shape-1", kind: "shape", group: "stripes", pieceId: "front", path: "M 0 300 H 560 V 340 H 0 Z", fill: teamColourValue(d, "accent"), locked: true }] };
  d = addCatalogFont(d, loadPlaceholderFonts(), "oswald-700");
  const name = newTextLayer(product, { id: "name", pieceId: "back", value: "TIGERS", fontId: "oswald-700", fill: teamColourValue(d, "second"), outline: { color: teamColourValue(d, "main"), width: 2 } });
  return addLayer(d, name, { product });
}

describe("team colours", () => {
  it("a zone, a shape, a fill and an outline can follow a team colour; the design stays valid", () => {
    const d = kit();
    expect(d.zones.body).toEqual({ ...RED, teamColor: "main" });
    expect(teamColourUses(d, "main")).toEqual({ zones: ["body"], shapeGroups: [], layers: ["name"] });
    expect(teamColourUses(d, "second")).toEqual({ zones: ["yoke", "sleeves"], shapeGroups: [], layers: ["name"] });
    expect(teamColourUses(d, "accent")).toEqual({ zones: [], shapeGroups: ["stripes"], layers: [] });
    expect(validateDesign(d, { product, palette }).ok).toBe(true);
  });

  it("changing a team colour recolours everything that uses it, in one edit, and nothing else", () => {
    const before = kit();
    const after = setTeamColor(before, "main", MAROON);
    expect(after.teamColors.main).toEqual(MAROON);
    expect(after.zones.body).toEqual({ ...MAROON, teamColor: "main" });
    const name = after.layers[0] as Extract<DesignDocument["layers"][number], { kind: "text" }>;
    expect(name.outline!.color).toEqual({ ...MAROON, teamColor: "main" });
    expect(name.fill).toEqual({ ...NAVY, teamColor: "second" });
    // Zones that follow no team colour are untouched.
    expect(after.zones.cuffs).toEqual(before.zones.cuffs);
    expect(after.zones.collar).toEqual(before.zones.collar);
    expect(validateDesign(after, { product, palette }).ok).toBe(true);
    expect(before.zones.body).toEqual({ ...RED, teamColor: "main" });
  });

  it("swap: Main takes Second's colour and Second Main's, across zones, shapes, fills and outlines", () => {
    const d = swapTeamColors(kit());
    expect(d.teamColors.main).toEqual(NAVY);
    expect(d.teamColors.second).toEqual(RED);
    expect(d.zones.body).toEqual({ ...NAVY, teamColor: "main" });
    expect(d.zones.yoke).toEqual({ ...RED, teamColor: "second" });
    const name = d.layers[0] as Extract<DesignDocument["layers"][number], { kind: "text" }>;
    expect(name.fill.hex).toBe(RED.hex);
    expect(name.outline!.color.hex).toBe(NAVY.hex);
    expect(d.shapes[0]!.fill).toEqual({ ...GOLD, teamColor: "accent" });
    // Swapping twice gives the kit back.
    expect(swapTeamColors(d)).toEqual(kit());
  });

  it("keeps the code the coach asked for on a team colour, never on what follows it", () => {
    const d = setTeamColor(kit(), "second", { id: "placeholder-royal", hex: "#1F4E9C", requested: "#1A5FB4" });
    expect(d.teamColors.second.requested).toBe("#1A5FB4");
    expect(d.zones.yoke).toEqual({ id: "placeholder-royal", hex: "#1F4E9C", teamColor: "second" });
    expect(validateDesign(d, { product, palette }).ok).toBe(true);
  });

  it("removing the Accent keeps the colours that followed it, following nothing", () => {
    const d = setTeamColor(kit(), "accent", null);
    expect(d.teamColors.accent).toBeUndefined();
    expect(teamColourRoles(d)).toEqual(["main", "second"]);
    expect(d.shapes[0]!.fill).toEqual(GOLD);
    expect(validateDesign(d, { product }).ok).toBe(true);
    expect(() => setTeamColor(kit(), "main", null)).toThrow(/always has Main and Second/);
  });

  it("refuses an unknown role, a malformed colour, and following a team colour the design does not have", () => {
    expect(() => setTeamColor(kit(), "home" as never, RED)).toThrow(/"home" is not one of main, second, accent/);
    expect(() => setTeamColor(kit(), "main", { id: "x", hex: "red" })).toThrow(/Invalid main team colour/);
    const two = setTeamColor(kit(), "accent", null);
    expect(() => setZoneTeamColor(two, "body", "accent")).toThrow(/no accent team colour/);
    expect(() => teamColourValue(two, "accent")).toThrow(/no accent team colour/);
  });

  it("a shape group takes a palette colour or a team colour", () => {
    const d = setShapeGroupColor(kit(), "stripes", teamColourValue(kit(), "second"));
    expect(d.shapes[0]!.fill).toEqual({ ...NAVY, teamColor: "second" });
    expect(setShapeGroupColor(kit(), "stripes", MAROON).shapes[0]!.fill).toEqual(MAROON);
    expect(() => setShapeGroupColor(kit(), "hoops", MAROON)).toThrow(/no shapes in group "hoops"/);
  });
});
