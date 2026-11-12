import { describe, expect, it } from "vitest";
import { createDesign } from "./create";
import { setZoneColor } from "./edit";
import { coloursByFamily, coloursCommonFirst, matchColourCode, matchLevel, nearestPaletteColour, validatePalette } from "./palette";
import { setTeamColor } from "./team-colours";
import { validateDesign } from "./validate";
import { loadPlaceholderPalette, loadPlaceholderProduct } from "../test/fixtures";

const palette = loadPlaceholderPalette();
const product = loadPlaceholderProduct();

describe("the placeholder palette", () => {
  it("is valid, about 30 colours in the seven families of the specification, and says it is not print-tested", () => {
    expect(palette.printTested).toBe(false);
    expect(palette.note).toMatch(/NOT print-tested/);
    expect(palette.colors.length).toBeGreaterThanOrEqual(28);
    expect(palette.families.map((f) => f.name)).toEqual(["Whites & greys", "Blacks & navies", "Blues", "Greens", "Yellows & oranges", "Reds & maroons", "Purples & pinks"]);
    for (const { colours } of coloursByFamily(palette)) expect(colours.length).toBeGreaterThanOrEqual(3);
  });

  it("keeps every colour the products and the version 2 samples use, with the same code", () => {
    const used = { "placeholder-white": "#FFFFFF", "placeholder-navy": "#1B2A5C", "placeholder-red": "#C8102E", "placeholder-gold": "#F2B705", "placeholder-green": "#0B6B3A" };
    for (const [id, hex] of Object.entries(used)) expect(palette.colors.find((c) => c.id === id)?.hex).toBe(hex);
  });

  it("lists the common colours first, then the rest in palette order, each once", () => {
    const ordered = coloursCommonFirst(palette);
    expect(ordered.slice(0, palette.common.length).map((c) => c.id)).toEqual(palette.common);
    expect(new Set(ordered.map((c) => c.id)).size).toBe(palette.colors.length);
  });

  it("refuses a palette with a duplicate code, an unknown family, an unknown common colour or an empty family", () => {
    const bad = (mutate: (p: any) => void) => {
      const p = JSON.parse(JSON.stringify(palette));
      mutate(p);
      const r = validatePalette(p);
      return r.ok ? [] : r.errors.map((e) => e.message);
    };
    expect(bad((p) => (p.colors[1].hex = p.colors[0].hex))).toEqual([expect.stringMatching(/^colors\[1\]\.hex: #FFFFFF is already colour "placeholder-white"/)]);
    expect(bad((p) => (p.colors[0].family = "neons"))).toEqual([expect.stringMatching(/^colors\[0\]\.family: "neons" is not one of the families/)]);
    expect(bad((p) => p.common.push("placeholder-neon"))).toEqual([expect.stringMatching(/"placeholder-neon" is not a colour of this palette/)]);
    expect(bad((p) => p.families.push({ id: "neons", name: "Neons" }))).toEqual([expect.stringMatching(/family "neons" has no colours/)]);
    expect(bad((p) => (p.colors[0].hex = "#fff"))[0]).toMatch(/^colors\[0\]\.hex: must be an upper-case hex colour/);
  });
});

describe("nearestPaletteColour and matchColourCode (CIEDE2000)", () => {
  // The differences below come from this package's CIEDE2000, which reproduces all 34 published
  // test pairs of Sharma, Wu and Dalal (2005) to 4 decimals (colour.test.ts), on CIELAB values that
  // match Bruce Lindbloom's sRGB/D65 calculator (colour.test.ts). The Lab values of each pair:
  //   #1A5FB4 (40.7316, 11.4430, -50.8934) vs Royal blue #1F4E9C (34.2713, 13.6157, -47.0240): ΔE00 6.3512
  //   #00A86B (60.8386, -51.4086, 21.4300) vs Kelly green #2E9E4E (57.6391, -48.8542, 32.7882): ΔE00 5.9672
  //   #800000 (25.5355, 48.0451, 38.0573) vs Cardinal #9D2235 (35.1458, 50.4693, 20.4686): ΔE00 12.3429
  //   #1B2A5D (18.7093, 12.7626, -32.4480) vs Navy #1B2A5C (18.6331, 12.3560, -31.9081): ΔE00 0.2135
  it.each([
    ["#1A5FB4", "placeholder-royal", 6.3512, "different"],
    ["#00A86B", "placeholder-kelly-green", 5.9672, "close"],
    ["#800000", "placeholder-cardinal", 12.3429, "different"],
    ["#1b2a5d", "placeholder-navy", 0.2135, "very-close"],
  ] as const)("%s is nearest to %s, ΔE00 %f (%s)", (code, id, deltaE, level) => {
    const nearest = nearestPaletteColour(palette, code);
    expect(nearest.colour.id).toBe(id);
    expect(nearest.deltaE).toBeCloseTo(deltaE, 3);
    expect(nearest.match).toBe(level);
  });

  it("is the smallest difference over the whole palette (checked by brute force against the second best)", () => {
    const m = nearestPaletteColour(palette, "#1A5FB4");
    // Azure is the runner-up for this code: 7.38.
    expect(nearestPaletteColour({ colors: palette.colors.filter((c) => c.id !== "placeholder-royal") }, "#1A5FB4")).toMatchObject({ colour: { id: "placeholder-azure" } });
    expect(m.deltaE).toBeLessThan(7.38);
  });

  it("gives 0 and 'very close' for a palette colour's own code, in any spelling", () => {
    expect(nearestPaletteColour(palette, "fff")).toMatchObject({ colour: { id: "placeholder-white" }, deltaE: 0, match: "very-close" });
  });

  it("uses the specification's thresholds: at most 2 very close, at most 6 close, above 6 clearly different", () => {
    expect([0, 2, 2.0001, 6, 6.0001].map((d) => matchLevel(d))).toEqual(["very-close", "very-close", "close", "close", "different"]);
    expect(matchLevel(3, { veryClose: 4, close: 8 })).toBe("very-close");
  });

  it("refuses an invalid code and matches nothing", () => {
    for (const input of ["#12345G", "#1234", "", "blue", null, 0x1a5fb4]) {
      expect(matchColourCode(palette, input)).toMatchObject({ ok: false, code: "invalid-code" });
    }
    expect(() => nearestPaletteColour(palette, "blue")).toThrow(RangeError);
  });

  it("returns the value to apply: the palette colour as the printed colour, the code asked for beside it", () => {
    const m = matchColourCode(palette, "#1a5fb4");
    if (!m.ok) throw new Error(m.error);
    expect(m.value).toEqual({ id: "placeholder-royal", hex: "#1F4E9C", requested: "#1A5FB4" });
    const design = setZoneColor(createDesign(product), "body", m.value, { product });
    expect(design.zones.body).toEqual({ id: "placeholder-royal", hex: "#1F4E9C", requested: "#1A5FB4" });
    expect(validateDesign(design, { product, palette }).ok).toBe(true);
    // A team colour keeps the requested code the same way.
    const team = setTeamColor(design, "main", m.value);
    expect(team.teamColors.main).toEqual({ id: "placeholder-royal", hex: "#1F4E9C", requested: "#1A5FB4" });
    // The JSON holds no off-palette colour anywhere: the code only appears as `requested`.
    const json = JSON.stringify(team);
    expect(json.match(/"hex":"#1A5FB4"/)).toBeNull();
  });
});
