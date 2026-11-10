import { describe, expect, it } from "vitest";
import { createDesign } from "./create";
import { DESIGN_SCHEMA_VERSION } from "./schema";
import { validateDesign } from "./validate";
import { loadPlaceholderProduct } from "../test/fixtures";

describe("createDesign", () => {
  const product = loadPlaceholderProduct();

  it("starts every zone at the product's default colour, with no layers or fonts", () => {
    const design = createDesign(product);
    expect(design.schemaVersion).toBe(DESIGN_SCHEMA_VERSION);
    expect(design.product).toEqual({ id: "placeholder-jersey" });
    expect(design.palette).toEqual(product.palette);
    expect(Object.keys(design.zones).sort()).toEqual(["body", "collar", "sleeves"]);
    expect(design.zones.body).toEqual({ id: "placeholder-white", hex: "#FFFFFF" });
    expect(design.layers).toEqual([]);
    expect(design.fonts).toEqual([]);
  });

  it("produces a document that validates against its own product", () => {
    const result = validateDesign(createDesign(product), { product });
    expect(result).toMatchObject({ ok: true });
  });

  it("does not share objects with the product definition", () => {
    const design = createDesign(product);
    expect(design.zones.body).not.toBe(product.zones[0]?.defaultColor);
    expect(design.palette).not.toBe(product.palette);
  });

  it("survives a JSON round trip unchanged", () => {
    const design = createDesign(product);
    expect(JSON.parse(JSON.stringify(design))).toEqual(design);
  });
});
