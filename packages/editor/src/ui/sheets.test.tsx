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
import { SelectedWarnings, StageContextBar } from "./SelectedItem";
import { TeamTool } from "./LetteringTools";
import { LogosTool } from "./LogosTool";
import { ColoursTool } from "./ColoursTool";
import { ResumePrompt } from "./dialogs";
import { commonColoursAfterTeam } from "./lettering";
import { addLayer } from "../design/edit";
import { newLogoLayer } from "../design/new-layers";
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
  recentColours: [], useColour: noop, setTyping: noop, openTool: noop, nudge: noop, reducedMotion: false, markTiming: noop, snapping: true, setSnapping: noop, selectedId: null, select: noop, logoNotes: {}, setLogoNote: noop,
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

describe("R15, D2: a selected item's warning leads its panel", () => {
  const navy = { id: "placeholder-navy", hex: "#1B2A5C" };
  let d = design;
  for (const zone of Object.keys(d.zones)) d = { ...d, zones: { ...d.zones, [zone]: navy } };
  d = { ...d, layers: d.layers.map((l) => (l.role === "team-name" ? { ...l, fill: navy } : l)) };
  const team = d.layers.find((l) => l.role === "team-name")!;
  it("the warning and its fix head the selected item's section; the tool does not repeat it", () => {
    const top = inEditor(<SelectedWarnings />, { design: d, selectedId: team.id, layout: "wide" });
    expect(top).toContain('data-testid="selected-warnings"');
    expect(top).toContain(`data-testid="readability-${team.id}"`);
    expect(top).toContain(`data-testid="readability-fix-${team.id}"`);
    expect(top).toContain("hard to read on Navy");
    const tool = inEditor(<TeamTool />, { design: d, selectedId: team.id, layout: "wide" });
    expect(tool).not.toContain(`data-testid="readability-${team.id}"`);
  });
  it("not selected: no warning at the top; the tool shows it as before", () => {
    expect(inEditor(<SelectedWarnings />, { design: d, selectedId: null })).toBe("");
    expect(inEditor(<TeamTool />, { design: d, selectedId: null })).toContain(`data-testid="readability-${team.id}"`);
  });
});

describe("R14: many logos stay short", () => {
  const asset = (id: string) => ({ assetId: id, mediaType: "image/png" as const, width: 1200, height: 1200 });
  let d = design;
  for (const [k, preset] of ["left-chest", "right-chest", "upper-back"].entries()) d = addLayer(d, newLogoLayer(product, { id: `logo-${k + 1}`, preset, role: k === 0 ? "crest" : "sponsor", asset: asset(`a${k + 1}`) }), { product });
  it("Add a logo comes first; a logo not selected is one row (no Replace, Where or Size)", () => {
    const html = inEditor(<LogosTool />, { design: d, selectedId: null });
    expect(html.indexOf('data-testid="logo-add"')).toBeLessThan(html.indexOf('data-testid="logo-logo-1"'));
    expect(html.match(/class="fmo-item fmo-item-row"/g)).toHaveLength(3);
    expect(html).not.toContain('data-testid="replace-logo-1"');
  });
  it("only the selected logo's card is open", () => {
    const html = inEditor(<LogosTool />, { design: d, selectedId: "logo-2" });
    expect(html.match(/class="fmo-item fmo-item-row"/g)).toHaveLength(2);
    expect(html).toContain('data-testid="replace-logo-2"');
    expect(html).not.toContain('data-testid="replace-logo-1"');
  });
});

describe("R18, R21: colour rows", () => {
  it("the common colours after the team colours leave the team colours out", () => {
    const common = [{ id: "white" }, { id: "navy" }, { id: "red" }, { id: "gold" }];
    expect(commonColoursAfterTeam(common, { main: { id: "red" }, second: { id: "navy" }, accent: null }, 8).map((c) => c.id)).toEqual(["white", "gold"]);
    expect(commonColoursAfterTeam(common, {}, 2).map((c) => c.id)).toEqual(["white", "navy"]);
  });
  it("Swap is a chip with its word (its name says what it swaps)", () => {
    const html = inEditor(<ColoursTool />, { layout: "wide" });
    expect(html).toMatch(/<button type="button" class="fmo-chip"[^>]*data-testid="swap-team"[^>]*aria-label="Swap main and second"[^>]*>.*?Swap<\/button>/);
  });
});

describe("R40, 4.11: Continue your last design?", () => {
  it("Continue last, filled ink, with the focus; one sentence says what was kept", () => {
    const html = renderToStaticMarkup(<ResumePrompt open onContinue={noop} onStartAgain={noop} />);
    expect(html.indexOf("resume-start-again")).toBeLessThan(html.indexOf("resume-continue"));
    expect(html).toMatch(/class="fmo-btn fmo-btn-ink"[^>]*data-testid="resume-continue" data-dialog-focus="true"/);
    expect(html).toContain(W.states.continueBody);
  });
});
