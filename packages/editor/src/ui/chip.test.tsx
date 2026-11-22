/**
 * The player chip and the phone's stage (08-team-list.md 7.2, 3.2), rendered to markup in node: the words and names the
 * chip carries, the inactive ends, the sample label, the whole-shirt toggle, and which view controls the list view gives.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { createDesign } from "../design/create.js";
import { EDITOR_WORDING } from "./content.js";
import { EditorContext, type EditorApi } from "./context.js";
import { viewControlsFor } from "./layout.js";
import { PlayerChip, WholeShirtToggle } from "./PlayerChip.js";
import { TeamListContext, type TeamListApi } from "./team-list-context.js";
import { fakeTeamApi } from "./team-list-test-api.js";
import { newLine } from "../team-list/lines.js";
import type { EditorLine } from "../team-list/types.js";
import { loadPlaceholderFonts, loadPlaceholderPalette, loadStandInJerseyProduct } from "../test/fixtures.js";

const product = loadStandInJerseyProduct();
const W = EDITOR_WORDING;
const design = createDesign(product, { teamName: "LIONS", samplePlayer: { name: "PLAYER", number: "10" } });
const line = (id: string, name: string, number: string, size: string, extra: Partial<EditorLine> = {}): EditorLine => ({ ...newLine(id), name, number, size, ...extra });

function editorApi(): EditorApi {
  const noop = () => undefined;
  return {
    product, palette: loadPlaceholderPalette(), fonts: loadPlaceholderFonts(), templates: [], wording: W, assets: { upload: async () => ({ assetId: "a1" }), url: () => null }, layout: "compact", detent: "expanded", setDetent: noop, design,
    commit: () => true, begin: noop, preview: noop, end: noop, hoverPreview: noop, textFits: [], fontsLoading: false, fontsFailed: false, garmentView: null,
    showSide: noop, focusOn: noop, announce: noop, colourTarget: { kind: "zone", id: "body_front" }, chooseColourTarget: noop, recentColours: [], useColour: noop,
    setTyping: noop, openTool: noop, nudge: noop, reducedMotion: false, markTiming: noop, snapping: true, setSnapping: noop, selectedId: null, select: noop, logoNotes: {}, setLogoNote: noop,
  };
}
const text = (html: string) => html.replaceAll("⁨", "").replaceAll("⁩", "").replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/\s+/g, " ").trim();
function chip(lines: EditorLine[], chosen: string | null, over: Partial<TeamListApi> = {}) {
  const t = fakeTeamApi(lines, { chosenId: chosen, ...over });
  return renderToStaticMarkup(
    <EditorContext.Provider value={editorApi()}>
      <TeamListContext.Provider value={t}>
        <PlayerChip inList={false} />
      </TeamListContext.Provider>
    </EditorContext.Provider>,
  );
}
const team = [line("a", "Ali Raza", "10", "M"), line("b", "Bilal Ahmed", "7", "L"), line("c", "Usman Tariq", "23", "")];

describe("the chip", () => {
  it("is a group named for the shirt, with the number first and the name in capitals", () => {
    const html = chip(team, "a");
    expect(html).toContain('role="group"');
    expect(html).toContain(`aria-label="${W.teamList.chip.group}"`);
    expect(text(html)).toContain("10 · ALI RAZA");
    expect(html).toContain("<bdi");
  });
  it("names its buttons for the players they go to, and the middle for the chosen player and the list", () => {
    const html = chip(team, "b");
    expect(html).toContain('aria-label="Previous player: Ali Raza"');
    expect(html).toContain('aria-label="Next player: Usman Tariq"');
    expect(html).toContain('aria-label="Bilal Ahmed, number 7, size L. Show in the team list."');
  });
  it("makes the ends inactive (aria-disabled), never wrapping", () => {
    const first = chip(team, "a");
    expect(first).toMatch(/aria-label="Previous player"[^>]*aria-disabled="true"|aria-disabled="true"[^>]*aria-label="Previous player"/);
    expect(first).not.toMatch(/aria-label="Next player[^"]*"[^>]*aria-disabled="true"/);
    const last = chip(team, "c");
    expect(last).toMatch(/aria-label="Next player"[^>]*aria-disabled="true"/);
    expect(last).toContain("no size yet");
  });
  it("says 'Sample' before the sample player when the list is empty, with both steps inactive", () => {
    const html = chip([], null);
    expect(text(html)).toContain("Sample");
    expect(text(html)).toContain("10 · PLAYER");
    expect((html.match(/aria-disabled="true"/g) ?? []).length).toBe(2);
  });
  it("shows a spare shirt, a count of 2 and a line with a problem in words, not colour alone", () => {
    expect(text(chip([line("a", "Ali", "10", "M", { noName: true })], "a"))).toContain("10 · No name");
    const two = chip([line("a", "Ali", "10", "M", { count: 2 })], "a");
    expect(text(two)).toContain("×2");
    const bad = chip([line("a", "Ali", "7", "M"), line("b", "Bilal", "7", "M")], "a");
    expect(bad).toContain(`aria-label="${W.teamList.chip.problem}"`);
  });
  it("puts the number on the start side for an Arabic-digit line, and the name in its own direction", () => {
    const html = chip([line("a", "محمد علی", "٧", "XL")], "a");
    expect(text(html)).toContain("٧ · محمد علی");
    expect(html.indexOf('class="fmo-chip-number"')).toBeLessThan(html.indexOf('class="fmo-chip-name"'));
    expect(html).toContain('dir="auto"');
  });
  it("says its step politely in a hidden live region", () => {
    const html = chip(team, "b", { stepNote: "Player 2 of 3: Bilal Ahmed" });
    expect(html).toMatch(/role="status"[^>]*aria-live="polite"[^>]*>Player 2 of 3: Bilal Ahmed</);
  });
});

describe("the phone's list stage (3.2)", () => {
  const base = { layout: "compact" as const, typing: false, panelOpen: true, detent: "expanded" as const, startCard: false, stageHeight: 218 };
  it("gives the chip row in the list view instead of the sides and the zoom, and nothing while the keyboard is open", () => {
    expect(viewControlsFor({ ...base, listView: true })).toBe("list");
    expect(viewControlsFor({ ...base, listView: true, detent: "normal" })).toBe("list");
    expect(viewControlsFor({ ...base, listView: true, typing: true })).toBe("none");
    expect(viewControlsFor({ ...base })).toBe("reset-only");
  });
  it("has a whole-shirt toggle with a state and a name that follows it", () => {
    const off = renderToStaticMarkup(
      <EditorContext.Provider value={editorApi()}>
        <WholeShirtToggle pressed={false} onToggle={() => undefined} />
      </EditorContext.Provider>,
    );
    expect(off).toContain('aria-pressed="false"');
    expect(off).toContain('aria-label="Show the whole shirt"');
    const on = renderToStaticMarkup(
      <EditorContext.Provider value={editorApi()}>
        <WholeShirtToggle pressed onToggle={() => undefined} />
      </EditorContext.Provider>,
    );
    expect(on).toContain('aria-pressed="true"');
    expect(on).toContain('aria-label="Zoom to name and number"');
  });
});
