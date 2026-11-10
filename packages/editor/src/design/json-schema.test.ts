import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import Ajv2020 from "ajv/dist/2020.js";
import { describe, expect, it } from "vitest";
import { createDesign } from "./create";
import { getDesignJsonSchema, getProductJsonSchema } from "./json-schema";
import { validateDesign, validateProductDefinition } from "./validate";
import { fullDesign, loadPlaceholderProduct } from "../test/fixtures";

const root = resolve(import.meta.dirname, "../..");
const product = loadPlaceholderProduct();

function committed(name: string): unknown {
  return JSON.parse(readFileSync(resolve(root, "schema", name), "utf8"));
}

describe("committed JSON Schema files", () => {
  it("schema/design.schema.json is up to date (run `npm run generate:schema` if this fails)", () => {
    expect(committed("design.schema.json")).toEqual(JSON.parse(JSON.stringify(getDesignJsonSchema())));
  });

  it("schema/product.schema.json is up to date (run `npm run generate:schema` if this fails)", () => {
    expect(committed("product.schema.json")).toEqual(JSON.parse(JSON.stringify(getProductJsonSchema())));
  });
});

// The TypeScript types and the JSON Schema come from the same zod schemas.
// These tests also guard against that source ever being split: the committed
// JSON Schema (checked with Ajv, an independent validator) and the code in
// validate.ts must agree on every document below.
describe("JSON Schema and validateDesign agree", () => {
  const ajv = new Ajv2020({ strict: false, allErrors: true });
  const validateWithSchema = ajv.compile(committed("design.schema.json") as object);
  const base = createDesign(product);
  const full = fullDesign(base);

  const copy = (mutate: (d: Record<string, any>) => void) => {
    const doc = JSON.parse(JSON.stringify(full)) as Record<string, any>;
    mutate(doc);
    return doc;
  };

  const cases: Array<[string, unknown, boolean]> = [
    ["empty design", base, true],
    ["design with every layer kind", full, true],
    ["not an object", "design", false],
    ["missing zones", copy((d) => delete d.zones), false],
    ["wrong schemaVersion", copy((d) => (d.schemaVersion = 2)), false],
    ["lower-case hex", copy((d) => (d.zones.body.hex = "#ffffff")), false],
    ["short hex", copy((d) => (d.zones.body.hex = "#FFF")), false],
    ["unknown layer kind", copy((d) => (d.layers[0].kind = "sticker")), false],
    ["negative size", copy((d) => (d.layers[0].size.width = -1)), false],
    ["number layer with letters", copy((d) => (d.layers[1].value = "AB")), false],
    ["extra field on a layer", copy((d) => (d.layers[2].pixels = "AAAA")), false],
    ["extra top-level field", copy((d) => (d.thumbnail = "AAAA")), false],
    ["bad media type", copy((d) => (d.layers[2].asset.mediaType = "image/gif")), false],
    ["bad id characters", copy((d) => (d.layers[0].id = "has space")), false],
    ["bad zone key", copy((d) => (d.zones["bad key!"] = d.zones.body)), false],
    ["text layer without a fill", copy((d) => delete d.layers[0].fill), false],
    ["logo layer with text fields", copy((d) => (d.layers[2].fontId = "font-sans")), false],
  ];

  it.each(cases)("%s", (_name, doc, expected) => {
    expect(validateWithSchema(doc)).toBe(expected);
    expect(validateDesign(doc).ok).toBe(expected);
  });
});

describe("product JSON Schema and validateProductDefinition agree", () => {
  const ajv = new Ajv2020({ strict: false, allErrors: true });
  const validateWithSchema = ajv.compile(committed("product.schema.json") as object);

  it("accept the placeholder product", () => {
    expect(validateWithSchema(product)).toBe(true);
    expect(validateProductDefinition(product).ok).toBe(true);
  });

  it("reject a product without zones", () => {
    const broken = { ...product, zones: [] };
    expect(validateWithSchema(broken)).toBe(false);
    expect(validateProductDefinition(broken).ok).toBe(false);
  });
});
