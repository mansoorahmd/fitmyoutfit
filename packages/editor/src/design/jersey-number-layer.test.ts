// Number layers in the design document use the jersey number rule (S0-3c).
import { describe, expect, it } from "vitest";
import { createDesign } from "./create.js";
import { addFont, addLayer, updateLayer } from "./edit.js";
import { DEFAULT_JERSEY_NUMBER_RULES, WESTERN_DIGITS, type JerseyNumberRules } from "./jersey-number-rules.js";
import type { Layer } from "./schema.js";
import { DesignError, assertValidDesign, validateDesign } from "./validate.js";
import { loadPlaceholderProduct, numberLayer } from "../test/fixtures";

const product = loadPlaceholderProduct();
const withFont = addFont(createDesign(product), { id: "font-sans", family: "Inter", weight: 700 });
const numberWith = (value: string): Layer => ({ ...numberLayer(), value }) as Layer;
const docWith = (value: string) => ({ ...withFont, layers: [numberWith(value)] });

function messages(input: unknown, options?: Parameters<typeof validateDesign>[1]): string[] {
  const result = validateDesign(input, options);
  return result.ok ? [] : result.errors.map((e) => e.message);
}

const TOO_LONG = (value: string) => `${JSON.stringify(value)} has more than 2 digits (the largest jersey number is 99; leading zeros count)`;

describe("a number layer with Arabic digits", () => {
  it.each(["٧", "٠٧", "٩٩", "۷", "۹۹"])("%s is accepted by validateDesign and addLayer, stored as typed", (value) => {
    expect(validateDesign(docWith(value)).ok).toBe(true);
    expect(addLayer(withFont, numberWith(value)).layers[0]).toMatchObject({ value });
  });

  it("is accepted by updateLayer, and the digits are not converted", () => {
    const base = addLayer(withFont, numberWith("7"));
    expect(updateLayer(base, "number-1", { value: "٧" }).layers[0]).toMatchObject({ value: "٧" });
  });
});

describe('"100" is rejected with the readable message', () => {
  it("by validateDesign", () => {
    expect(messages(docWith("100"))).toEqual([`layers[0].value: ${TOO_LONG("100")}`]);
  });

  it("by addLayer", () => {
    expect(() => addLayer(withFont, numberWith("100"))).toThrow(`layer.value: ${TOO_LONG("100")}`);
    expect(() => addLayer(withFont, numberWith("100"))).toThrow(DesignError);
  });

  it("by updateLayer, which leaves the document unchanged", () => {
    const base = addLayer(withFont, numberWith("7"));
    expect(() => updateLayer(base, "number-1", { value: "100" })).toThrow(`layer.value: ${TOO_LONG("100")}`);
    expect(base.layers[0]).toMatchObject({ value: "7" });
  });

  it("by assertValidDesign", () => {
    expect(() => assertValidDesign(docWith("100"))).toThrow(TOO_LONG("100"));
  });
});

describe("the same message comes from the schema's structural check and from the rule", () => {
  it("mixed digit systems", () => {
    const expected = '"1٢" mixes two digit systems (Western (0-9) and Arabic-Indic (٠-٩)); use one system only';
    expect(messages(docWith("1٢"))).toEqual([`layers[0].value: ${expected}`]);
    expect(() => addLayer(withFont, numberWith("1٢"))).toThrow(`layer.value: ${expected}`);
  });

  it("characters that are not digits, and empty", () => {
    expect(messages(docWith("7a"))[0]).toContain('layers[0].value: "7a" contains characters that are not digits');
    expect(messages(docWith(" 7"))[0]).toContain("spaces are not allowed and are not trimmed");
    expect(messages(docWith(""))).toEqual(["layers[0].value: is empty; a jersey number needs at least one digit"]);
  });

  it("a value that is not a string is reported by the type check", () => {
    const doc = { ...withFont, layers: [{ ...numberLayer(), value: 7 }] };
    expect(messages(doc)).toHaveLength(1);
    expect(messages(doc)[0]).toMatch(/^layers\[0\]\.value: /);
  });
});

describe("rules can be passed to validateDesign and the edit functions", () => {
  const three: JerseyNumberRules = { ...DEFAULT_JERSEY_NUMBER_RULES, maxValue: 999 };
  const westernOnly: JerseyNumberRules = { maxValue: 99, digitSystems: [WESTERN_DIGITS] };

  it('a maximum of 999 accepts "100" and "007"', () => {
    for (const value of ["100", "007", "999"]) {
      expect(validateDesign(docWith(value), { jerseyNumberRules: three }).ok).toBe(true);
      expect(addLayer(withFont, numberWith(value), { jerseyNumberRules: three }).layers[0]).toMatchObject({ value });
    }
    expect(validateDesign(docWith("1000"), { jerseyNumberRules: three }).ok).toBe(false);
  });

  it("a Western-only rule refuses Arabic digits with a clear message, everywhere", () => {
    const expected = '"٧" uses Arabic-Indic (٠-٩) digits, which are not allowed; allowed: Western (0-9)';
    expect(messages(docWith("٧"), { jerseyNumberRules: westernOnly })).toEqual([`layers[0].value: ${expected}`]);
    expect(() => addLayer(withFont, numberWith("٧"), { jerseyNumberRules: westernOnly })).toThrow(expected);
    const base = addLayer(withFont, numberWith("7"), { jerseyNumberRules: westernOnly });
    expect(() => updateLayer(base, "number-1", { value: "٧" }, { jerseyNumberRules: westernOnly })).toThrow(expected);
  });

  it("rules are used together with { product }", () => {
    expect(validateDesign(docWith("100"), { product, jerseyNumberRules: three }).ok).toBe(true);
    expect(validateDesign(docWith("100"), { product }).ok).toBe(false);
  });

  it("number rules apply to number layers only: a text layer may hold any text", () => {
    const text = addLayer(withFont, { ...numberLayer(), id: "t", kind: "text", value: "100 TIGERS", direction: "auto" } as Layer);
    expect(text.layers[0]).toMatchObject({ value: "100 TIGERS" });
  });

  it("unusable rules never throw from validateDesign; the edits throw a DesignError", () => {
    const bad = { maxValue: -5, digitSystems: [] } as unknown as JerseyNumberRules;
    const result = validateDesign(docWith("7"), { jerseyNumberRules: bad });
    expect(result.ok).toBe(false);
    expect(!result.ok && result.errors[0]!.message).toContain("cannot check number layers");
    expect(() => addLayer(withFont, numberWith("7"), { jerseyNumberRules: bad })).toThrow(DesignError);
    expect(() => updateLayer(withFont, "x", {}, { jerseyNumberRules: bad })).toThrow(DesignError);
  });
});

describe("error messages do not repeat the path", () => {
  it("a zone key problem names the key once, in the path", () => {
    const doc = JSON.parse(JSON.stringify(withFont).replace('"zones":{', '"zones":{"__proto__":{"id":"x","hex":"#000000"},'));
    const result = validateDesign(doc);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    const [error] = result.errors;
    expect(error).toEqual({
      path: "zones.__proto__",
      message: "zones.__proto__: this name is reserved and cannot be used as a zone id",
    });
  });

  it("no custom message, apart from the leading `path: `, contains its own path", () => {
    const odd = { ...product, zones: [...product.zones, { ...product.zones[0]!, id: "toString" }] };
    const doc = { ...withFont, zones: { ...withFont.zones, pockets: withFont.zones.body } };
    const results = [validateDesign(withFont, { product: odd }), validateDesign(doc, { product }), validateDesign(docWith("100"))];
    for (const result of results) {
      expect(result.ok).toBe(false);
      if (result.ok) continue;
      for (const { path, message } of result.errors) {
        expect(message.startsWith(`${path}: `)).toBe(true);
        expect(message.slice(path.length + 2)).not.toContain(path);
      }
    }
  });
});
