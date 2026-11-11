import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import Ajv2020 from "ajv/dist/2020.js";
import { describe, expect, it } from "vitest";
import { addCatalogFont, fontRefFromCatalog, validateFontCatalog } from "./font-catalog";
import { createDesign } from "./create";
import { addFont, addLayer, moveLayer, removeLayer } from "./edit";
import { DesignError, validateDesign } from "./validate";
import { getFontCatalogJsonSchema } from "./json-schema";
import { loadPlaceholderFonts, loadPlaceholderProduct, logoLayer, numberLayer, textLayer } from "../test/fixtures";

const product = loadPlaceholderProduct();
const catalog = loadPlaceholderFonts();
const root = resolve(import.meta.dirname, "../..");

describe("the placeholder font catalogue", () => {
  it("has three fonts, at least one for Arabic and Urdu, each with an open licence and its npm package", () => {
    expect(catalog.fonts).toHaveLength(3);
    expect(catalog.fonts.some((f) => f.scripts.includes("arabic"))).toBe(true);
    for (const font of catalog.fonts) {
      expect(font.licence.spdx).toBe("OFL-1.1");
      expect(font.licence.package).toMatch(/^@fontsource\//);
      expect(font.licence.copyright).toMatch(/Copyright/);
    }
  });

  it("names packages that are installed, and the family the package's CSS declares", () => {
    for (const font of catalog.fonts) {
      const css = readFileSync(resolve(root, "../../node_modules", font.licence.package, `${font.weight}.css`), "utf8");
      expect(css).toContain(`font-family: '${font.family}'`);
      expect(css).toContain(`font-weight: ${font.weight}`);
    }
  });

  it("gives every Latin-only font a fallback that covers Arabic", () => {
    for (const font of catalog.fonts.filter((f) => !f.scripts.includes("arabic"))) {
      const fallbacks = font.fallbackFontIds.map((id) => catalog.fonts.find((f) => f.id === id)!);
      expect(fallbacks.some((f) => f.scripts.includes("arabic"))).toBe(true);
    }
  });

  it("agrees with its committed JSON Schema (run `npm run generate:schema` if stale)", () => {
    const committed = JSON.parse(readFileSync(resolve(root, "schema/font-catalog.schema.json"), "utf8"));
    expect(committed).toEqual(JSON.parse(JSON.stringify(getFontCatalogJsonSchema())));
    const validate = new Ajv2020({ strict: false, allErrors: true }).compile(committed);
    expect(validate(JSON.parse(readFileSync(resolve(root, "samples/fonts/placeholder-fonts.json"), "utf8")))).toBe(true);
  });
});

describe("validateFontCatalog", () => {
  const copy = () => JSON.parse(JSON.stringify(catalog)) as any;
  const messages = (input: unknown) => {
    const result = validateFontCatalog(input);
    return result.ok ? [] : result.errors.map((e) => e.message);
  };

  it("refuses duplicate ids, unknown fallbacks, self fallbacks and chains of fallbacks", () => {
    const dup = copy();
    dup.fonts.push(dup.fonts[0]);
    expect(messages(dup).join()).toContain('duplicate font id "oswald-700"');
    const unknown = copy();
    unknown.fonts[0].fallbackFontIds = ["nope"];
    expect(messages(unknown).join()).toContain('"nope" is not a font of this catalogue');
    const self = copy();
    self.fonts[0].fallbackFontIds = ["oswald-700"];
    expect(messages(self).join()).toContain("cannot be its own fallback");
    const chain = copy();
    chain.fonts[2].fallbackFontIds = ["graduate-400"];
    expect(messages(chain).join()).toContain("has fallbacks of its own");
  });

  it("refuses a family name that could break out of a CSS font string, and a font without a licence", () => {
    const quote = copy();
    quote.fonts[0].family = 'Oswald", serif';
    expect(messages(quote).join()).toContain("fonts[0].family");
    const noLicence = copy();
    delete noLicence.fonts[0].licence;
    expect(messages(noLicence).join()).toContain("fonts[0].licence");
  });

  it("never throws", () => {
    expect(validateFontCatalog(null).ok).toBe(false);
    expect(validateFontCatalog("fonts").ok).toBe(false);
  });
});

describe("fonts in a design", () => {
  const empty = createDesign(product);

  it("addCatalogFont adds the font after its fallbacks, so the references hold", () => {
    const design = addCatalogFont(empty, catalog, "oswald-700");
    expect(design.fonts.map((f) => f.id)).toEqual(["noto-sans-arabic-700", "oswald-700"]);
    expect(design.fonts[1]).toEqual({
      id: "oswald-700",
      family: "Oswald",
      weight: 700,
      style: "normal",
      fallbackFontIds: ["noto-sans-arabic-700"],
    });
    expect(validateDesign(design, { product }).ok).toBe(true);
    // Adding it again changes nothing.
    expect(addCatalogFont(design, catalog, "oswald-700").fonts).toEqual(design.fonts);
  });

  it("fontRefFromCatalog leaves out an empty fallback list", () => {
    expect(fontRefFromCatalog(catalog.fonts[2]!)).toEqual({ id: "noto-sans-arabic-700", family: "Noto Sans Arabic", weight: 700, style: "normal" });
  });

  it("refuses a font that is not in the catalogue", () => {
    expect(() => addCatalogFont(empty, catalog, "comic-sans")).toThrow(/not in font catalogue "placeholder-fonts"/);
  });

  it("addFont refuses fallbacks the document does not have, or the font itself", () => {
    expect(() => addFont(empty, { id: "a", family: "A", fallbackFontIds: ["b"] })).toThrow(/font "b" is not listed in 'fonts'/);
    expect(() => addFont(empty, { id: "a", family: "A", fallbackFontIds: ["a"] })).toThrow(/cannot be its own fallback/);
    const withB = addFont(empty, { id: "b", family: "B" });
    expect(addFont(withB, { id: "a", family: "A", fallbackFontIds: ["b"] }).fonts).toHaveLength(2);
  });

  it("validateDesign refuses a fallback that is not in the document", () => {
    const doc = { ...empty, fonts: [{ id: "a", family: "A", fallbackFontIds: ["b", "b"] }] };
    const result = validateDesign(doc);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.errors.map((e) => e.path)).toEqual(["fonts[0].fallbackFontIds[0]", "fonts[0].fallbackFontIds[1]"]);
  });
});

describe("moveLayer (layer order)", () => {
  const base = addLayer(
    addLayer(addLayer(addFont(createDesign(product), { id: "font-sans", family: "Inter" }), textLayer()), numberLayer()),
    logoLayer(),
  );
  const order = (d: typeof base) => d.layers.map((l) => l.id);

  it("moves a layer up, down, to the top and to the bottom, without touching the input", () => {
    const snapshot = structuredClone(base);
    expect(order(moveLayer(base, "text-1", 1))).toEqual(["number-1", "text-1", "logo-1"]);
    expect(order(moveLayer(base, "text-1", 2))).toEqual(["number-1", "logo-1", "text-1"]);
    expect(order(moveLayer(base, "logo-1", 0))).toEqual(["logo-1", "text-1", "number-1"]);
    expect(base).toEqual(snapshot);
  });

  it("clamps the new position to the stack and returns the same document when nothing moves", () => {
    expect(order(moveLayer(base, "text-1", 99))).toEqual(["number-1", "logo-1", "text-1"]);
    expect(order(moveLayer(base, "logo-1", -5))).toEqual(["logo-1", "text-1", "number-1"]);
    expect(moveLayer(base, "text-1", 0)).toBe(base);
  });

  it("refuses an unknown layer and a position that is not a whole number", () => {
    expect(() => moveLayer(base, "nope", 0)).toThrow(DesignError);
    expect(() => moveLayer(base, "text-1", 1.5)).toThrow(/whole number/);
    expect(() => moveLayer(base, "text-1", "1" as never)).toThrow(/whole number/);
  });

  it("keeps the document valid", () => {
    expect(validateDesign(removeLayer(moveLayer(base, "logo-1", 0), "text-1"), { product }).ok).toBe(true);
  });
});
