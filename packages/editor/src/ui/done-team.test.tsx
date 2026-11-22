/**
 * The Done panel's team section (08-team-list.md 11.2), before M3 and with the host's `listRequiredToContinue`: the
 * summary of the list, the lines to fix with a way to the first, the region's minimum note, and honest wording that
 * ordering comes later (no date, no price).
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { createDesign } from "../design/create.js";
import { EDITOR_WORDING } from "./content.js";
import { EditorContext, type EditorApi } from "./context.js";
import { DonePanel, type DonePanelProps } from "./DonePanel.js";
import { TeamListContext, type TeamListApi } from "./team-list-context.js";
import { fakeTeamApi } from "./team-list-test-api.js";
import { doneTeamSection } from "./team-list-words.js";
import { analyseList } from "../team-list/checks.js";
import { newLine } from "../team-list/lines.js";
import { DEFAULT_TEAM_SIZES, type EditorLine } from "../team-list/types.js";
import { loadPlaceholderFonts, loadPlaceholderPalette, loadStandInJerseyProduct } from "../test/fixtures.js";

const product = loadStandInJerseyProduct();
const W = EDITOR_WORDING;
const design = createDesign(product, { teamName: "LAHORE LIONS", samplePlayer: { name: "PLAYER", number: "10" } });
const line = (id: string, name: string, number: string, size: string, extra: Partial<EditorLine> = {}): EditorLine => ({ ...newLine(id), name, number, size, ...extra });

function api(): EditorApi {
  const noop = () => undefined;
  return {
    product, palette: loadPlaceholderPalette(), fonts: loadPlaceholderFonts(), templates: [], wording: W, assets: { upload: async () => ({ assetId: "a1" }), url: () => null }, layout: "compact", detent: "expanded", setDetent: noop, design,
    commit: () => true, begin: noop, preview: noop, end: noop, hoverPreview: noop, textFits: [], fontsLoading: false, fontsFailed: false, garmentView: null,
    showSide: noop, focusOn: noop, announce: noop, colourTarget: { kind: "zone", id: "body_front" }, chooseColourTarget: noop, recentColours: [], useColour: noop,
    setTyping: noop, openTool: noop, nudge: noop, reducedMotion: false, markTiming: noop, snapping: true, setSnapping: noop, selectedId: null, select: noop, logoNotes: {}, setLogoNote: noop,
  };
}
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/\s+/g, " ");
const base: DonePanelProps = { open: true, layout: "compact", productName: "Jersey", onSaveAndGoBack: () => undefined, onClose: () => undefined, onShow: () => undefined, onShowList: () => undefined };
function done(lines: EditorLine[], over: Partial<DonePanelProps> = {}, teamOver: Partial<TeamListApi> = {}, settings: { minimum?: number } = {}) {
  const t = fakeTeamApi(lines, { analysis: analyseList(lines, { prints: { name: true, number: true }, sizes: DEFAULT_TEAM_SIZES, minimum: settings.minimum ?? null }), ...teamOver });
  return renderToStaticMarkup(
    <EditorContext.Provider value={api()}>
      <TeamListContext.Provider value={t}>
        <DonePanel {...base} {...over} />
      </TeamListContext.Provider>
    </EditorContext.Provider>,
  );
}
const eighteen = Array.from({ length: 18 }, (_, i) => line(`p${i}`, `Player ${String.fromCharCode(65 + i)}`, String(i + 1), "M"));

describe("the team section", () => {
  it("with no players says so and offers Add players", () => {
    const html = done([]);
    expect(html).toContain('data-testid="done-team"');
    expect(text(html)).toContain("Team list");
    expect(text(html)).toContain("No players yet");
    expect(html).toContain('data-testid="done-team-add"');
    expect(text(html)).toContain("Add players");
  });
  it("sums up the list: players, pieces when they differ, and the lines to fix, with Show to the first", () => {
    const lines = [...eighteen.slice(0, 16), line("x", "Bilal", "3", "L", { count: 2 }), line("y", "Usman", "", "")];
    const html = done(lines);
    // 18 players; 17 + 2 = 19 shirts (the count-2 line) ... two lines to fix: the number used twice, and the empty ones
    expect(text(html)).toMatch(/18 players · 19 shirts · \d to fix/);
    expect(html).toContain('data-testid="done-team-show"');
    expect(html).toContain('aria-label="Show the team list"');
  });
  it("says 'All ready' with no Show when nothing needs a look, and leaves out the pieces when they are the players", () => {
    const html = done(eighteen);
    expect(text(html)).toContain("18 players · All ready");
    expect(html).not.toContain('data-testid="done-team-show"');
  });
  it("names the product's noun for the pieces", () => {
    const section = doneTeamSection({
      wording: W,
      summary: { players: 18, pieces: 19, linesToFix: 2, minimum: null },
      noun: { one: "jersey", many: "jerseys" },
      minimum: null,
    });
    expect(section.text).toBe("18 players · 19 jerseys · 2 to fix");
  });
  it("shows the region's minimum under the summary only below it, and nothing for a region without one", () => {
    const seven = eighteen.slice(0, 7);
    const below = done(seven, {}, { minimum: { pieces: 10, region: "the UK" } }, { minimum: 10 });
    expect(text(below)).toContain("Orders to the UK need at least 10 shirts. You have 7: add 3 more.");
    const met = done(eighteen, {}, { minimum: { pieces: 10, region: "the UK" } }, { minimum: 10 });
    expect(met).not.toContain('data-testid="done-team-minimum"');
    const none = done(seven);
    expect(none).not.toContain('data-testid="done-team-minimum"');
  });
});

describe("the wording about ordering is honest", () => {
  it("says ordering is not open from here yet: no date, no price, no 'soon'", () => {
    const html = done(eighteen);
    const note = text(html);
    expect(note).toContain("You can't order from here yet. Your design and team list are saved on this device.");
    expect(note).not.toMatch(/\bsoon\b|£|[$]|\bPKR\b|\bAED\b|\bRs\.? ?[0-9]/i);
    expect(text(done([]))).toContain("You can't order from here yet. Your design is saved on this device.");
  });
  it("keeps Save and go back as the main button before M3, whatever the list's state", () => {
    for (const lines of [[], eighteen, [line("y", "Usman", "", "")]]) expect(done(lines)).toContain('data-testid="done-save-and-go-back"');
  });
});

describe("with the host's listRequiredToContinue (after M3, 11.2)", () => {
  const required = { listRequired: true };
  it("is the next thing to do: Add your players for an empty list", () => {
    const html = done([], required);
    expect(text(html)).toContain("Add your players");
    expect(html).toContain('data-testid="done-list-step"');
    expect(html).not.toContain('data-testid="done-save-and-go-back"');
    expect(text(html)).toContain("Save and finish later");
  });
  it("Fix 1 line / Fix 2 lines when there are problems", () => {
    expect(text(done([...eighteen.slice(0, 11), line("y", "Usman", "", "")], required))).toContain("Fix 1 line");
    expect(text(done([...eighteen.slice(0, 11), line("y", "Usman", "", ""), line("z", "Hamza", "", "")], required))).toContain("Fix 2 lines");
  });
  it("Add 3 more players below the minimum, and the host's own button once the list is ready", () => {
    const below = done(eighteen.slice(0, 7), required, { minimum: { pieces: 10, region: "the UK" } }, { minimum: 10 });
    expect(text(below)).toContain("Add 3 more players");
    const ready = done(eighteen, { ...required, primaryAction: <button className="host">Continue to the proof</button> }, { minimum: { pieces: 10, region: "the UK" } }, { minimum: 10 });
    expect(text(ready)).toContain("Continue to the proof");
    expect(ready).not.toContain('data-testid="done-list-step"');
  });
});
