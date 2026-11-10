// Tests added in the S0-3b fix round (QA findings D3 to D6 and the minor items).
import { describe, expect, it } from "vitest";
import { createDesign } from "./create.js";
import type { Layer } from "./schema.js";
import { addFont, addLayer, removeLayer, setZoneColor, updateLayer } from "./edit.js";
import { DesignError, validateDesign, validateProductDefinition } from "./validate.js";
import { fullDesign, loadPlaceholderProduct, numberLayer, RED, textLayer } from "../test/fixtures";

const product = loadPlaceholderProduct();
const empty = createDesign(product);
const numberWith = (value: string): Layer => ({ ...numberLayer(), value }) as Layer;
const withFont = addFont(empty, { id: "font-sans", family: "Inter", weight: 700 });

function messages(input: unknown, options?: Parameters<typeof validateDesign>[1]): string[] {
  const result = validateDesign(input, options);
  return result.ok ? [] : result.errors.map((e) => e.message);
}

/** The error thrown by a function, for checks on its type and message. */
function thrown(fn: () => unknown): unknown {
  try {
    fn();
  } catch (error) {
    return error;
  }
  throw new Error("expected the function to throw");
}

describe("D3: edits refuse references that do not exist", () => {
  it("addLayer refuses a fontId that is not in the document's fonts", () => {
    const error = thrown(() => addLayer(empty, textLayer({ fontId: "font-serif" })));
    expect(error).toBeInstanceOf(DesignError);
    expect((error as Error).message).toMatch(/font "font-serif" is not in the document's fonts \(fonts: none\).*addFont/);
    expect(thrown(() => addLayer(withFont, textLayer({ fontId: "font-serif" })))).toMatchObject({
      message: expect.stringContaining("(fonts: font-sans)"),
    });
  });

  it("addLayer refuses a number layer with an unlisted font too", () => {
    expect(() => addLayer(empty, numberLayer())).toThrow(DesignError);
  });

  it("updateLayer refuses to switch a layer to an unlisted font", () => {
    const design = addLayer(withFont, textLayer());
    const error = thrown(() => updateLayer(design, "text-1", { fontId: "font-serif" }));
    expect(error).toBeInstanceOf(DesignError);
    expect((error as Error).message).toMatch(/font "font-serif" is not in the document's fonts/);
    const ok = updateLayer(addFont(design, { id: "font-serif", family: "Georgia" }), "text-1", { fontId: "font-serif" });
    expect(ok.layers[0]).toMatchObject({ fontId: "font-serif" });
  });

  it("addLayer with { product } refuses a pieceId the product does not have", () => {
    const error = thrown(() => addLayer(withFont, textLayer({ pieceId: "hood" }), { product }));
    expect(error).toBeInstanceOf(DesignError);
    expect((error as Error).message).toMatch(/product "placeholder-jersey" has no pattern piece "hood" \(pieces: front, back/);
  });

  it("updateLayer with { product } refuses an unknown pieceId", () => {
    const design = addLayer(withFont, textLayer(), { product });
    expect(() => updateLayer(design, "text-1", { pieceId: "hood" }, { product })).toThrow(/no pattern piece "hood"/);
    expect(updateLayer(design, "text-1", { pieceId: "back" }, { product }).layers[0]).toMatchObject({ pieceId: "back" });
  });

  it("without { product } an unknown pieceId is accepted: the document cannot know the pieces", () => {
    expect(addLayer(withFont, textLayer({ pieceId: "hood" })).layers).toHaveLength(1);
  });

  it("setZoneColor with { product } refuses a zone the product does not have", () => {
    const odd = { ...empty, zones: { ...empty.zones, pockets: RED } };
    expect(() => setZoneColor(odd, "pockets", RED)).not.toThrow();
    expect(() => setZoneColor(odd, "pockets", RED, { product })).toThrow(/product "placeholder-jersey" has no colour zone "pockets"/);
    expect(setZoneColor(empty, "body", RED, { product }).zones.body).toEqual(RED);
  });

  it("refuses a { product } that is for another design", () => {
    const other = { ...product, id: "other-product" };
    expect(() => addLayer(withFont, textLayer(), { product: other })).toThrow(/design is for product "placeholder-jersey" but the product given is "other-product"/);
  });

  it("refuses a { product } that is not a product definition", () => {
    expect(() => addLayer(withFont, textLayer(), { product: {} as never })).toThrow(DesignError);
  });

  it("leaves fonts that no layer uses any more in the document (documented behaviour)", () => {
    const design = removeLayer(addLayer(withFont, textLayer()), "text-1");
    expect(design.fonts).toEqual(withFont.fonts);
    expect(validateDesign(design, { product }).ok).toBe(true);
  });
});

describe("D4: validateDesign never throws", () => {
  it("returns a root-level error for an object with a throwing getter", () => {
    const hostile = {
      get schemaVersion(): number {
        throw new Error("boom");
      },
    };
    const result = validateDesign(hostile);
    expect(result).toEqual({ ok: false, errors: [{ path: "", message: "a design could not be read (boom)" }] });
  });

  it("returns a root-level error for a nested throwing getter", () => {
    const design = { ...empty, zones: { get body(): never { throw new Error("nested boom"); } } };
    const result = validateDesign(design);
    expect(result.ok).toBe(false);
    expect(messages(design)[0]).toMatch(/could not be read.*nested boom/);
  });

  it("returns a root-level error for a Proxy that throws on every access", () => {
    const proxy = new Proxy(
      {},
      {
        get() {
          throw new Error("proxy get");
        },
        ownKeys() {
          throw new Error("proxy keys");
        },
        getOwnPropertyDescriptor() {
          throw new Error("proxy descriptor");
        },
      },
    );
    const result = validateDesign(proxy);
    expect(result.ok).toBe(false);
    expect(messages(proxy)).toHaveLength(1);
    expect(messages(proxy)[0]).toMatch(/could not be read/);
  });

  it("copes with a thrown value that is not an Error, and one that cannot be turned into text", () => {
    const strings = { get schemaVersion(): number { throw "plain string"; } };
    expect(messages(strings)[0]).toContain("plain string");
    const opaque = { get schemaVersion(): number { throw Object.create(null); } };
    expect(validateDesign(opaque).ok).toBe(false);
  });

  it("covers a bad { product } option and validateProductDefinition as well", () => {
    expect(validateDesign(empty, { product: {} as never }).ok).toBe(false);
    const hostile = new Proxy({}, { ownKeys() { throw new Error("nope"); }, get() { throw new Error("nope"); } });
    const result = validateProductDefinition(hostile);
    expect(result.ok).toBe(false);
  });
});

describe("D5: bad arguments to edits throw DesignError, not TypeError", () => {
  it.each<[string, () => unknown]>([
    ["updateLayer with an undefined patch", () => updateLayer(addLayer(withFont, textLayer()), "text-1", undefined as never)],
    ["updateLayer with a null patch", () => updateLayer(addLayer(withFont, textLayer()), "text-1", null as never)],
    ["updateLayer with an array patch", () => updateLayer(addLayer(withFont, textLayer()), "text-1", [] as never)],
    ["updateLayer with a non-string id", () => updateLayer(withFont, undefined as never, {})],
    ["updateLayer with a null design", () => updateLayer(null as never, "text-1", {})],
    ["setZoneColor with a null design", () => setZoneColor(null as never, "body", RED)],
    ["setZoneColor with an undefined design", () => setZoneColor(undefined as never, "body", RED)],
    ["setZoneColor with a number zone id", () => setZoneColor(empty, 5 as never, RED)],
    ["setZoneColor with an undefined colour", () => setZoneColor(empty, "body", undefined as never)],
    ["addLayer with a null design", () => addLayer(null as never, textLayer())],
    ["addLayer with an undefined layer", () => addLayer(withFont, undefined as never)],
    ["addLayer with a design that is a string", () => addLayer("design" as never, textLayer())],
    ["addLayer with a half-built design", () => addLayer({} as never, textLayer())],
    ["removeLayer with a null design", () => removeLayer(null as never, "x")],
    ["removeLayer with an undefined id", () => removeLayer(withFont, undefined as never)],
    ["addFont with a null design", () => addFont(null as never, { id: "f", family: "F" })],
    ["addFont with an undefined font", () => addFont(withFont, undefined as never)],
  ])("%s", (_name, call) => {
    const error = thrown(call);
    expect(error).toBeInstanceOf(DesignError);
    expect(error).not.toBeInstanceOf(TypeError);
    expect((error as Error).message.length).toBeGreaterThan(10);
  });

  it("explains what was wrong", () => {
    expect((thrown(() => updateLayer(withFont, "x", undefined as never)) as Error).message).toMatch(/no layer|changes must be an object/);
    expect((thrown(() => updateLayer(addLayer(withFont, textLayer()), "text-1", undefined as never)) as Error).message).toBe(
      'Cannot update layer "text-1": the changes must be an object, got undefined',
    );
    expect((thrown(() => setZoneColor(null as never, "body", RED)) as Error).message).toBe(
      "Cannot set colour: the first argument must be a design document, got null",
    );
  });
});

describe("D6: nothing is silently dropped from a map", () => {
  const withZoneKey = (key: string): unknown =>
    JSON.parse(JSON.stringify(empty).replace('"zones":{', `"zones":{${JSON.stringify(key)}:{"id":"x","hex":"#000000"},`));

  it('rejects "__proto__" as a zone key in parsed JSON (zod would drop it)', () => {
    const doc = withZoneKey("__proto__");
    expect(Object.getOwnPropertyNames((doc as { zones: object }).zones)).toContain("__proto__");
    const result = validateDesign(doc);
    expect(result).toEqual({
      ok: false,
      errors: [{ path: "zones.__proto__", message: 'zones.__proto__: this name is reserved and cannot be used as a zone id' }],
    });
  });

  it('rejects "__proto__" as a zone key, also when checking against a product', () => {
    expect(validateDesign(withZoneKey("__proto__"), { product }).ok).toBe(false);
  });

  it.each(["constructor", "prototype"])('rejects "%s" as a zone key', (key) => {
    const errors = messages(withZoneKey(key));
    expect(errors.some((m) => m.startsWith(`zones.${key}: must be 1 to 64 characters`) && m.includes("not one of: __proto__, constructor, prototype"))).toBe(true);
  });

  it('reports "__proto__" anywhere else as an unknown field', () => {
    const top = JSON.parse(JSON.stringify(fullDesign(empty)).replace('"layers":[', '"__proto__":{"x":1},"layers":['));
    expect(messages(top)).toContain("__proto__: unknown field");
    const layer = JSON.parse(JSON.stringify(fullDesign(empty)).replace('"kind":"text"', '"kind":"text","__proto__":{"x":1}'));
    expect(messages(layer)).toContain("layers[0].__proto__: unknown field");
  });

  it("rejects a product definition with a reserved zone id", () => {
    const bad = { ...product, zones: product.zones.map((z, i) => (i === 0 ? { ...z, id: "constructor" } : z)) };
    expect(validateProductDefinition(bad).ok).toBe(false);
  });

  it("does not let an inherited name stand in for a missing zone", () => {
    const odd = { ...product, zones: [...product.zones, { ...product.zones[0]!, id: "toString" }] };
    const errors = messages(empty, { product: odd });
    expect(errors).toContain('zones.toString: this colour zone has no colour');
  });
});

describe("text layers accept any script", () => {
  const values = [
    ["Urdu name", "عائشہ"],
    ["Arabic name", "محمد"],
    ["Arabic with diacritics", "مُحَمَّد"],
    ["mixed Latin, Arabic and digits", "Ali علي 10"],
    ["Latin with a combining accent", "José"],
    ["Latin with a precomposed accent", "José"],
  ] as const;

  it.each(values)("accepts %s and keeps it exactly as written", (_name, value) => {
    const layer = textLayer({ value });
    const added = addLayer(withFont, layer);
    expect(added.layers[0]).toMatchObject({ value });
    expect(validateDesign(added, { product }).ok).toBe(true);
    // Survives a JSON round trip unchanged (no normalisation).
    const reparsed = validateDesign(JSON.parse(JSON.stringify(added)));
    expect(reparsed.ok && reparsed.value.layers[0]).toMatchObject({ value });
    expect(updateLayer(withFont.layers.length ? withFont : addLayer(withFont, textLayer()), "text-1", { value }).layers[0]).toMatchObject({ value });
  });

  it("does not normalise: a combining sequence and its precomposed form stay different", () => {
    const decomposed = addLayer(withFont, textLayer({ value: "José" })).layers[0];
    expect(decomposed).toMatchObject({ value: "José" });
    expect(decomposed).not.toMatchObject({ value: "José" });
  });
});

describe("number layers", () => {
  // The jersey number rule itself is tested in jersey-number.test.ts; the document tests are in jersey-number-layer.test.ts.
  it("rejects four digits with a readable message (the rule is now: at most two digits, value 0 to 99)", () => {
    expect(() => addLayer(withFont, numberWith("1234"))).toThrow('layer.value: "1234" has more than 2 digits');
    const doc = { ...withFont, layers: [numberWith("1234")] };
    expect(messages(doc)).toEqual(['layers[0].value: "1234" has more than 2 digits (the largest jersey number is 99; leading zeros count)']);
  });

  it("accepts one or two digits, keeping leading zeros as typed", () => {
    for (const value of ["7", "07", "00", "99"]) {
      expect(addLayer(withFont, numberWith(value)).layers[0]).toMatchObject({ value });
    }
  });

  it("no longer accepts three digits", () => {
    for (const value of ["100", "007", "999"]) {
      expect(() => addLayer(withFont, numberWith(value))).toThrow(DesignError);
    }
  });
});

describe("rotation and position behave as the README says", () => {
  it("keeps rotation as given, in degrees: it is not normalised or wrapped", () => {
    for (const rotation of [0, 90, -30, 360, 725.5, -720]) {
      expect(addLayer(withFont, textLayer({ rotation })).layers[0]).toMatchObject({ rotation });
    }
  });

  it("refuses a rotation that is not a finite number", () => {
    expect(() => addLayer(withFont, textLayer({ rotation: Number.NaN }))).toThrow(DesignError);
    expect(() => addLayer(withFont, textLayer({ rotation: Number.POSITIVE_INFINITY }))).toThrow(DesignError);
    expect(() => addLayer(withFont, textLayer({ rotation: "90" as never }))).toThrow(/layer\.rotation/);
  });

  it("accepts a position outside the piece: staying inside it is not checked yet", () => {
    // The front piece is 560 x 700 mm. Checking that layers lie inside it is listed under "Deliberately left for later".
    for (const position of [{ x: -50, y: -50 }, { x: 5000, y: 9000 }, { x: 0, y: 0 }]) {
      const design = addLayer(withFont, textLayer({ position }), { product });
      expect(design.layers[0]).toMatchObject({ position });
      expect(validateDesign(design, { product }).ok).toBe(true);
    }
  });

  it("position is the layer centre: a centre on the piece corner is stored as given", () => {
    expect(addLayer(withFont, textLayer({ position: { x: 0, y: 0 } })).layers[0]).toMatchObject({ position: { x: 0, y: 0 } });
  });

  it("still needs a positive size", () => {
    expect(() => addLayer(withFont, textLayer({ size: { width: 0, height: 10 } }))).toThrow(/layer\.size\.width/);
    expect(() => addLayer(withFont, textLayer({ size: { width: 10, height: -1 } }))).toThrow(/layer\.size\.height/);
  });
});

describe("clearer validation messages", () => {
  it("names the unknown layer kind once, without repeating the field name", () => {
    const doc = JSON.parse(JSON.stringify(fullDesign(empty)));
    doc.layers[0].kind = "sticker";
    expect(messages(doc)).toEqual(['layers[0].kind: "sticker" is not a layer kind; use one of text, number, logo, clipart']);
  });

  it("says a missing kind is required", () => {
    const doc = JSON.parse(JSON.stringify(fullDesign(empty)));
    delete doc.layers[0].kind;
    expect(messages(doc)).toEqual(["layers[0].kind: is required: one of text, number, logo, clipart"]);
  });

  it("says a layer that is not an object must be one", () => {
    expect(messages({ ...empty, layers: [5] })).toEqual(["layers[0]: must be a layer object with a 'kind' of text, number, logo, clipart"]);
  });

  it("says which field is missing instead of 'Invalid input: expected object, received undefined'", () => {
    const doc = JSON.parse(JSON.stringify(fullDesign(empty)));
    delete doc.layers[0].position;
    delete doc.layers[0].fontSize;
    const errors = messages(doc);
    expect(errors).toContain("layers[0].position: is required but missing (expected object)");
    expect(errors).toContain("layers[0].fontSize: is required but missing (expected number)");
    expect(errors.join("\n")).not.toContain("Invalid input");
  });

  it("says a missing top-level field is missing", () => {
    const doc = JSON.parse(JSON.stringify(empty));
    delete doc.zones;
    expect(messages(doc)).toEqual(["zones: is required but missing (expected record)"]);
  });
});
