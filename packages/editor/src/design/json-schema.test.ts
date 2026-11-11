import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import Ajv2020 from "ajv/dist/2020.js";
import { describe, expect, it } from "vitest";
import { createDesign } from "./create";
import { getDesignJsonSchema, getProductJsonSchema } from "./json-schema";
import { DEFAULT_JERSEY_NUMBER_RULES } from "./jersey-number-rules";
import { JERSEY_NUMBER_VALUE_PATTERN } from "./schema";
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
    ["wrong schemaVersion", copy((d) => (d.schemaVersion = 1)), false],
    ["lower-case hex", copy((d) => (d.zones.body.hex = "#ffffff")), false],
    ["short hex", copy((d) => (d.zones.body.hex = "#FFF")), false],
    ["unknown layer kind", copy((d) => (d.layers[0].kind = "sticker")), false],
    ["negative size", copy((d) => (d.layers[0].size.width = -1)), false],
    ["number layer with letters", copy((d) => (d.layers[1].value = "AB")), false],
    ["number layer with Western digits", copy((d) => (d.layers[1].value = "07")), true],
    ["number layer with Arabic-Indic digits", copy((d) => (d.layers[1].value = "٧")), true],
    ["number layer with Extended Arabic-Indic digits", copy((d) => (d.layers[1].value = "۹۹")), true],
    ["number layer mixing two digit systems (the pattern forbids it too)", copy((d) => (d.layers[1].value = "1٢")), false],
    ["number layer with spaces", copy((d) => (d.layers[1].value = " 7")), false],
    ["number layer with full-width digits", copy((d) => (d.layers[1].value = "７")), false],
    ["number layer with a sign", copy((d) => (d.layers[1].value = "-1")), false],
    ["number layer that is empty", copy((d) => (d.layers[1].value = "")), false],
    ["extra field on a layer", copy((d) => (d.layers[2].pixels = "AAAA")), false],
    ["extra top-level field", copy((d) => (d.thumbnail = "AAAA")), false],
    ["bad media type", copy((d) => (d.layers[2].asset.mediaType = "image/gif")), false],
    ["bad id characters", copy((d) => (d.layers[0].id = "has space")), false],
    ["bad zone key", copy((d) => (d.zones["bad key!"] = d.zones.body)), false],
    // JSON.parse makes "__proto__" an own key, like a document read from disk or a request body.
    [
      "__proto__ as a zone key",
      JSON.parse(JSON.stringify(full).replace('"zones":{', '"zones":{"__proto__":{"id":"x","hex":"#000000"},')),
      false,
    ],
    ["constructor as a zone key", copy((d) => (d.zones.constructor = d.zones.body)), false],
    ["prototype as a zone key", copy((d) => (d.zones.prototype = d.zones.body)), false],
    ["a harmless zone key like toString is just a name", copy((d) => (d.zones.toString = d.zones.body)), true],
    ["text layer without a fill", copy((d) => delete d.layers[0].fill), false],
    ["logo layer with text fields", copy((d) => (d.layers[2].fontId = "font-sans")), false],
    // Format version 2 (E2).
    ["text aligned 'left' (the old format)", copy((d) => (d.layers[0].align = "left")), false],
    ["text aligned 'end'", copy((d) => (d.layers[0].align = "end")), true],
    ["text without a direction", copy((d) => delete d.layers[0].direction), false],
    ["text with direction 'rtl' and an Urdu value", copy((d) => Object.assign(d.layers[0], { direction: "rtl", value: "محمد علی" })), true],
    ["text with a line break", copy((d) => (d.layers[0].value = "A\nB")), false],
    ["a logo that is an SVG (not accepted for uploads)", copy((d) => (d.layers[2].asset.mediaType = "image/svg+xml")), false],
    ["a WebP logo", copy((d) => (d.layers[2].asset.mediaType = "image/webp")), true],
    ["a logo without its pixel size", copy((d) => delete d.layers[2].asset.width), false],
    ["a logo with a fractional pixel size", copy((d) => (d.layers[2].asset.height = 10.5)), false],
    ["a logo with the image bytes inline", copy((d) => (d.layers[2].asset.data = "iVBORw0KGgo=")), false],
    ["a clipart SVG", copy((d) => (d.layers[3].asset.mediaType = "image/svg+xml")), true],
    ["a font family with a quote", copy((d) => (d.fonts[0].family = 'Inter", serif')), false],
    ["a font with a fallback list", copy((d) => {
      d.fonts.push({ id: "font-arabic", family: "Noto Sans Arabic" });
      d.fonts[0].fallbackFontIds = ["font-arabic"];
    }), true],
  ];

  it.each(cases)("%s", (_name, doc, expected) => {
    expect(validateWithSchema(doc)).toBe(expected);
    expect(validateDesign(doc).ok).toBe(expected);
  });
});

// The ONE place where the two are allowed to differ: the jersey number maximum.
// The maximum is data (99 by default, and callers can pass other rules), which a
// JSON Schema cannot express, so the schema's pattern only checks structure
// (digits, from one digit system) and `validateDesign` enforces the maximum and
// the length. Anything the schema rejects, `validateDesign` must reject too;
// the reverse is not true for these values.
describe("JSON Schema is looser than validateDesign for the jersey number maximum (documented difference)", () => {
  const ajv = new Ajv2020({ strict: false, allErrors: true });
  const validateWithSchema = ajv.compile(committed("design.schema.json") as object);
  const full = fullDesign(createDesign(product));
  const withNumber = (value: string) => {
    const doc = JSON.parse(JSON.stringify(full)) as Record<string, any>;
    doc.layers[1].value = value;
    return doc;
  };

  it.each(["100", "007", "999", "1234", "٠٠٧", "۱۰۰", "0".repeat(50)])(
    "%s: the schema accepts it, validateDesign rejects it as too long",
    (value) => {
      expect(validateWithSchema(withNumber(value))).toBe(true);
      const result = validateDesign(withNumber(value));
      expect(result.ok).toBe(false);
      expect(!result.ok && result.errors[0]!.message).toContain("has more than 2 digits");
    },
  );

  it("with a larger maximum passed in, validateDesign accepts what the schema always accepted", () => {
    const rules = { ...DEFAULT_JERSEY_NUMBER_RULES, maxValue: 999 };
    expect(validateDesign(withNumber("100"), { jerseyNumberRules: rules }).ok).toBe(true);
  });

  it("everything the schema rejects, validateDesign rejects too", () => {
    for (const value of ["", " 7", "7 ", "-1", "1.5", "7a", "٧a", "1٢", "٧۷", "７"]) {
      expect(validateWithSchema(withNumber(value))).toBe(false);
      expect(validateDesign(withNumber(value)).ok).toBe(false);
    }
  });

  it("the schema's description for the value says where the maximum is enforced", () => {
    const schema = committed("design.schema.json") as any;
    const number = schema.properties.layers.items.oneOf.find((l: any) => l.properties.kind.const === "number");
    expect(number.properties.value.description).toContain("enforced by validateDesign()");
    expect(number.properties.value.description).toContain("99");
    expect(number.properties.value.pattern).toBe(JERSEY_NUMBER_VALUE_PATTERN);
  });
});

// Other documented differences: rules about text and references that a JSON
// Schema cannot hold. The schema's descriptions say validateDesign checks them.
describe("JSON Schema is looser than validateDesign for text and references (documented differences)", () => {
  const ajv = new Ajv2020({ strict: false, allErrors: true });
  const validateWithSchema = ajv.compile(committed("design.schema.json") as object);
  const full = fullDesign(createDesign(product));
  const copy = (mutate: (d: Record<string, any>) => void) => {
    const doc = JSON.parse(JSON.stringify(full)) as Record<string, any>;
    mutate(doc);
    return doc;
  };

  it.each<[string, (d: Record<string, any>) => void, string]>([
    ["text that is not in Unicode NFC", (d) => (d.layers[0].value = "José"), "Unicode normal form NFC"],
    ["text of spaces only", (d) => (d.layers[0].value = "   "), "visible character"],
    ["a font fallback that is not in the document", (d) => (d.fonts[0].fallbackFontIds = ["font-arabic"]), "is not listed in 'fonts'"],
    ["a layer font that is not in the document", (d) => (d.layers[0].fontId = "font-serif"), "is not listed in 'fonts'"],
  ])("%s: the schema accepts it, validateDesign rejects it", (_name, mutate, message) => {
    const doc = copy(mutate);
    expect(validateWithSchema(doc)).toBe(true);
    const result = validateDesign(doc);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.errors[0]!.message).toContain(message);
  });

  it("the schema's description for a text value says where NFC is checked", () => {
    const schema = committed("design.schema.json") as any;
    const text = schema.properties.layers.items.oneOf.find((l: any) => l.properties.kind.const === "text");
    expect(text.properties.value.description).toContain("NFC");
    expect(text.properties.value.description).toContain("validateDesign()");
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

  const productCopy = (mutate: (p: Record<string, any>) => void) => {
    const doc = JSON.parse(JSON.stringify(product)) as Record<string, any>;
    mutate(doc);
    return doc;
  };

  it.each<[string, (p: Record<string, any>) => void]>([
    ["a piece without an outline", (p) => delete p.pieces[0].outline],
    ["a piece without a zone", (p) => delete p.pieces[0].zone],
    ["a piece without regions", (p) => delete p.pieces[0].regions],
    ["an outline with markup in it", (p) => (p.pieces[0].outline = "<path d='M0 0'/>")],
    ["an empty outline", (p) => (p.pieces[0].outline = "")],
    ["a region without a path", (p) => delete p.pieces[0].regions[0].path],
    ["a region with an extra field", (p) => (p.pieces[0].regions[0].fill = "#FFFFFF")],
    ["a zone with a reserved id", (p) => (p.pieces[0].zone = "constructor")],
    ["an image on a piece", (p) => (p.pieces[0].image = "data:image/png;base64,AAAA")],
  ])("reject %s", (_name, mutate) => {
    const broken = productCopy(mutate);
    expect(validateWithSchema(broken)).toBe(false);
    expect(validateProductDefinition(broken).ok).toBe(false);
  });

  // Documented difference: the schema checks the structure of the panels, the
  // validator also parses the paths and checks references and geometry.
  it.each<[string, (p: Record<string, any>) => void]>([
    ["an arc command (A: letter not allowed by the pattern either)", (p) => (p.pieces[0].outline = "M0 0 A1 1 0 0 0 1 1 Z")],
  ])("reject %s, both", (_name, mutate) => {
    const broken = productCopy(mutate);
    expect(validateWithSchema(broken)).toBe(false);
    expect(validateProductDefinition(broken).ok).toBe(false);
  });

  it.each<[string, (p: Record<string, any>) => void]>([
    ["path data that does not start with M", (p) => (p.pieces[0].outline = "L 0 0 Z")],
    ["an open outline", (p) => (p.pieces[4].outline = "M 0 0 H 480 V 30 H 0")],
    ["an outline outside the piece's box", (p) => (p.pieces[4].outline = "M 0 0 H 900 V 30 H 0 Z")],
    ["a region of a zone the product does not have", (p) => (p.pieces[0].regions[0].zone = "pockets")],
    ["a zone no piece draws", (p) => (p.pieces[4].zone = "body")],
    ["a stretched UV rectangle", (p) => (p.pieces[0].uv.width = 0.3)],
    ["overlapping UV rectangles", (p) => (p.pieces[1].uv.x = 0.3)],
  ])("the schema accepts %s, validateProductDefinition rejects it", (_name, mutate) => {
    const broken = productCopy(mutate);
    expect(validateWithSchema(broken)).toBe(true);
    expect(validateProductDefinition(broken).ok).toBe(false);
  });

  it("the schema's descriptions for path data say where the full check is", () => {
    const schema = committed("product.schema.json") as any;
    const piece = schema.properties.pieces.items.properties;
    expect(piece.outline.description).toContain("validateProductDefinition()");
    expect(piece.regions.items.properties.path.description).toContain("validateProductDefinition()");
  });
});
