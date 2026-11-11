import { describe, expect, it } from "vitest";
import { createDesign } from "./create";
import { addFont, addLayer, setZoneColor, updateLayer } from "./edit";
import { DesignError, validateDesign } from "./validate";
import { GREEN, RED, loadPlaceholderProduct, logoLayer, numberLayer, textLayer } from "../test/fixtures";

const product = loadPlaceholderProduct();

describe("setZoneColor on the pattern-panel zones", () => {
  it("sets one zone and leaves every other zone, layer and field as it was", () => {
    const design = createDesign(product);
    const next = setZoneColor(design, "side_panels", GREEN, { product });
    expect(next.zones.side_panels).toEqual(GREEN);
    for (const zone of product.zones) {
      if (zone.id !== "side_panels") expect(next.zones[zone.id]).toEqual(design.zones[zone.id]);
    }
    expect({ ...next, zones: undefined }).toEqual({ ...design, zones: undefined });
    expect(design.zones.side_panels).toEqual({ id: "placeholder-red", hex: "#C8102E" });
    expect(validateDesign(next, { product }).ok).toBe(true);
  });

  it("accepts every zone the product's pieces draw", () => {
    let design = createDesign(product);
    for (const zone of product.zones) design = setZoneColor(design, zone.id, RED, { product });
    expect(Object.values(design.zones).every((c) => c.hex === RED.hex)).toBe(true);
  });

  it("refuses colours that are not a palette reference with upper-case #RRGGBB", () => {
    const design = createDesign(product);
    for (const bad of [
      { id: "x", hex: "#ffffff" },
      { id: "x", hex: "red" },
      { hex: "#FFFFFF" },
      { id: "x", hex: "#FFFFFF", image: "data:image/png;base64,AAAA" },
      "#FFFFFF",
    ]) {
      expect(() => setZoneColor(design, "yoke", bad as never, { product })).toThrow(DesignError);
    }
  });
});

/** Every string anywhere in a value, with its path. */
function strings(value: unknown, path = "$"): Array<[string, string]> {
  if (typeof value === "string") return [[path, value]];
  if (Array.isArray(value)) return value.flatMap((v, i) => strings(v, `${path}[${i}]`));
  if (value && typeof value === "object") {
    return Object.entries(value).flatMap(([k, v]) => strings(v, `${path}.${k}`));
  }
  return [];
}

/** Things that would mean pixels got into the document. */
function imageData(value: unknown): string[] {
  const found: string[] = [];
  const visit = (v: unknown, path: string) => {
    if (v instanceof ArrayBuffer || ArrayBuffer.isView(v)) found.push(`${path}: binary data`);
    else if (v && typeof v === "object") Object.entries(v).forEach(([k, c]) => visit(c, `${path}.${k}`));
  };
  visit(value, "$");
  for (const [path, s] of strings(value)) {
    if (/^data:/i.test(s) || /base64/i.test(s)) found.push(`${path}: data URL`);
    if (/<svg|<path|<img/i.test(s)) found.push(`${path}: markup`);
    if (s.length > 256) found.push(`${path}: a ${s.length}-character string`);
    if (/^(iVBORw0KGgo|\/9j\/|R0lGOD)/.test(s)) found.push(`${path}: base64 image`);
  }
  return found;
}

describe("the design JSON holds no image data", () => {
  it("after a run of edits: zone colours, fonts and layers", () => {
    let design = createDesign(product);
    for (const zone of product.zones) design = setZoneColor(design, zone.id, GREEN, { product });
    design = setZoneColor(design, "yoke", RED, { product });
    design = addFont(design, { id: "font-sans", family: "Inter", weight: 700 });
    design = addLayer(design, textLayer(), { product });
    design = addLayer(design, numberLayer(), { product });
    design = addLayer(design, logoLayer(), { product });
    design = updateLayer(design, "text-1", { value: "TIGERS FC", rotation: 5 }, { product });

    expect(validateDesign(design, { product }).ok).toBe(true);
    expect(imageData(design)).toEqual([]);
    // It survives JSON unchanged: no functions, canvases, textures or class instances in it.
    expect(JSON.parse(JSON.stringify(design))).toEqual(design);
    // A logo is a reference to a stored file, not the file.
    expect(design.layers.find((l) => l.kind === "logo")).toMatchObject({ asset: { assetId: "upload-abc123" } });
    // Small: a whole design is a few kilobytes.
    expect(JSON.stringify(design).length).toBeLessThan(4000);
  });

  it("the checker itself spots image data", () => {
    expect(imageData({ a: "data:image/png;base64,iVBORw0KGgo" })).not.toEqual([]);
    expect(imageData({ a: new Uint8Array(4) })).not.toEqual([]);
    expect(imageData({ a: "<svg></svg>" })).not.toEqual([]);
  });

  it("the document refuses an image smuggled in as an extra field", () => {
    const design = { ...createDesign(product), preview: "data:image/png;base64,iVBORw0KGgo" };
    expect(validateDesign(design).ok).toBe(false);
  });
});
