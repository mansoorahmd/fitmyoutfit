/**
 * The team list's components, rendered to markup in node (no DOM): what a line, the summary, the empty state and the
 * by-size view show, in the wording's words, with names for screen readers (08-team-list.md 4, 6.3, 8, 9, 13.8).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { createDesign } from "../design/create.js";
import { EDITOR_WORDING } from "./content.js";
import { EditorContext, type EditorApi } from "./context.js";
import { TeamListView } from "./TeamList.js";
import { LineRow, sameRow, type LineRowProps, type Shown } from "./TeamListLine.js";
import { TeamListContext, type TeamListApi } from "./team-list-context.js";
import { fakeTeamApi } from "./team-list-test-api.js";
import { analyseList } from "../team-list/checks.js";
import { DEFAULT_TEAM_SIZES, type EditorLine } from "../team-list/types.js";
import { loadPlaceholderFonts, loadPlaceholderPalette, loadStandInJerseyProduct } from "../test/fixtures.js";

const product = loadStandInJerseyProduct();
const W = EDITOR_WORDING;
const design = createDesign(product, { teamName: "LIONS", samplePlayer: { name: "ALI", number: "10" } });
const line = (id: string, name = "", number = "", size = "", extra: Partial<EditorLine> = {}): EditorLine => ({ id, name, number, size, count: 1, noName: false, noNumber: false, ...extra });
const assets = { upload: async () => ({ assetId: "a1" }), url: () => null };

function editorApi(layout: "compact" | "wide" = "compact"): EditorApi {
  const noop = () => undefined;
  return {
    product, palette: loadPlaceholderPalette(), fonts: loadPlaceholderFonts(), templates: [], wording: W, assets, layout, detent: "expanded", setDetent: noop, design,
    commit: () => true, begin: noop, preview: noop, end: noop, hoverPreview: noop, textFits: [], fontsLoading: false, fontsFailed: false, garmentView: null,
    showSide: noop, focusOn: noop, announce: noop, colourTarget: { kind: "zone", id: "body_front" }, chooseColourTarget: noop, recentColours: [], useColour: noop,
    setTyping: noop, openTool: noop, nudge: noop, reducedMotion: false, markTiming: noop, snapping: true, setSnapping: noop, selectedId: null, select: noop, logoNotes: {}, setLogoNote: noop,
  };
}
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/\s+/g, " ");
function list(lines: EditorLine[], overrides: Partial<TeamListApi> = {}, options: { layout?: "compact" | "wide"; prints?: { name: boolean; number: boolean }; seen?: TeamListApi["seen"] } = {}) {
  const t = fakeTeamApi(lines, overrides, options);
  return renderToStaticMarkup(
    <EditorContext.Provider value={editorApi(options.layout)}>
      <TeamListContext.Provider value={t}>
        <TeamListView />
      </TeamListContext.Provider>
    </EditorContext.Provider>,
  );
}

describe("the empty state (13.1)", () => {
  const html = list([]);
  it("says there are no players, offers to add one and the style, and shows no summary bar", () => {
    expect(text(html)).toContain(W.teamList.empty.title);
    expect(text(html)).toContain(W.teamList.empty.add);
    expect(html).toContain('data-testid="tl-empty-add"');
    expect(html).toContain('data-testid="tl-style-empty"');
    expect(html).not.toContain('data-testid="tl-summary-bar"');
  });
});

describe("a line", () => {
  const lines = [line("a", "Ali Raza", "10", "M"), line("b", "Bilal Ahmed", "7", "L"), line("c", "Usman Tariq", "23", "")];
  const seen = { c: { left: true } };
  const html = list(lines, {}, { seen });
  it("has a list named with the count, and a group per line named as a sentence", () => {
    expect(html).toContain('aria-label="Team list, 3 players"');
    expect(html).toContain('aria-label="Player 1 of 3: Ali Raza, 10, M"');
    expect(html).toContain('aria-label="Player 3 of 3: Usman Tariq, 23, no size yet"');
    expect(html).toContain("<ol");
  });
  it("has fields named by player, and the phone's keyboard attributes (4.1)", () => {
    expect(html).toContain('aria-label="Name, player 2"');
    expect(html).toContain('aria-label="Number, player 2"');
    expect(html).toContain('aria-label="Size, player 2"');
    expect(html).toContain('inputMode="numeric"');
    expect(html).toContain('enterKeyHint="next"');
    expect(html).toContain('dir="auto"');
    expect(html).toContain('dir="ltr"');
    expect(html).toContain('autoCorrect="off"');
    expect(html).toContain('role="combobox"');
    expect(html).not.toContain('type="number"');
  });
  it("marks the chosen line, and says a missing size inside its field once the line was left, dashed, not by colour", () => {
    expect(html.match(/data-chosen="true"/g)).toHaveLength(1);
    expect(html).toMatch(/data-state="missing"[^>]*placeholder="Needs a size"|placeholder="Needs a size"[^>]*data-state="missing"/);
    expect(html).toMatch(/aria-describedby="[^"]+-size-need"/);
    expect(text(html)).toContain("Needs a size");
  });
  it("does not say Needs a size on a line that has not been left (6.2)", () => {
    expect(list(lines)).not.toContain("Needs a size");
  });
  it("has a menu button named for the player on every line", () => {
    expect(html).toContain('aria-label="More for Usman Tariq"');
    expect(html.match(/data-testid="tl-more-/g)).toHaveLength(3);
  });
  it("shows a problem under its line with the hidden prefix, an alert icon, the name in bdi, and aria-invalid on the field", () => {
    const clash = [line("a", "Ali", "7", "M"), line("b", "محمد علی", "٧", "L")];
    const out = list(clash, {}, { seen: { a: { left: true, number: true }, b: { left: true, number: true } } });
    expect(out).toContain('data-code="number-duplicate"');
    expect(text(out)).toContain("Problem: Same number as Ali (٧).");
    expect(out).toContain("<bdi>");
    expect(out.match(/aria-invalid="true"/g)).toHaveLength(2);
    expect(out).toMatch(/aria-describedby="[^"]+-msg"/);
  });
});

describe("a line's flags and count", () => {
  it("a spare shirt shows a tag in place of the name, and a count above 1 a badge named for screen readers", () => {
    const html = list([line("a", "", "5", "M", { noName: true }), line("b", "Hamza", "4", "S", { count: 2 })]);
    expect(text(html)).toContain(W.teamList.tagNoName);
    expect(html).toContain('class="fmo-tl-tag"');
    expect(html).toContain('aria-label="2 of this shirt"');
    expect(text(html)).toContain("×2");
    expect(html).toContain('aria-label="Player 1 of 2: no name yet, 5, M"');
  });
  it("memoises a row on what it shows: the same line object and messages redraw nothing", () => {
    const l = line("a", "Ali", "10", "M");
    const base: LineRowProps = { line: l, index: 0, total: 1, wide: false, chosen: true, showNumber: true, nameLabel: "name", hasNameFlag: true, hasNumberFlag: true, shown: [], menuOpen: false, wording: W, listOpen: false };
    expect(sameRow(base, { ...base })).toBe(true);
    expect(sameRow(base, { ...base, line: { ...l, name: "Alix" } })).toBe(false);
    const msg: Shown = { key: "k", code: "x", field: "name", text: "t", inField: false, kind: "error" };
    expect(sameRow(base, { ...base, shown: [msg] })).toBe(false);
    expect(sameRow({ ...base, shown: [msg] }, { ...base, shown: [{ ...msg }] })).toBe(true);
    expect(typeof LineRow).toBe("object");
  });
});

describe("the summary (8.1)", () => {
  const lines = [line("a", "Ali", "10", "M"), line("b", "Hamza", "4", "S", { count: 2 }), line("c", "Usman", "23", "")];
  it("says the players and how many to fix, with Next to fix named for how many are left, and a plus", () => {
    const html = list(lines);
    expect(text(html)).toContain("3 players · 1 to fix");
    expect(html).toContain('aria-label="Next line to fix, 1 left"');
    expect(html).toContain('aria-label="Add a player"');
  });
  it("says All ready with a check when nothing is left, and hides Next to fix", () => {
    const html = list([line("a", "Ali", "10", "M")]);
    expect(text(html)).toContain("1 player · All ready");
    expect(html).not.toContain('data-testid="tl-next-to-fix"');
  });
  it("opened (wide) shows the pieces with the product's noun, sizes in use or all, and ready and to fix", () => {
    const html = list(lines, { noun: { one: "jersey", many: "jerseys" } }, { layout: "wide" });
    expect(text(html)).toContain("4 jerseys (Hamza has 2)");
    expect(text(html)).toContain("S 2");
    expect(text(html)).toContain("XS 0");
    expect(text(html)).toContain("No size yet 1");
    expect(text(html)).toContain("Ready 2 · To fix 1");
    expect(html).toContain('data-testid="tl-only-fix"');
  });
  it("shows the region's minimum under the bar when the pieces are below it, naming the region and how many more", () => {
    const t = fakeTeamApi(lines, { minimum: { pieces: 10, region: "the UK" }, noun: { one: "jersey", many: "jerseys" } });
    const html = renderToStaticMarkup(<EditorContext.Provider value={editorApi()}><TeamListContext.Provider value={{ ...t, analysis: analyseList(lines, { prints: { name: true, number: true }, sizes: DEFAULT_TEAM_SIZES, minimum: 10 }) }}><TeamListView /></TeamListContext.Provider></EditorContext.Provider>);
    expect(text(html)).toContain("Orders to the UK need at least 10 jerseys. You have 4: add 6 more.");
    expect(list(lines)).not.toContain("need at least");
  });
  it("says why the add buttons are inactive at the host's limit", () => {
    const html = list(lines, { limits: { maxLines: 3, minCount: 1, maxCount: 10 } });
    expect(text(html)).toContain("You've reached 3 players, the most one list can hold.");
    expect(html).toMatch(/aria-disabled="true"[^>]*data-testid="tl-add"/);
  });
  it("on a phone with the keyboard open the bar is the short line naming the chosen player", () => {
    const html = list(lines, { keyboard: true, chosenId: "b" });
    expect(text(html)).toContain("Player 2 of 3 · 1 to fix");
    expect(html).not.toContain('data-testid="tl-sort"');
  });
});

describe("designs without a number or a name (9)", () => {
  it("number only: the Name column says it is not printed, and there is a No. column", () => {
    const html = list([line("a", "Ali", "10", "M")], {}, { layout: "wide", prints: { name: false, number: true } });
    expect(text(html)).toContain(W.teamList.heading.nameNotPrinted);
    expect(html).toContain('data-field="number"');
  });
  it("name only: no No. column", () => {
    const html = list([line("a", "Ali", "", "M")], {}, { layout: "wide", prints: { name: true, number: false } });
    expect(html).not.toContain('data-field="number"');
    expect(html).not.toContain(W.teamList.heading.number);
  });
  it("neither: one stepper per size with a total, and the switch to add names for the bag labels", () => {
    const html = list([line("a", "", "", "M", { count: 3 }), line("b", "", "", "L", { count: 2 })], {}, { prints: { name: false, number: false } });
    expect(html).toContain('data-testid="tl-by-size"');
    for (const s of DEFAULT_TEAM_SIZES) expect(html).toContain(`data-testid="tl-size-count-${s.code}"`);
    expect(text(html)).toContain("Total 5");
    expect(text(html)).toContain(W.teamList.bySize.addNames);
  });
  it("numbers kept but off: a note says they come back", () => {
    const html = list([line("a", "Ali", "10", "M")], {}, { prints: { name: true, number: false } });
    expect(text(html)).toContain(W.teamList.numbersOff);
  });
});

describe("no sentence in a component (the wording module holds every one)", () => {
  it("the list's components hold no JSX text of three words or more", () => {
    for (const file of ["TeamList.tsx", "TeamListLine.tsx", "PlayersTool.tsx"]) {
      const source = readFileSync(resolve(import.meta.dirname, file), "utf8");
      const jsxText = [...source.matchAll(/>([^<>{}\n]{12,})</g)].map((m) => m[1]!.trim()).filter((t) => /^[\p{L}\s.,:'’-]+$/u.test(t) && t.split(/\s+/).length >= 3);
      expect(jsxText, file).toEqual([]);
    }
  });
});
