import { describe, expect, it } from "vitest";
import { createDesign } from "./create";
import { addLayer, setZoneColor, updateLayer } from "./edit";
import { addCatalogFont } from "./font-catalog";
import { newTextLayer } from "./new-layers";
import { READABILITY_MIN_CONTRAST, backgroundAt, designReadability, itemReadability, outlineColourFor, readabilityFix } from "./readability";
import { setOutline } from "./roles";
import type { DesignDocument, Shape } from "./schema";
import { teamColourValue } from "./team-colours";
import { loadPlaceholderFonts, loadPlaceholderProduct } from "../test/fixtures";

const product = loadPlaceholderProduct();
const NAVY = { id: "placeholder-navy", hex: "#1B2A5C" };
const WHITE = { id: "placeholder-white", hex: "#FFFFFF" };
const GOLD = { id: "placeholder-gold", hex: "#F2B705" };
const RED = { id: "placeholder-red", hex: "#C8102E" };

/** A navy body, a red yoke, and a navy name on the chest (the body). */
function kit(fill = NAVY): DesignDocument {
  let d = createDesign(product, { teamColors: { main: NAVY, second: WHITE, accent: GOLD } });
  d = setZoneColor(d, "body", NAVY);
  d = setZoneColor(d, "yoke", RED);
  d = addCatalogFont(d, loadPlaceholderFonts(), "oswald-700");
  return addLayer(d, newTextLayer(product, { id: "name", preset: "chest-centre", value: "TIGERS", fontId: "oswald-700", fill }), { product });
}

describe("readability (3:1)", () => {
  it("navy text on a navy zone fails; white on navy passes", () => {
    const navy = itemReadability(product, kit(NAVY), "name")!;
    expect(navy).toMatchObject({ background: { kind: "zone", zoneId: "body", colour: NAVY }, ratio: 1, passes: false });
    const white = itemReadability(product, kit(WHITE), "name")!;
    expect(white.passes).toBe(true);
    expect(white.ratio).toBeGreaterThan(13);
    expect(READABILITY_MIN_CONTRAST).toBe(3);
  });

  it("follows the zone actually under the item's centre", () => {
    // Moved up onto the red yoke (y below about 115 mm at the centre line): white on red passes, navy on red does not.
    const onYoke = updateLayer(kit(NAVY), "name", { position: { x: 280, y: 60 } }, { product });
    expect(itemReadability(product, onYoke, "name")!.background).toMatchObject({ kind: "zone", zoneId: "yoke" });
    expect(itemReadability(product, onYoke, "name")!.passes).toBe(false);
    // Half onto a side panel (x below 92 mm, from y 230 mm): both zones are under it, the navy body is the worst.
    const onSide = updateLayer(kit(NAVY), "name", { position: { x: 40, y: 400 } }, { product });
    const side = itemReadability(product, onSide, "name")!;
    expect(side.backgrounds.map((b) => b.kind === "zone" && b.zoneId).sort()).toEqual(["body", "side_panels"]);
    expect(side.background).toMatchObject({ kind: "zone", zoneId: "body" });
  });

  it("follows a shape over the zone (a hoop under the name)", () => {
    const hoop: Shape = { id: "shape-1", kind: "shape", group: "hoops", pieceId: "front", path: "M -10 240 H 570 V 300 H -10 Z", fill: WHITE, locked: true };
    const d = { ...kit(WHITE), shapes: [hoop] };
    const r = itemReadability(product, d, "name")!;
    expect(r.background).toEqual({ kind: "shape", shapeId: "shape-1", group: "hoops", colour: WHITE });
    expect(r.passes).toBe(false);
    expect(backgroundAt(product, d, "front", { x: 280, y: 400 })).toMatchObject({ kind: "zone", zoneId: "body" });
    expect(backgroundAt(product, d, "front", { x: 2, y: 2 })).toBeNull();
  });

  it("an outline that stands out makes it readable; the fix is the team colour with the most contrast", () => {
    const d = kit(NAVY);
    const r = itemReadability(product, d, "name")!;
    const fix = readabilityFix(d, r.background);
    expect(fix.role).toBe("second"); // white on navy
    const fixed = setOutline(d, "name", { step: "thin", color: teamColourValue(d, fix.role) }, { product });
    expect(itemReadability(product, fixed, "name")).toMatchObject({ passes: true, ratio: 1 });
    expect(itemReadability(product, fixed, "name")!.outlineRatio).toBeGreaterThan(13);
  });

  it("covers every text and number item with a value, and nothing else", () => {
    expect(designReadability(product, kit()).map((r) => r.layerId)).toEqual(["name"]);
    expect(itemReadability(product, kit(), "nope")).toBeNull();
  });
});

describe("outlineColourFor", () => {
  it("picks the team colour that stands out from both the letters and the garment", () => {
    // White letters on a red body: red would vanish into the body, white into the letters; gold shows against both.
    const d = createDesign(product, { teamColors: { main: RED, second: WHITE, accent: GOLD } });
    const background = { kind: "zone" as const, zoneId: "body", colour: RED };
    expect(outlineColourFor(d, WHITE, background).role).toBe("accent");
    // Navy letters on white, with red and white and navy: red.
    const d2 = createDesign(product, { teamColors: { main: WHITE, second: NAVY, accent: RED } });
    expect(outlineColourFor(d2, NAVY, { kind: "zone", zoneId: "body", colour: WHITE }).role).toBe("accent");
  });
});
