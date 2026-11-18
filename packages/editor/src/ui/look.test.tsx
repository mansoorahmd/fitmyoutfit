/**
 * E3e (QA 17, the look): the header of a selected text item on the desktop names the kind only (its field is right
 * under it); the selected swatch and the line between two groups of swatches never change a gap.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { createDesign } from "../design/create";
import { applyTemplate, type Template } from "../design/template";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { EDITOR_WORDING as W } from "./content";
import { EditorContext, type EditorApi } from "./context";
import { itemWords, panelHeaderName } from "./items";
import { ContextBar } from "./SelectedItem";
import { EDITOR_CSS } from "./styles";
import { loadPlaceholderFonts, loadPlaceholderPalette, loadStandInJerseyProduct } from "../test/fixtures";

const product = loadStandInJerseyProduct();
const palette = loadPlaceholderPalette();
const fonts = loadPlaceholderFonts();
const classic = JSON.parse(readFileSync(resolve(import.meta.dirname, "../../samples/templates/stand-in-jersey/classic.json"), "utf8")) as Template;
const design = applyTemplate(createDesign(product, { teamName: "LAHORE LIONS", samplePlayer: { name: "ALI", number: "10" } }), classic, { product, fonts });
const noop = () => undefined;
const api = (selectedId: string): EditorApi => ({
  product, palette, fonts, templates: [], wording: W, assets: { upload: async () => ({ assetId: "a1" }), url: () => null }, layout: "wide", detent: "normal", setDetent: noop, design,
  commit: () => true, begin: noop, preview: noop, end: noop, hoverPreview: noop, textFits: [], fontsLoading: false, fontsFailed: false,
  garmentView: null, showSide: noop, focusOn: noop, announce: noop, colourTarget: { kind: "zone", id: "body_front" }, chooseColourTarget: noop,
  recentColours: [], useColour: noop, setTyping: noop, openTool: noop, nudge: noop, reducedMotion: false, markTiming: noop, snapping: true, setSnapping: noop, selectedId, select: noop, logoNotes: {}, setLogoNote: noop,
});
const bar = (id: string, variant: "panel" | "stage") =>
  renderToStaticMarkup(
    <EditorContext.Provider value={api(id)}>
      <ContextBar variant={variant} />
    </EditorContext.Provider>,
  );

describe("the selected item's header", () => {
  const team = design.layers.find((l) => l.role === "team-name")!;
  it("on the desktop panel a team name is headed 'Team name', not 'Team name: LAHORE LIONS' (the field below shows the words)", () => {
    const html = bar(team.id, "panel");
    expect(html).toMatch(/class="fmo-context-name fmo-bdi"[^>]*>Team name</);
    expect(html).not.toContain("LAHORE LIONS</span>");
    expect(html).not.toMatch(/fmo-context-name[^>]*>Team name:/);
  });
  it("on the phone's bar over the stage the words stay (the field is out of sight)", () => {
    expect(bar(team.id, "stage")).toMatch(/fmo-context-name[^>]*>Team name: LAHORE LIONS</);
  });
  it("the helper: text items without a field below (stage) and logos keep their full name", () => {
    const words = itemWords(W, product, team);
    expect(panelHeaderName(words, team, "panel")).toBe("Team name");
    expect(panelHeaderName(words, team, "stage")).toBe("Team name: LAHORE LIONS");
    const logo = { kind: "logo", role: "crest" } as const;
    expect(panelHeaderName({ kind: "Logo", name: "Logo: crest.png" }, logo, "panel")).toBe("Logo: crest.png");
  });
});

describe("swatches", () => {
  it("the selected swatch is marked inside its box: no ring outside it", () => {
    const rule = EDITOR_CSS.match(/\.fmo-swatch\[aria-pressed="true"\]\s*\{([^}]*)\}/)![1]!;
    expect(rule).toContain("inset 0 0 0 2px");
    for (const part of rule.replace(/box-shadow:/, "").split(",")) expect(part.trim().startsWith("inset"), part).toBe(true);
    expect(rule).not.toMatch(/(width|height|margin|padding|border)\s*:/);
  });
  it("the line between two groups takes no room: 8 px gap on both sides, as everywhere in the row", () => {
    const rule = EDITOR_CSS.match(/\.fmo-divider\s*\{([^}]*)\}/)![1]!;
    expect(rule).toMatch(/width:\s*1px/);
    expect(rule).toMatch(/margin:\s*4px -4\.5px/);
    // 8 (gap) + 1 (line) - 4.5 - 4.5 (margins) + 8 (gap) = 8
    expect(8 + 1 - 4.5 - 4.5 + 8).toBe(8);
  });
});
