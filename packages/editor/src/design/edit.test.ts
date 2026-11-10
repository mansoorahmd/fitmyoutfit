import { describe, expect, it } from "vitest";
import { createDesign } from "./create";
import { addFont, addLayer, removeLayer, setZoneColor, updateLayer } from "./edit";
import { DesignError, validateDesign } from "./validate";
import { clipartLayer, GREEN, loadPlaceholderProduct, logoLayer, RED, textLayer } from "../test/fixtures";

const product = loadPlaceholderProduct();

/** Runs an edit and checks that the input document was left exactly as it was. */
function leavesInputUntouched<T>(input: object, edit: () => T): T {
  const snapshot = structuredClone(input);
  const result = edit();
  expect(input).toEqual(snapshot);
  return result;
}

describe("setZoneColor", () => {
  const design = createDesign(product);

  it("sets one zone and leaves the others alone", () => {
    const next = leavesInputUntouched(design, () => setZoneColor(design, "sleeves", RED));
    expect(next.zones.sleeves).toEqual(RED);
    expect(next.zones.body).toEqual(design.zones.body);
    expect(next).not.toBe(design);
    expect(next.zones).not.toBe(design.zones);
    expect(design.zones.sleeves).not.toEqual(RED);
  });

  it("copes with a colour object the caller reuses and mutates later", () => {
    const colour = { ...GREEN };
    const next = setZoneColor(design, "body", colour);
    colour.hex = "#000000";
    expect(next.zones.body).toEqual(GREEN);
  });

  it("refuses an unknown zone and names the zones that exist", () => {
    expect(() => setZoneColor(design, "pockets", RED)).toThrow(/no colour zone "pockets".*body, sleeves, collar/);
  });

  it("refuses a bad colour with a readable message", () => {
    expect(() => setZoneColor(design, "body", { id: "x", hex: "red" })).toThrow(DesignError);
    expect(() => setZoneColor(design, "body", { id: "x", hex: "red" })).toThrow(/color\.hex/);
  });

  it("does not treat 'toString' or other inherited names as zones", () => {
    expect(() => setZoneColor(design, "toString", RED)).toThrow(/no colour zone/);
  });
});

describe("addFont", () => {
  const design = createDesign(product);

  it("adds a font without touching the input", () => {
    const next = leavesInputUntouched(design, () => addFont(design, { id: "font-sans", family: "Inter" }));
    expect(next.fonts).toEqual([{ id: "font-sans", family: "Inter" }]);
  });

  it("replaces a font with the same id", () => {
    const once = addFont(design, { id: "font-sans", family: "Inter" });
    const twice = addFont(once, { id: "font-sans", family: "Inter", weight: 700 });
    expect(twice.fonts).toEqual([{ id: "font-sans", family: "Inter", weight: 700 }]);
  });

  it("refuses an invalid font", () => {
    expect(() => addFont(design, { id: "bad id!", family: "Inter" })).toThrow(/font\.id/);
  });
});

describe("addLayer", () => {
  const design = addFont(createDesign(product), { id: "font-sans", family: "Inter" });

  it("adds layers on top, in order, without touching the input", () => {
    const one = leavesInputUntouched(design, () => addLayer(design, textLayer()));
    const two = leavesInputUntouched(one, () => addLayer(one, logoLayer()));
    expect(two.layers.map((l) => l.id)).toEqual(["text-1", "logo-1"]);
    expect(design.layers).toEqual([]);
    expect(validateDesign(two, { product })).toMatchObject({ ok: true });
  });

  it("stores a copy of the layer", () => {
    const layer = textLayer();
    const next = addLayer(design, layer);
    expect(next.layers[0]).toEqual(layer);
    expect(next.layers[0]).not.toBe(layer);
  });

  it("refuses a duplicate id", () => {
    const one = addLayer(design, textLayer());
    expect(() => addLayer(one, textLayer())).toThrow('a layer with id "text-1" already exists');
  });

  it("refuses an invalid layer with a readable path", () => {
    expect(() => addLayer(design, textLayer({ size: { width: 0, height: 10 } }))).toThrow(/layer\.size\.width/);
  });

  it("refuses a layer with a flattened extra field", () => {
    const sneaky = { ...logoLayer(), pixels: "AAAA" } as unknown as ReturnType<typeof logoLayer>;
    expect(() => addLayer(design, sneaky)).toThrow(/layer\.pixels: unknown field/);
  });
});

describe("updateLayer", () => {
  const design = addLayer(
    addLayer(addFont(createDesign(product), { id: "font-sans", family: "Inter" }), textLayer()),
    clipartLayer(),
  );

  it("changes only the given fields of one layer", () => {
    const next = leavesInputUntouched(design, () =>
      updateLayer(design, "text-1", { value: "LIONS", rotation: 10 }),
    );
    expect(next.layers[0]).toMatchObject({ id: "text-1", value: "LIONS", rotation: 10, fontSize: 60 });
    expect(next.layers[1]).toBe(design.layers[1]);
    expect(design.layers[0]).toMatchObject({ value: "TIGERS", rotation: 0 });
  });

  it("replaces nested objects whole", () => {
    const next = updateLayer(design, "clipart-1", { position: { x: 1, y: 2 } });
    expect(next.layers[1]).toMatchObject({ position: { x: 1, y: 2 } });
  });

  it("keeps the layer order", () => {
    const next = updateLayer(design, "text-1", { value: "X" });
    expect(next.layers.map((l) => l.id)).toEqual(["text-1", "clipart-1"]);
  });

  it("refuses an unknown layer", () => {
    expect(() => updateLayer(design, "nope", { rotation: 1 })).toThrow('no layer with id "nope"');
  });

  it("refuses to change id or kind", () => {
    expect(() => updateLayer(design, "text-1", { id: "other" } as never)).toThrow(/'id' cannot be changed/);
    expect(() => updateLayer(design, "text-1", { kind: "logo" } as never)).toThrow(/'kind' cannot be changed/);
  });

  it("refuses a patch that makes the layer invalid", () => {
    expect(() => updateLayer(design, "text-1", { fontSize: -1 })).toThrow(/layer\.fontSize/);
  });

  it("refuses fields that do not belong to the layer kind", () => {
    expect(() => updateLayer(design, "clipart-1", { fontSize: 12 } as never)).toThrow(/layer\.fontSize: unknown field/);
  });
});

describe("removeLayer", () => {
  const design = addLayer(addLayer(createDesign(product), logoLayer()), clipartLayer());

  it("removes one layer without touching the input", () => {
    const next = leavesInputUntouched(design, () => removeLayer(design, "logo-1"));
    expect(next.layers.map((l) => l.id)).toEqual(["clipart-1"]);
    expect(design.layers).toHaveLength(2);
  });

  it("refuses an unknown layer", () => {
    expect(() => removeLayer(design, "nope")).toThrow('no layer with id "nope"');
  });
});

describe("edits compose into a valid document", () => {
  it("builds a full design step by step", () => {
    let design = createDesign(product);
    design = setZoneColor(design, "body", GREEN);
    design = addFont(design, { id: "font-sans", family: "Inter", weight: 700 });
    design = addLayer(design, textLayer());
    design = addLayer(design, logoLayer());
    design = updateLayer(design, "logo-1", { rotation: 90 });
    design = removeLayer(design, "text-1");
    expect(validateDesign(design, { product })).toMatchObject({ ok: true });
  });
});
