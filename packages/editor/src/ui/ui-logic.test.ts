import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { EDITOR_WORDING, changeWords, fill, mergeWording, presetWords, shapeGroupWords } from "./content";
import { PANEL_NORMAL_MAX, chooseLayout, panelHeights, saveStateWords, stageHeight, stageInsets } from "./layout";
import { convertDigits, digitChoiceOf, numberErrorText, numberFieldError, playerSwitches } from "./lettering";
import { colourCodeState, normaliseCodeInput } from "./colour-code";
import { bodyColour, describeStage, nextStageTone } from "./stage-logic";
import { formatMegabytes, uploadRefusal, uploadRefusalText, uploadWarningTexts } from "./upload-wording";
import { EDIT_LABELS } from "../state/history";
import { teamColoursFromPicks } from "./StartCard";
import { nextPreset } from "./logos";
import { createDesign } from "../design/create";
import { setZoneColor } from "../design/edit";
import { applyTemplate, type Template } from "../design/template";
import { loadPlaceholderFonts, loadPlaceholderPalette, loadPlaceholderProduct, loadStandInJerseyProduct, loadStandInProduct } from "../test/fixtures";

const jersey = loadStandInJerseyProduct();
const palette = loadPlaceholderPalette();
const W = EDITOR_WORDING;

describe("wording (section 14)", () => {
  it("has every group of the specification, and words for every undo label (never the key)", () => {
    expect(Object.keys(W)).toEqual(expect.arrayContaining(["frame", "tools", "start", "templates", "colours", "lettering", "logos", "selection", "view", "states", "done"]));
    for (const label of EDIT_LABELS) {
      const words = changeWords(W, label);
      expect(words).not.toBe(label);
      expect(words.length).toBeGreaterThan(0);
    }
    expect(changeWords(W, null)).toBe("Change");
    expect(changeWords(W, "something-new")).toBe("Change");
  });

  it("keeps the specification's sentences word for word", () => {
    expect(W.start.title).toBe("Let's make your team's kit");
    expect(W.colours.invalidCode).toBe("That isn't a colour code. Use 6 characters from 0–9 and A–F, like #1F4E9C.");
    expect(W.lettering.numberTooLong).toBe("Use 1 or 2 digits, from 0 to 99.");
    expect(W.states.continueTitle).toBe("Continue your last design?");
    expect(W.frame.saved).toBe("Saved on this device");
  });

  it("no sentence is empty, and every {mark} is one fill knows how to fill", () => {
    const walk = (value: unknown, path: string): void => {
      if (typeof value === "string") {
        expect(value.trim().length, path).toBeGreaterThan(0);
        for (const m of value.matchAll(/\{(\w+)\}/g)) expect(["zone", "colour", "code", "role", "file", "size", "percent", "change", "font", "product", "side", "summary", "zones", "item", "where", "value", "name", "number", "width", "height", "degrees", "count", "cm", "reason", "team"], path).toContain(m[1]);
      } else if (value && typeof value === "object") for (const [k, v] of Object.entries(value)) walk(v, `${path}.${k}`);
    };
    walk(W, "wording");
  });

  it("is the only place sentences live: no component holds a sentence of its own", () => {
    // A rough check: every .tsx in src/ui has no JSX text of three words or more outside the wording.
    const dir = resolve(import.meta.dirname);
    // Every component of the interface (E3b: read from the folder, so a new one is checked too).
    const files = readdirSync(dir).filter((name) => name.endsWith(".tsx") && !name.endsWith(".test.tsx"));
    expect(files.length).toBeGreaterThanOrEqual(13);
    for (const file of files) {
      let source: string;
      try {
        source = readFileSync(resolve(dir, file), "utf8");
      } catch {
        continue;
      }
      // JSX text: between a tag's ">" and the next "<", on one line, with no code characters in it.
      const jsxText = [...source.matchAll(/>[ \t]*([A-Za-z][^<>{}();=\n]*[A-Za-z.!?])[ \t]*</g)].map((m) => m[1]!.trim()).filter((t) => t.split(/\s+/).length >= 3);
      expect(jsxText, file).toEqual([]);
      // And no string literal in JSX props that reads like a sentence (aria-label="Close the editor").
      const literals = [...source.matchAll(/(?:aria-label|title|placeholder|alt)="([^"]+)"/g)].map((m) => m[1]!).filter((t) => t.split(/\s+/).length >= 2);
      expect(literals, file).toEqual([]);
    }
  });

  it("fills marks, merges a host's overrides group by group, names presets and shape groups", () => {
    expect(fill("{zone}: {colour}", { zone: "Body", colour: "Navy" })).toBe("Body: Navy");
    expect(fill("{zone} {missing}", { zone: "A" })).toBe("A {missing}");
    const merged = mergeWording({ frame: { done: "Fertig" } });
    expect(merged.frame.done).toBe("Fertig");
    expect(merged.frame.undo).toBe("Undo");
    expect(mergeWording(null)).toBe(EDITOR_WORDING);
    const chest = jersey.placements.find((p) => p.id === "chest-centre")!;
    expect(presetWords(W, chest)).toEqual({ short: "Chest", long: "Chest", place: "chest" });
    expect(presetWords(W, jersey.placements.find((p) => p.id === "left-chest")!).long).toBe("Left chest (wearer's left)");
    expect(presetWords(W, { id: "pocket", name: "Pocket" }).short).toBe("Pocket");
    expect(shapeGroupWords(W, "hoops")).toBe("Hoops");
    expect(shapeGroupWords(W, "zigzag")).toBe("Pattern");
  });
});

describe("layouts (3.1)", () => {
  it("compact for phones in portrait and tablets, short for phones in landscape, wide from 1024", () => {
    expect(chooseLayout(360, 640)).toBe("compact");
    expect(chooseLayout(390, 844)).toBe("compact");
    expect(chooseLayout(768, 1024)).toBe("compact");
    expect(chooseLayout(844, 390)).toBe("short");
    expect(chooseLayout(1024, 768)).toBe("wide");
    expect(chooseLayout(1366, 900)).toBe("wide");
    expect(chooseLayout(1366, 480)).toBe("short");
    expect(chooseLayout(400, 450)).toBe("compact"); // small and square-ish: not landscape
  });

  it("a normal panel is at most 232 px and keeps the stage at least 45% of 640 (MO4); expanded leaves 160 px", () => {
    const h = panelHeights(640);
    expect(h.normal).toBe(PANEL_NORMAL_MAX);
    expect(stageHeight(640, h.normal, "compact")).toBeGreaterThanOrEqual(288);
    expect(stageHeight(640, h.expanded, "compact")).toBeGreaterThanOrEqual(160);
    expect(h.expanded).toBe(Math.min(Math.round(640 * 0.6), 640 - 56 - 64 - 160));
    expect(panelHeights(844).expanded).toBeGreaterThan(h.expanded);
  });

  it("insets for the camera: the bottom on compact, the right on short, nothing on wide or closed", () => {
    expect(stageInsets("compact", { open: true, height: 172 })).toEqual({ top: 0, right: 0, bottom: 172, left: 0 });
    expect(stageInsets("short", { open: true, height: 0 })).toEqual({ top: 0, right: 320, bottom: 0, left: 0 });
    expect(stageInsets("wide", { open: true, height: 500 })).toEqual({ top: 0, right: 0, bottom: 0, left: 0 });
    expect(stageInsets("compact", { open: false, height: 172 }).bottom).toBe(0);
    // E3b: nothing in the top bar is cut at 360 px: one word on a phone, the sentence where it fits.
    expect(saveStateWords("compact", 360)).toBe("short");
    expect(saveStateWords("compact", 390)).toBe("short");
    expect(saveStateWords("compact", 320)).toBe("none");
    expect(saveStateWords("compact", 768)).toBe("full");
    expect(saveStateWords("short", 844)).toBe("full");
    expect(saveStateWords("wide", 1366)).toBe("full");
  });
});

describe("the sample number field (4.5)", () => {
  it("gives coach-grade errors: 100, 1٢, empty, letters", () => {
    expect(numberFieldError("10")).toBeNull();
    expect(numberFieldError("٧")).toBeNull();
    expect(numberFieldError("07")).toBeNull();
    expect(numberFieldError("100")).toBe("too-long");
    expect(numberFieldError("1٢")).toBe("mixed");
    expect(numberFieldError("")).toBe("empty");
    expect(numberFieldError("A")).toBe("invalid");
    expect(numberErrorText(W, "too-long")).toBe("Use 1 or 2 digits, from 0 to 99.");
    expect(numberErrorText(W, "mixed")).toBe("Use one kind of digits, not both.");
    expect(numberErrorText(W, "empty")).toBe("Enter a number to preview.");
    expect(numberErrorText(W, "invalid")).toBe(W.lettering.numberTooLong);
  });

  it("switches digits keeping the value and leading zeros; reads which digits a number uses", () => {
    expect(convertDigits("07", "arabic-indic")).toBe("٠٧");
    expect(convertDigits("٠٧", "western")).toBe("07");
    expect(convertDigits("۷", "western")).toBe("7");
    expect(digitChoiceOf("10")).toBe("western");
    expect(digitChoiceOf("۷")).toBe("arabic-indic");
    expect(digitChoiceOf("")).toBeNull();
  });

  it("offers the switches the product has: the jersey's sleeve, none for a product without it", () => {
    expect(playerSwitches(jersey, W).map((s) => [s.role, s.preset.id, s.label])).toEqual([
      ["player-name", "back-name", "Name on back"],
      ["player-number", "back-number", "Number on back"],
      ["player-number", "front-number", "Number on front"],
      ["player-number", "sleeve-left", "Number on sleeve"],
    ]);
    expect(playerSwitches({ ...jersey, placements: [] }, W)).toEqual([]);
  });
});

describe("the colour-code field (4.3)", () => {
  it("#1A5FB4 matches Royal blue with both codes; nothing off the palette is applied", () => {
    const s = colourCodeState(palette, "#1A5FB4");
    expect(s.kind).toBe("match");
    if (s.kind !== "match") return;
    expect(s.requested).toBe("#1A5FB4");
    expect(s.colour.name).toBe("Royal blue");
    expect(s.value).toEqual({ id: "placeholder-royal", hex: "#1F4E9C", requested: "#1A5FB4" });
    expect(palette.colors.some((c) => c.hex === s.value.hex)).toBe(true);
  });

  it("no error while typing; an error for letters that are not hex, too many digits, or a cut-short code once finished", () => {
    expect(colourCodeState(palette, "").kind).toBe("empty");
    expect(colourCodeState(palette, "#1A").kind).toBe("typing");
    expect(colourCodeState(palette, "#1A5F").kind).toBe("typing");
    expect(colourCodeState(palette, "#1A5F", true).kind).toBe("invalid");
    expect(colourCodeState(palette, "#GG0000").kind).toBe("invalid");
    expect(colourCodeState(palette, "#1A5FB40").kind).toBe("invalid");
    expect(colourCodeState(palette, "fff").kind).toBe("match");
    expect(normaliseCodeInput(" 1a5fb4 ")).toBe("#1A5FB4");
    expect(normaliseCodeInput("##abc")).toBe("#ABC");
    expect(normaliseCodeInput("#1234567")).toBe("#123456");
  });
});

describe("the stage (12.2, 11.2)", () => {
  it("deepens for a white kit and comes back below 0.5, with no flicker in between", () => {
    expect(nextStageTone("normal", "#FFFFFF")).toBe("deep");
    expect(nextStageTone("deep", "#1B2A5C")).toBe("normal");
    // Luminance between 0.5 and 0.6 keeps the tone it had.
    expect(nextStageTone("deep", "#C8C8C8")).toBe("deep");
    expect(nextStageTone("normal", "#C8C8C8")).toBe("normal");
    expect(nextStageTone("deep", null)).toBe("deep");
    expect(bodyColour(jersey, createDesign(jersey))!.hex).toBe("#FFFFFF");
  });

  it("describes the kit in words: side, zones, team name, logo, name and number", () => {
    const fonts = loadPlaceholderFonts();
    const classic = JSON.parse(readFileSync(resolve(import.meta.dirname, "../../samples/templates/stand-in-jersey/classic.json"), "utf8")) as Template;
    let d = createDesign(jersey, { teamName: "TIGERS", samplePlayer: { name: "ALI RAZA", number: "10" }, teamColors: { main: { id: "placeholder-navy", hex: "#1B2A5C" }, second: { id: "placeholder-white", hex: "#FFFFFF" } } });
    d = applyTemplate(d, classic, { product: jersey, fonts });
    const text = describeStage(W, jersey, d, { productName: "Jersey", side: "back", palette });
    expect(text).toMatch(/^Jersey, back view\. Body front, body back and sleeves navy; side panels/);
    expect(text).toContain("Team name TIGERS on the chest.");
    expect(text).toContain("Name ALI RAZA and number 10 on the back.");
    expect(describeStage(W, jersey, setZoneColor(d, "sleeves", { id: "placeholder-red", hex: "#C8102E" }), { productName: "Jersey", side: null, palette })).toMatch(/turned view\. Body front and body back navy; sleeves red;/);
  });
});

describe("upload findings in the coach's words (10.4)", () => {
  const svg = new TextEncoder().encode('<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"></svg>');
  const pdf = new TextEncoder().encode("%PDF-1.7 ...");
  const png = (w: number, h: number) => {
    // Signature, IHDR (13 bytes and a CRC), then an empty IDAT chunk: enough for the header reader.
    const b = new Uint8Array(45);
    b.set([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82]);
    b.set([0, 0, 0, 0, 73, 68, 65, 84], 33);
    new DataView(b.buffer).setUint32(16, w);
    new DataView(b.buffer).setUint32(20, h);
    b[24] = 8;
    b[25] = 6;
    return b;
  };
  const err = (code: "file-type" | "file-size" | "dimensions" | "animated" | "damaged") => [{ code, severity: "error" as const, message: "ENGINE TEXT" }];

  it("tells an SVG from a renamed PDF, and small from large", () => {
    expect(uploadRefusal(err("file-type"), { head: svg, size: svg.length })).toBe("svg");
    expect(uploadRefusal(err("file-type"), { head: pdf, size: pdf.length })).toBe("wrong-type");
    expect(uploadRefusal(err("dimensions"), { head: png(10, 10), size: 33 })).toBe("too-small");
    expect(uploadRefusal(err("dimensions"), { head: png(9000, 100), size: 33 })).toBe("too-large");
    expect(uploadRefusal(err("file-size"), { size: 12 * 1024 * 1024 })).toBe("too-big");
    expect(uploadRefusal(err("animated"), { size: 1 })).toBe("animated");
    expect(uploadRefusal(err("damaged"), { size: 1 })).toBe("damaged");
    expect(uploadRefusal([], { size: 1, networkFailed: true })).toBe("network");
    expect(uploadRefusal([{ code: "transparency", severity: "warning", message: "x" }], { size: 1 })).toBeNull();
  });

  it("words each one for the coach, with the file's name, never the engine's message", () => {
    expect(uploadRefusalText(W, "wrong-type", "logo.png", 10)).toBe("logo.png isn't a picture we can print. Use a PNG, JPG or WebP file.");
    expect(uploadRefusalText(W, "svg", "crest.svg", 10)).toBe(W.logos.svg);
    expect(uploadRefusalText(W, "too-big", "big.png", 12 * 1024 * 1024)).toBe("big.png is 12.0 MB. The largest we take is 10 MB.");
    for (const kind of ["damaged", "too-small", "too-large", "animated", "network"] as const) expect(uploadRefusalText(W, kind, "a.png", 1)).not.toContain("ENGINE");
    expect(uploadWarningTexts(W, [{ code: "transparency", severity: "warning", message: "ENGINE" }])).toEqual([W.logos.noTransparency]);
    expect(formatMegabytes(1024 * 1024 * 2.5)).toBe("2.5 MB");
  });
});

describe("the start card's picks and where new items go", () => {
  const red = palette.colors.find((c) => c.id === "placeholder-red")!;
  const gold = palette.colors.find((c) => c.id === "placeholder-gold")!;
  const navy = palette.colors.find((c) => c.id === "placeholder-navy")!;

  it("fills Main, then Second, then Accent; fewer picks leave the rest as they were and remove the accent", () => {
    const d = createDesign(jersey);
    expect(teamColoursFromPicks(d, [red]).teamColors).toEqual({ main: { id: red.id, hex: red.hex }, second: d.teamColors.second });
    const three = teamColoursFromPicks(d, [red, gold, navy]);
    expect([three.teamColors.main.id, three.teamColors.second.id, three.teamColors.accent?.id]).toEqual([red.id, gold.id, navy.id]);
    expect(teamColoursFromPicks(three, [red, gold]).teamColors.accent).toBeUndefined();
  });

  it("puts the first logo on the left chest, the next where nothing is yet, in the usual order", () => {
    const presets = jersey.placements.filter((p) => p.roles.includes("crest"));
    expect(nextPreset(jersey, "logo", { layers: [] }, presets)!.id).toBe("left-chest");
    const withCrest = { layers: [{ preset: "left-chest" }, { preset: "chest-centre" }] } as never;
    // 4.6: a third logo goes on the upper back.
    expect(nextPreset(jersey, "logo", withCrest, presets)!.id).toBe("upper-back");
    expect(nextPreset(jersey, "text", { layers: [] }, jersey.placements.filter((p) => p.roles.includes("text")))!.id).toBe("lower-back");
    expect(nextPreset(jersey, "logo", { layers: [] }, [])).toBeNull();
  });
});

describe("other products", () => {
  it("the T-shirt and the placeholder get layouts and words too", () => {
    expect(playerSwitches(loadStandInProduct(), W).length).toBeGreaterThan(0);
    expect(bodyColour(loadPlaceholderProduct(), createDesign(loadPlaceholderProduct()))).not.toBeNull();
  });
});
