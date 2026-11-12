/**
 * The interface's components, rendered to markup in node (react-dom/server: no DOM, no new
 * dependency). Effects do not run here, so these check what the components show from their
 * props and the editor's context: words from the wording data, roles, states, test ids.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { createDesign } from "../design/create";
import { applyTemplate, type Template } from "../design/template";
import { EDITOR_WORDING } from "./content";
import { EditorContext, type EditorApi, type ToolId } from "./context";
import { ColoursTool } from "./ColoursTool";
import { DesignTool } from "./DesignTool";
import { EditorShell } from "./EditorShell";
import { PlayersTool, TeamTool } from "./LetteringTools";
import { LogosTool, TextTool } from "./LogosTool";
import { StartCard } from "./StartCard";
import { ToolTabs, TOOL_ORDER } from "./ToolPanel";
import { TopBar } from "./TopBar";
import { loadPlaceholderFonts, loadPlaceholderPalette, loadStandInJerseyProduct } from "../test/fixtures";

const product = loadStandInJerseyProduct();
const palette = loadPlaceholderPalette();
const fonts = loadPlaceholderFonts();
const W = EDITOR_WORDING;
const templates = ["classic", "hoops", "stripes", "sash", "chevron"].map(
  (id) => JSON.parse(readFileSync(resolve(import.meta.dirname, `../../samples/templates/stand-in-jersey/${id}.json`), "utf8")) as Template,
);
const design = applyTemplate(createDesign(product, { teamName: "LAHORE LIONS", samplePlayer: { name: "ALI", number: "10" } }), templates[0]!, { product, fonts });
const assets = { upload: async () => ({ assetId: "a1" }), url: () => null };

function api(overrides: Partial<EditorApi> = {}): EditorApi {
  const noop = () => undefined;
  return {
    product, palette, fonts, templates, wording: W, assets, layout: "compact", detent: "normal", setDetent: noop, design,
    commit: () => true, begin: noop, preview: noop, end: noop, hoverPreview: noop, textFits: [], fontsLoading: false, fontsFailed: false,
    garmentView: null, showSide: noop, focusOn: noop, announce: noop, colourTarget: { kind: "zone", id: "body_front" }, chooseColourTarget: noop,
    recentColours: [], useColour: noop, setTyping: noop, openTool: noop, reducedMotion: false, markTiming: noop, snapping: true, setSnapping: noop,
    ...overrides,
  };
}
const inTool = (node: React.ReactNode, overrides: Partial<EditorApi> = {}) => renderToStaticMarkup(<EditorContext.Provider value={api(overrides)}>{node}</EditorContext.Provider>);
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/\s+/g, " ");

describe("the shell", () => {
  it("renders the top bar, the six tools as tabs, the stage, and one red Done", () => {
    const html = renderToStaticMarkup(<EditorShell product={product} palette={palette} fonts={fonts} templates={templates} initialDesign={design} productName="Jersey" assets={assets} />);
    expect(html).toContain('role="application"');
    expect(html).toContain('role="tablist"');
    for (const tool of TOOL_ORDER) expect(html).toContain(`data-testid="tab-${tool}"`);
    expect(html.match(/class="fmo-done"/g)).toHaveLength(1);
    expect(text(html)).toContain("Done");
    expect(html).toContain('data-testid="stage"');
    expect(html).toContain(".fmo-editor"); // the stylesheet is in the page
    expect(html).not.toContain('data-testid="start-card"');
  });

  it("shows the start card on a new design, and no tabs then on a phone (they come back after)", () => {
    const html = renderToStaticMarkup(<EditorShell product={product} palette={palette} fonts={fonts} templates={templates} initialDesign={design} productName="Jersey" assets={assets} showStartCard />);
    expect(html).toContain('data-testid="start-card"');
    expect(text(html)).toContain("Let's make your team's kit");
    expect(html).not.toContain('data-testid="tab-design"');
  });

  it("without templates hides the Design tab; a host's stylesheet can replace the editor's", () => {
    const html = renderToStaticMarkup(<EditorShell product={product} palette={palette} fonts={fonts} templates={[]} initialDesign={design} productName="Jersey" assets={assets} injectStyles={false} wording={{ frame: { done: "Fertig" } }} />);
    expect(html).not.toContain('data-testid="tab-design"');
    expect(html).toContain('data-testid="tab-colours"');
    expect(html).not.toContain(".fmo-editor {");
    expect(text(html)).toContain("Fertig");
  });
});

describe("the top bar and the tabs", () => {
  it("compact: icons with names; wide: words; the save state as one word on a phone (never cut), the sentence on wide", () => {
    const props = { wording: W, productName: "Jersey", canUndo: true, canRedo: false, undoTitle: "u", redoTitle: "r", onUndo: () => undefined, onRedo: () => undefined, onSaveInfo: () => undefined, onClose: () => undefined, onDone: () => undefined };
    const compact = renderToStaticMarkup(<TopBar {...props} layout="compact" saveState="saved" saveWords="short" />);
    expect(compact).toContain('aria-label="Close the editor"');
    expect(compact).toContain('aria-disabled="true"'); // redo
    expect(compact).toContain('class="fmo-sr-only">Saved on this device');
    expect(compact).toContain('<span aria-hidden="true">Saved</span>');
    expect(renderToStaticMarkup(<TopBar {...props} layout="compact" saveState="saved" saveWords="none" />)).not.toContain('aria-hidden="true">Saved<');
    const wide = renderToStaticMarkup(<TopBar {...props} layout="wide" saveState="failed" saveWords="full" price={<span>from 20</span>} />);
    expect(text(wide)).toContain("Undo");
    expect(text(wide)).toContain("Not saved");
    expect(wide).toContain('data-testid="price-slot"');
  });

  it("the tabs are a tablist; the open one is selected; while loading they are inactive", () => {
    const html = renderToStaticMarkup(<ToolTabs layout="compact" tools={TOOL_ORDER} active={"players" as ToolId} wording={W} disabled onSelect={() => undefined} />);
    expect(html).toContain('aria-orientation="horizontal"');
    expect(html).toMatch(/data-testid="tab-players"/);
    expect(html.match(/aria-selected="true"/g)).toHaveLength(1);
    expect(html.match(/aria-disabled="true"/g)).toHaveLength(6);
    expect(text(html)).toContain("Players");
  });
});

describe("the tools", () => {
  it("Start card: two steps, the slots, See designs (not red), Skip", () => {
    const html = inTool(<StartCard onClose={() => undefined} />);
    for (const words of [W.start.colours, W.start.name, W.start.seeDesigns, W.start.skip]) expect(text(html)).toContain(words);
    expect(html).toContain(`placeholder="${W.start.namePlaceholder}"`);
    expect(html).toContain('dir="auto"');
    expect(html).not.toContain("fmo-done");
  });

  it("Design: one card per template, the current one pressed and named so", () => {
    const html = inTool(<DesignTool />);
    for (const t of templates) expect(html).toContain(`data-testid="template-${t.id}"`);
    expect(html).toContain(`aria-label="Classic, ${W.templates.current}"`);
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(1);
    expect(text(html)).toContain(W.templates.loading);
  });

  it("Colours: the line in words, the parts as chips, the team colours, the hint; expanded: families and the code field", () => {
    const html = inTool(<ColoursTool />);
    expect(text(html)).toContain("Body front: White");
    expect(html).toContain('data-testid="zone-body_front"');
    expect(html).toContain('data-testid="swatch-team-main"');
    expect(text(html)).toContain(W.colours.tapKit);
    const expanded = inTool(<ColoursTool />, { detent: "expanded" });
    expect(text(expanded)).toContain("Whites & greys");
    expect(expanded).toContain('data-testid="colour-code-input"');
    expect(text(expanded)).toContain(W.colours.printNote);
    // The shapes of a template are chips too.
    const hoops = applyTemplate(design, templates[1]!, { product, fonts, previous: templates[0] });
    expect(inTool(<ColoursTool />, { design: hoops })).toContain('data-testid="shapes-hoops"');
  });

  it("Team: the name field, where (with Off), style", () => {
    const html = inTool(<TeamTool />);
    expect(html).toContain('data-testid="team-name"');
    expect(html).toContain('data-testid="team-where-chest-centre"');
    expect(html).toContain('data-testid="team-where-off"');
    expect(text(html)).toContain(W.lettering.style);
  });

  it("Players: the sample player, the switches with the right ones on, the long-name note while shrunk", () => {
    const html = inTool(<PlayersTool />, { textFits: [{ layerId: "x", role: "player-name", scale: 0.6, shrunk: true }] });
    expect(text(html)).toContain(W.lettering.fromTeamList);
    expect(html).toMatch(/data-testid="slot-back-name"[^>]*checked=""|checked=""[^>]*data-testid="slot-back-name"/);
    expect(html).toContain('inputMode="numeric"');
    expect(text(html)).toContain(W.lettering.shrunk);
    expect(text(inTool(<PlayersTool />))).not.toContain(W.lettering.shrunk);
  });

  it("Logos and Text: the simple panels in the coach's words", () => {
    const logos = inTool(<LogosTool />);
    expect(text(logos)).toContain(W.logos.add);
    expect(logos).toContain('accept="image/png,image/jpeg,image/webp"');
    const textTool = inTool(<TextTool />);
    expect(text(textTool)).toContain(W.lettering.sameOnEvery);
  });

  it("no engine key or developer word reaches the screen", () => {
    const all = [<StartCard key="s" onClose={() => undefined} />, <DesignTool key="d" />, <ColoursTool key="c" />, <TeamTool key="t" />, <PlayersTool key="p" />, <LogosTool key="l" />, <TextTool key="x" />].map((n) => text(inTool(n))).join(" ");
    expect(all).not.toMatch(/body_front|placeholder-|zone-colour|team-colour|undefined|NaN|\bmm\b|\blayers?\b/i);
  });
});
