import { describe, expect, it } from "vitest";
import { createDesign } from "./create";
import { DesignError, assertValidDesign, validateDesign, validateProductDefinition } from "./validate";
import { fullDesign, loadPlaceholderProduct } from "../test/fixtures";

const product = loadPlaceholderProduct();
const base = createDesign(product);

/** Deep copy typed loosely, so a test can break the document on purpose. */
function broken(mutate: (doc: Record<string, any>) => void, source: unknown = fullDesign(base)) {
  const copy = JSON.parse(JSON.stringify(source)) as Record<string, any>;
  mutate(copy);
  return copy;
}

function messages(input: unknown, options?: Parameters<typeof validateDesign>[1]): string[] {
  const result = validateDesign(input, options);
  return result.ok ? [] : result.errors.map((e) => e.message);
}

describe("validateDesign: valid documents", () => {
  it("accepts an empty design", () => {
    expect(validateDesign(base)).toMatchObject({ ok: true });
  });

  it("accepts a design that uses every layer kind", () => {
    expect(validateDesign(fullDesign(base), { product })).toMatchObject({ ok: true });
  });

  it("returns a copy, not the input", () => {
    const input = fullDesign(base);
    const result = validateDesign(input);
    expect(result.ok && result.value).toEqual(input);
    expect(result.ok && result.value).not.toBe(input);
  });
});

describe("validateDesign: invalid documents", () => {
  it("rejects things that are not objects", () => {
    expect(messages(null)).toEqual(["a design must be a JSON object"]);
    expect(messages("hello")).toEqual(["a design must be a JSON object"]);
    expect(messages([])).toEqual(["a design must be a JSON object"]);
  });

  it("explains a newer schemaVersion", () => {
    const [message] = messages(broken((d) => (d.schemaVersion = 4)));
    expect(message).toContain("schemaVersion");
    expect(message).toContain("newer");
    expect(message).toContain("update the editor package");
  });

  it("explains an older, unsupported schemaVersion", () => {
    expect(messages(broken((d) => (d.schemaVersion = 1))).join()).toContain("not supported");
  });

  it("names the path of a missing field", () => {
    const result = validateDesign(broken((d) => delete d.zones));
    expect(result.ok).toBe(false);
    expect(!result.ok && result.errors.map((e) => e.path)).toContain("zones");
  });

  it("reports a bad hex colour with the full path and a hint", () => {
    const [message] = messages(broken((d) => (d.zones.body.hex = "#ffffff")));
    expect(message).toContain("zones.body.hex");
    expect(message).toContain("upper-case hex");
  });

  it("reports a layer's problems with its index", () => {
    const errors = messages(
      broken((d) => {
        d.layers[0].size.width = -5;
        d.layers[1].value = "ABC";
      }),
    );
    expect(errors.some((m) => m.startsWith("layers[0].size.width"))).toBe(true);
    expect(errors.some((m) => m.startsWith("layers[1].value") && m.includes("contains characters that are not digits"))).toBe(true);
  });

  it("reports an unknown layer kind", () => {
    const [message] = messages(broken((d) => (d.layers[0].kind = "sticker")));
    expect(message).toContain("layers[0]");
    expect(message).toContain("text, number, logo, clipart");
  });

  it("reports unknown fields, because nothing may be silently dropped", () => {
    const errors = messages(broken((d) => (d.layers[2].flattenedPng = "data:image/png;base64,AAAA")));
    expect(errors).toContain("layers[2].flattenedPng: unknown field");
  });

  it("rejects an unsupported media type for an asset", () => {
    const errors = messages(broken((d) => (d.layers[2].asset.mediaType = "application/pdf")));
    expect(errors.some((m) => m.startsWith("layers[2].asset.mediaType"))).toBe(true);
  });

  it("rejects duplicate layer ids", () => {
    const errors = messages(broken((d) => (d.layers[1].id = d.layers[0].id)));
    expect(errors).toContain('layers[1].id: duplicate layer id "text-1"');
  });

  it("rejects a text layer whose font is not listed", () => {
    const errors = messages(broken((d) => (d.fonts = [])));
    expect(errors.some((m) => m.startsWith("layers[0].fontId") && m.includes("not listed in 'fonts'"))).toBe(true);
  });

  it("rejects duplicate font ids", () => {
    const errors = messages(broken((d) => d.fonts.push({ ...d.fonts[0] })));
    expect(errors).toContain('fonts[1].id: duplicate font id "font-sans"');
  });

  it("collects several errors at once", () => {
    const errors = messages(
      broken((d) => {
        d.zones.body.hex = "red";
        d.palette.version = -1;
        d.layers[0].fontSize = 0;
      }),
    );
    expect(errors.length).toBeGreaterThanOrEqual(3);
  });
});

describe("validateDesign: against a product", () => {
  it("rejects a design for another product", () => {
    const errors = messages(broken((d) => (d.product.id = "other")), { product });
    expect(errors.some((m) => m.startsWith("product.id"))).toBe(true);
  });

  it("rejects a zone the product does not have", () => {
    const errors = messages(broken((d) => (d.zones.pockets = d.zones.body)), { product });
    expect(errors).toContain('zones.pockets: product "placeholder-jersey" has no colour zone with this id');
  });

  it("rejects a missing zone", () => {
    const errors = messages(broken((d) => delete d.zones.collar), { product });
    expect(errors).toContain('zones.collar: this colour zone has no colour');
  });

  it("rejects a layer on a pattern piece that does not exist", () => {
    const errors = messages(broken((d) => (d.layers[0].pieceId = "hood")), { product });
    expect(errors).toContain('layers[0].pieceId: product "placeholder-jersey" has no pattern piece "hood"');
  });

  it("rejects a different palette", () => {
    const errors = messages(broken((d) => (d.palette.id = "other-palette")), { product });
    expect(errors.some((m) => m.startsWith("palette.id"))).toBe(true);
  });
});

describe("assertValidDesign and DesignError", () => {
  it("returns the document when valid", () => {
    expect(assertValidDesign(base)).toEqual(base);
  });

  it("throws a DesignError that lists every problem", () => {
    const input = broken((d) => {
      d.zones.body.hex = "nope";
      d.layers[0].fontSize = 0;
    });
    let caught: unknown;
    try {
      assertValidDesign(input);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(DesignError);
    expect((caught as DesignError).errors.length).toBeGreaterThanOrEqual(2);
    expect((caught as DesignError).message).toContain("zones.body.hex");
  });
});

describe("validateProductDefinition", () => {
  it("accepts the placeholder product", () => {
    expect(validateProductDefinition(product)).toMatchObject({ ok: true });
  });

  it("rejects duplicate piece ids", () => {
    const copy = JSON.parse(JSON.stringify(product)) as typeof product;
    copy.pieces[1] = { ...copy.pieces[1]!, id: copy.pieces[0]!.id };
    const result = validateProductDefinition(copy);
    expect(!result.ok && result.errors.map((e) => e.message)).toContain('pieces[1].id: duplicate id "front"');
  });

  it("rejects a UV rectangle outside 0 to 1", () => {
    const copy = JSON.parse(JSON.stringify(product)) as typeof product;
    copy.pieces[0]!.uv.width = 0.99;
    const result = validateProductDefinition(copy);
    expect(!result.ok && result.errors[0]?.message).toContain("pieces[0].uv");
  });

  it("rejects a model that is not a glb", () => {
    const copy = JSON.parse(JSON.stringify(product)) as Record<string, any>;
    copy.model.format = "obj";
    expect(validateProductDefinition(copy).ok).toBe(false);
  });
});
