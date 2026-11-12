import { describe, expect, it } from "vitest";
import v2Designs from "../test/fixtures/v2-sample-designs.json";
import { createDesign } from "./create";
import { DESIGN_SCHEMA_VERSION, type DesignDocument } from "./schema";
import { upgradeDesign, upgradeV2 } from "./upgrade";
import { validateDesign, validateProductDefinition } from "./validate";
import { fullDesign, loadPlaceholderPalette, loadPlaceholderProduct, loadStandInJerseyProduct } from "../test/fixtures";

const product = loadPlaceholderProduct();
const palette = loadPlaceholderPalette();
const base = createDesign(product);

function copy<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function broken(mutate: (doc: Record<string, any>) => void, source: unknown = fullDesign(base)) {
  const doc = copy(source) as Record<string, any>;
  mutate(doc);
  return doc;
}

function messages(input: unknown, options: Parameters<typeof validateDesign>[1] = { product }): string[] {
  const result = validateDesign(input, options);
  return result.ok ? [] : result.errors.map((e) => e.message);
}

const v2 = (v2Designs as Record<string, any>)["placeholder-jersey"];

describe("upgradeDesign: version 2 to version 3", () => {
  it("adds the version 3 fields and keeps every version 2 field", () => {
    const result = upgradeDesign(v2, { product });
    if (!result.ok) throw new Error(result.errors.map((e) => e.message).join("\n"));
    const d = result.value;
    expect(d.schemaVersion).toBe(3);
    expect(d.zones).toEqual(v2.zones);
    expect(d.fonts).toEqual(v2.fonts);
    expect(d.shapes).toEqual([]);
    expect(d.template).toBeNull();
    expect(d.teamName).toBe("");
    // Every layer keeps every field it had; only the role is new.
    d.layers.forEach((layer, i) => expect({ ...layer, role: undefined }).toEqual({ ...v2.layers[i], role: undefined }));
  });

  it("gives each layer a role without guessing from positions: text is free text, logos crests, clipart graphics", () => {
    const d = upgradeV2(v2);
    expect(d.layers.map((l) => [l.kind, l.role])).toEqual([
      ["text", "text"],
      ["text", "text"],
      ["number", "text"], // two numbers with different values ("10" and "٧"): fixed numbers
      ["number", "text"],
      ["logo", "crest"],
      ["clipart", "graphic"],
    ]);
    expect(d.samplePlayer).toEqual({ name: "", number: "" });
  });

  it("numbers that all show one value become the player's number, and that value the sample player's number", () => {
    const one = copy(v2);
    one.layers = one.layers.filter((l: any) => l.id !== "number-2");
    const d = upgradeV2(one);
    expect(d.layers.find((l) => l.kind === "number")!.role).toBe("player-number");
    expect(d.samplePlayer.number).toBe("10");
    expect(validateDesign(d, { product }).ok).toBe(true);
  });

  it("takes Main from the first zone and Second from the first zone of another colour", () => {
    expect(upgradeV2(v2).teamColors).toEqual({ main: v2.zones.body, second: v2.zones.yoke });
    const oneColour = copy(v2);
    for (const zone of Object.keys(oneColour.zones)) oneColour.zones[zone] = { id: "placeholder-white", hex: "#FFFFFF" };
    expect(upgradeV2(oneColour).teamColors).toEqual({ main: { id: "placeholder-white", hex: "#FFFFFF" }, second: { id: "placeholder-white", hex: "#FFFFFF" } });
  });

  it("does not change its input", () => {
    const before = copy(v2);
    upgradeDesign(v2, { product });
    expect(v2).toEqual(before);
  });

  it("passes a version 3 design through validateDesign", () => {
    expect(upgradeDesign(base)).toEqual(validateDesign(base));
  });

  it("refuses version 1, a newer version, a broken version 2 document and a non-object, without throwing", () => {
    const at = (input: unknown) => {
      const r = upgradeDesign(input);
      return r.ok ? [] : r.errors.map((e) => e.message);
    };
    expect(at({ ...copy(v2), schemaVersion: 1 })[0]).toMatch(/format version 1 is not supported .* no migration exists/);
    expect(at({ ...copy(v2), schemaVersion: 4 })[0]).toMatch(/newer than the version this code understands \(3\)/);
    expect(at(broken((d) => (d.layers[0].align = "left"), v2))).toEqual([expect.stringMatching(/^layers\[0\]\.align: /)]);
    expect(at(broken((d) => (d.teamName = "X"), v2))).toEqual(["teamName: unknown field"]);
    expect(at("design")).toEqual(["a design must be a JSON object"]);
    const hostile = new Proxy({}, { get: () => { throw new Error("boom"); }, has: () => { throw new Error("boom"); } });
    expect(at(hostile)[0]).toMatch(/could not be read/);
  });

  it("checks the upgraded design as validateDesign does (a number over 99 in version 2 is refused)", () => {
    const over = broken((d) => (d.layers[2].value = "100"), v2);
    expect(upgradeDesign(over).ok).toBe(false);
  });
});

describe("validateDesign: version 3 documents", () => {
  it("accepts the version 3 document with every new field", () => {
    const d: DesignDocument = {
      ...fullDesign(base),
      teamColors: { main: { id: "placeholder-navy", hex: "#1B2A5C" }, second: { id: "placeholder-white", hex: "#FFFFFF", requested: "#FAFAFA" } },
      teamName: "لاہور لائنز",
      samplePlayer: { name: "Ali", number: "۷" },
      template: { id: "plain", version: 1 },
      zones: { ...base.zones, body: { id: "placeholder-navy", hex: "#1B2A5C", teamColor: "main" } },
      shapes: [{ id: "shape-1", kind: "shape", group: "stripes", pieceId: "front", path: "M 0 300 H 560 V 360 H 0 Z", fill: { id: "placeholder-white", hex: "#FFFFFF", teamColor: "second" }, locked: true }],
    };
    expect(validateDesign(d, { product, palette })).toMatchObject({ ok: true });
    expect(d.schemaVersion).toBe(DESIGN_SCHEMA_VERSION);
  });

  it("refuses a role the layer's kind cannot have", () => {
    expect(messages(broken((d) => (d.layers[2].role = "player-name")))).toEqual([expect.stringMatching(/^layers\[2\]\.role: must be one of "crest", "sponsor", "graphic"/)]);
    expect(messages(broken((d) => (d.layers[0].role = "player-number")))).toEqual([expect.stringMatching(/^layers\[0\]\.role: must be one of "team-name", "player-name", "text", "sponsor"/)]);
    expect(messages(broken((d) => delete d.layers[1].role))).toEqual([expect.stringMatching(/^layers\[1\]\.role: is required but missing/)]);
  });

  it("refuses a placement preset the product does not have, or one on another piece or for another role", () => {
    expect(messages(broken((d) => (d.layers[0].preset = "pocket")))).toEqual([expect.stringMatching(/^layers\[0\]\.preset: product "placeholder-jersey" has no placement preset "pocket" \(presets: chest-centre, /)]);
    expect(messages(broken((d) => (d.layers[0].preset = "back-name")))).toEqual([expect.stringMatching(/preset "back-name" is on piece "back", but the layer is on "front"/)]);
    expect(messages(broken((d) => (d.layers[0].preset = "front-number")))).toEqual([expect.stringMatching(/preset "front-number" takes player-number, not a text layer/)]);
    // Without a product the preset cannot be checked (the document does not hold the presets).
    expect(messages(broken((d) => (d.layers[0].preset = "pocket")), {})).toEqual([]);
  });

  it("refuses a shape that lies outside its piece, or on a piece the product does not have", () => {
    const shape = { id: "shape-1", kind: "shape", group: "hoops", pieceId: "front", path: "M 600 0 H 700 V 100 H 600 Z", fill: { id: "placeholder-red", hex: "#C8102E" }, locked: true };
    expect(messages(broken((d) => (d.shapes = [shape])))).toEqual([expect.stringMatching(/^shapes\[0\]\.path: lies outside piece "front" \(560 x 700 mm\): none of it would be drawn/)]);
    expect(messages(broken((d) => (d.shapes = [{ ...shape, pieceId: "pocket" }])))).toEqual([expect.stringMatching(/^shapes\[0\]\.pieceId: product "placeholder-jersey" has no pattern piece "pocket"/)]);
    // Reaching past the outline is fine: only the part inside is drawn.
    expect(messages(broken((d) => (d.shapes = [{ ...shape, path: "M -50 300 H 610 V 360 H -50 Z" }])))).toEqual([]);
    expect(messages(broken((d) => (d.shapes = [{ ...shape, path: "M 0 0 A 10 10 0 0 1 20 20 Z" }])))[0]).toMatch(/^shapes\[0\]\.path: .*not supported/);
  });

  it("refuses an off-palette colour, or a palette colour with another code, when given the palette", () => {
    const off = broken((d) => (d.zones.body = { id: "my-blue", hex: "#1A5FB4" }));
    expect(messages(off, { product, palette })).toEqual([expect.stringMatching(/^zones\.body: colour "my-blue" \(#1A5FB4\) is not in palette "placeholder-palette"; only palette colours can be printed/)]);
    const wrongCode = broken((d) => (d.layers[0].fill = { id: "placeholder-red", hex: "#FF0000" }));
    expect(messages(wrongCode, { product, palette })).toEqual([expect.stringMatching(/^layers\[0\]\.fill: colour "placeholder-red" is #C8102E in palette "placeholder-palette" but #FF0000 here/)]);
    const team = broken((d) => (d.teamColors.second = { id: "x", hex: "#123456" }));
    expect(messages(team, { product, palette })).toEqual([expect.stringMatching(/^teamColors\.second: colour "x"/)]);
    // The requested code may be anything: it is never printed.
    expect(messages(broken((d) => (d.zones.body = { id: "placeholder-royal", hex: "#1F4E9C", requested: "#1A5FB4" })), { product, palette })).toEqual([]);
  });

  it("refuses a team-colour reference with no such team colour, or one that does not hold the team colour", () => {
    const noAccent = broken((d) => {
      delete d.teamColors.accent;
      d.zones.body = { id: "placeholder-red", hex: "#C8102E", teamColor: "accent" };
    });
    expect(messages(noAccent)).toEqual([
      expect.stringMatching(/^zones\.body\.teamColor: follows team colour "accent", but the design has no accent team colour/),
    ]);
    expect(messages(broken((d) => (d.zones.body = { id: "placeholder-red", hex: "#C8102E", teamColor: "main" })))).toEqual([
      expect.stringMatching(/^zones\.body: follows team colour "main" \(placeholder-white #FFFFFF\) but holds placeholder-red #C8102E/),
    ]);
    expect(messages(broken((d) => (d.layers[0].fill = { id: "placeholder-white", hex: "#FFFFFF", teamColor: "main", requested: "#FEFEFE" })))).toEqual([
      expect.stringMatching(/^layers\[0\]\.fill\.requested: a colour that follows team colour "main" has no colour code of its own/),
    ]);
    expect(messages(broken((d) => (d.zones.body = { id: "placeholder-red", hex: "#C8102E", teamColor: "home" })))[0]).toMatch(/^zones\.body\.teamColor: must be one of "main", "second", "accent"/);
  });

  it("keeps the team name and the sample player in their layers: a role layer shows the design's value", () => {
    const named = broken((d) => {
      d.teamName = "TIGERS";
      d.layers[0].role = "team-name";
      d.layers[0].value = "LIONS";
    });
    expect(messages(named)).toEqual([expect.stringMatching(/^layers\[0\]\.value: a team-name layer shows teamName \("TIGERS"\), not "LIONS"/)]);
    const number = broken((d) => (d.layers[1].role = "player-number"));
    expect(messages(number)).toEqual([expect.stringMatching(/^layers\[1\]\.value: a player-number layer shows samplePlayer\.number \(""\), not "07"/)]);
    expect(messages(broken((d) => (d.samplePlayer.number = "100")))[0]).toMatch(/^samplePlayer\.number: "100" has more than 2 digits/);
    expect(messages(broken((d) => (d.samplePlayer.number = "1٢")))[0]).toMatch(/^samplePlayer\.number: "1٢" mixes two digit systems/);
  });

  it("lets the team name and player name be empty (a slot waiting for its text), never only spaces; free text needs a letter", () => {
    const empty = broken((d) => {
      d.layers[0].role = "team-name";
      d.layers[0].value = "";
    });
    expect(messages(empty)).toEqual([]);
    expect(messages(broken((d) => (d.teamName = "  ")))).toEqual(["teamName: must be empty or contain a visible character, not only spaces"]);
    expect(messages(broken((d) => (d.layers[0].value = "")))).toEqual(["layers[0].value: must contain a visible character, not only spaces"]);
  });

  it("refuses an outline wider than 20 mm or without a width", () => {
    const outline = (width: unknown) => broken((d) => (d.layers[0].outline = { color: { id: "placeholder-navy", hex: "#1B2A5C" }, width }));
    expect(messages(outline(3))).toEqual([]);
    expect(messages(outline(25))[0]).toMatch(/^layers\[0\]\.outline\.width: /);
    expect(messages(outline(0))[0]).toMatch(/^layers\[0\]\.outline\.width: /);
  });

  it("uses one id space for layers and shapes", () => {
    const shape = { id: "text-1", kind: "shape", group: "hoops", pieceId: "front", path: "M 0 300 H 560 V 360 H 0 Z", fill: { id: "placeholder-red", hex: "#C8102E" }, locked: true };
    expect(messages(broken((d) => (d.shapes = [shape])))).toEqual(['layers[0].id: duplicate layer id "text-1"']);
  });
});

describe("product definitions, version 2: views and placement presets", () => {
  const jersey = loadStandInJerseyProduct();

  it("the generated stand-in jersey has its presets, each on its piece", () => {
    expect(jersey.placements.map((p) => p.id)).toEqual([
      "chest-centre", "left-chest", "right-chest", "front-number", "upper-back", "back-name", "back-number", "lower-back", "sleeve-left", "sleeve-right",
    ]);
    expect(jersey.views).toEqual({ front: "front", back: "back" });
  });

  const bad = (mutate: (p: Record<string, any>) => void) => {
    const p = copy(product) as Record<string, any>;
    mutate(p);
    const r = validateProductDefinition(p);
    return r.ok ? [] : r.errors.map((e) => e.message);
  };

  it("refuses a preset off its piece, on an unknown piece, twice, or with a role twice; views must name pieces", () => {
    expect(bad((p) => (p.placements[0].centre = { x: 5, y: 5 }))).toEqual([expect.stringMatching(/^placements\[0\]\.centre: \(5, 5\) is outside the outline of piece "front"/)]);
    expect(bad((p) => (p.placements[0].pieceId = "pocket"))).toEqual([expect.stringMatching(/^placements\[0\]\.pieceId: "pocket" is not one of the product's pieces/)]);
    expect(bad((p) => (p.placements[1].id = p.placements[0].id))).toEqual(['placements[1].id: duplicate placement preset id "chest-centre"']);
    expect(bad((p) => p.placements[0].roles.push("crest"))).toEqual(["placements[0].roles: lists crest twice"]);
    expect(bad((p) => (p.views.back = "pocket"))).toEqual([expect.stringMatching(/^views\.back: "pocket" is not one of the product's pieces/)]);
    expect(bad((p) => (p.placements[0].roles = ["shirt"]))[0]).toMatch(/^placements\[0\]\.roles\[0\]: must be one of/);
    expect(bad((p) => (p.schemaVersion = 1))[0]).toMatch(/format version 1 is not supported/);
  });
});
