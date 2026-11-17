/**
 * E3d (07-editor-review R16, R27, R29, R37, R38, landscape Done): sheets and bars on phones and in landscape.
 * Markup from react-dom/server (effects do not run) and the stylesheet's rules.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { createDesign } from "../design/create";
import { applyTemplate, type Template } from "../design/template";
import type { SelectionGeometry } from "../react/DesignCanvas";
import { EDITOR_WORDING as W } from "./content";
import { EditorContext, type EditorApi } from "./context";
import { DonePanel } from "./DonePanel";
import { createBus } from "./handles";
import { sheetUnderDone } from "./layout";
import { StageContextBar } from "./SelectedItem";
import { EDITOR_CSS } from "./styles";
import { ToolPanel } from "./ToolPanel";
import { loadPlaceholderFonts, loadPlaceholderPalette, loadStandInJerseyProduct } from "../test/fixtures";

const product = loadStandInJerseyProduct();
const palette = loadPlaceholderPalette();
const fonts = loadPlaceholderFonts();
const classic = JSON.parse(readFileSync(resolve(import.meta.dirname, "../../samples/templates/stand-in-jersey/classic.json"), "utf8")) as Template;
const design = applyTemplate(createDesign(product, { teamName: "LAHORE LIONS", samplePlayer: { name: "ALI", number: "10" } }), classic, { product, fonts });
const noop = () => undefined;
const api = (overrides: Partial<EditorApi> = {}): EditorApi => ({
  product, palette, fonts, templates: [], wording: W, assets: { upload: async () => ({ assetId: "a1" }), url: () => null }, layout: "compact", detent: "normal", setDetent: noop, design,
  commit: () => true, begin: noop, preview: noop, end: noop, hoverPreview: noop, textFits: [], fontsLoading: false, fontsFailed: false,
  garmentView: null, showSide: noop, focusOn: noop, announce: noop, colourTarget: { kind: "zone", id: "body_front" }, chooseColourTarget: noop,
  recentColours: [], useColour: noop, setTyping: noop, openTool: noop, reducedMotion: false, markTiming: noop, snapping: true, setSnapping: noop, selectedId: null, select: noop, logoNotes: {}, setLogoNote: noop,
  ...overrides,
});
const inEditor = (node: React.ReactNode, overrides: Partial<EditorApi> = {}) => renderToStaticMarkup(<EditorContext.Provider value={api(overrides)}>{node}</EditorContext.Provider>);

describe("R38, 4.10: one sheet at a time on a phone", () => {
  it("opening Done closes the open tool panel and keeps what comes back; nothing on a desktop or with no panel", () => {
    expect(sheetUnderDone({ layout: "compact", panelOpen: true, tool: "design", detent: "expanded" })).toEqual({ tool: "design", detent: "expanded" });
    expect(sheetUnderDone({ layout: "compact", panelOpen: false, tool: "design", detent: "normal" })).toBeNull();
    expect(sheetUnderDone({ layout: "wide", panelOpen: true, tool: "design", detent: "normal" })).toBeNull();
    expect(sheetUnderDone({ layout: "short", panelOpen: true, tool: "logos", detent: "normal" })).toBeNull();
  });
});

describe("R37, R29 and landscape: the Done panel", () => {
  it("on a phone it is as tall as its content (with a ceiling); on a desktop the kit is barely dimmed", () => {
    expect(EDITOR_CSS).toMatch(/\.fmo-done-panel\[data-layout="compact"\] \{[^}]*height: auto; max-height: min\(60dvh, calc\(100dvh - 56px - 160px\)\)/);
    expect(EDITOR_CSS).not.toMatch(/\.fmo-done-panel\[data-layout="compact"\] \{[^}]*min-height: 320px/);
    expect(EDITOR_CSS).toMatch(/\.fmo-done-panel:is\(\[data-layout="wide"\], \[data-layout="short"\]\)::backdrop \{ background: rgb\(11 21 48 \/ 0\.08\)/);
  });
  it("in landscape it covers the tool panel and the rail, scrolls as one, and keeps the main action in view", () => {
    expect(EDITOR_CSS).toContain('.fmo-done-panel[data-layout="short"] { inset: 48px 0 0 auto; width: 384px; }');
    expect(EDITOR_CSS).toMatch(/\.fmo-done-panel\[data-layout="short"\] \.fmo-done-inner \{ overflow-y: auto;/);
    expect(EDITOR_CSS).toMatch(/\.fmo-done-panel\[data-layout="short"\] \.fmo-done-inner > \.fmo-primary \{ position: sticky; bottom: 0;/);
  });
  it("the main action is the one that takes the focus when it opens (not the close button)", () => {
    const html = inEditor(<DonePanel open layout="compact" productName="Jersey" onSaveAndGoBack={noop} onClose={noop} onShow={noop} />);
    expect(html).toMatch(/<button[^>]*data-testid="done-save-and-go-back"[^>]*data-done-focus="true"/);
  });
});

describe("R27: the contextual bar on the stage", () => {
  it("ends 8 px before a side panel (landscape), so Done is never under it", () => {
    const layer = design.layers.find((l) => l.role === "player-number")!;
    const geometry = { layerId: layer.id, centre: { x: 200, y: 200 }, centreWorld: [0, 0, 0], corners: [{ x: 180, y: 180 }, { x: 220, y: 180 }, { x: 220, y: 220 }, { x: 180, y: 220 }], cornerSources: ["surface", "surface", "surface", "surface"], outline: [], top: { x: 200, y: 180 }, turn: { x: 200, y: 150 }, angle: 0, facing: true, mirrored: false, pxPerMm: 1, guides: [], width: 780, height: 342 } as SelectionGeometry;
    const html = inEditor(<StageContextBar bus={createBus<SelectionGeometry | null>(geometry)} top={24} bottomInset={60} endInset={320} />, { selectedId: layer.id });
    expect(html).toMatch(/data-testid="context-bar-place"/);
    expect(html).toMatch(/inset-inline-end:328px/);
  });
});

describe("R16: focus after a selection from a list", () => {
  it("the panel's title can take the focus (tabindex -1) and shows no ring", () => {
    const html = renderToStaticMarkup(
      <ToolPanel layout="compact" tool="players" wording={W} detent="normal" heights={{ normal: 232, expanded: 500 }} typing={false} onDetent={noop} onClose={noop} onSize={noop}>
        <p>body</p>
      </ToolPanel>,
    );
    expect(html).toMatch(/<h2 class="fmo-panel-title" id="fmo-panel-title" tabindex="-1">/);
    expect(EDITOR_CSS).toContain(".fmo-panel-title:focus { outline: none; }");
  });
});
