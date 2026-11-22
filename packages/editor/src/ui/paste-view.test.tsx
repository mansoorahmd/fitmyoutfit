/**
 * The paste view and its ways in, rendered to markup in node (no DOM): the box before pasting, the result before
 * anything is added (08-team-list.md 5.2 to 5.4), the toolbar and empty-state buttons (5.1), the accessible names.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { createDesign } from "../design/create.js";
import { EDITOR_WORDING } from "./content.js";
import { EditorContext, type EditorApi } from "./context.js";
import { PasteView } from "./PasteView.js";
import { TeamListView } from "./TeamList.js";
import { TeamListContext, type TeamListApi } from "./team-list-context.js";
import { fakeTeamApi } from "./team-list-test-api.js";
import { TWENTY } from "../team-list/paste-samples.js";
import { newLine } from "../team-list/lines.js";
import type { EditorLine } from "../team-list/types.js";
import { loadPlaceholderFonts, loadPlaceholderPalette, loadStandInJerseyProduct } from "../test/fixtures.js";

const product = loadStandInJerseyProduct();
const W = EDITOR_WORDING;
const design = createDesign(product, { teamName: "LIONS", samplePlayer: { name: "ALI", number: "10" } });
const line = (id: string, name: string, number: string, size: string): EditorLine => ({ ...newLine(id), name, number, size });

function editorApi(layout: "compact" | "wide"): EditorApi {
  const noop = () => undefined;
  return {
    product, palette: loadPlaceholderPalette(), fonts: loadPlaceholderFonts(), templates: [], wording: W, assets: { upload: async () => ({ assetId: "a1" }), url: () => null }, layout, detent: "expanded", setDetent: noop, design,
    commit: () => true, begin: noop, preview: noop, end: noop, hoverPreview: noop, textFits: [], fontsLoading: false, fontsFailed: false, garmentView: null,
    showSide: noop, focusOn: noop, announce: noop, colourTarget: { kind: "zone", id: "body_front" }, chooseColourTarget: noop, recentColours: [], useColour: noop,
    setTyping: noop, openTool: noop, nudge: noop, reducedMotion: false, markTiming: noop, snapping: true, setSnapping: noop, selectedId: null, select: noop, logoNotes: {}, setLogoNote: noop,
  };
}
const text = (html: string) => html.replaceAll("⁨", "").replaceAll("⁩", "").replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/\s+/g, " ");
function render(node: (t: TeamListApi) => React.ReactNode, lines: EditorLine[] = [], overrides: Partial<TeamListApi> = {}, layout: "compact" | "wide" = "compact") {
  const t = fakeTeamApi(lines, overrides);
  return renderToStaticMarkup(
    <EditorContext.Provider value={editorApi(layout)}>
      <TeamListContext.Provider value={t}>{node(t)}</TeamListContext.Provider>
    </EditorContext.Provider>,
  );
}

describe("the paste view before anything is pasted", () => {
  const html = render(() => <PasteView />);
  it("explains in the specification's words, with the three example lines, and offers a file", () => {
    expect(text(html)).toContain(W.teamList.paste.title);
    expect(text(html)).toContain(W.teamList.paste.body);
    expect(html).toContain("Ali Raza 10 M");
    expect(html).toContain("محمد علی ٧ XL");
    expect(html).toContain('data-testid="paste-choose-file"');
    expect(html).toContain('accept=".csv,.tsv,.txt,text/csv,text/plain"');
    expect(text(html)).toContain(W.teamList.paste.excelHint);
  });
  it("has a box that reads right to left when the text does, with no spell checking, 6 lines on a phone and 8 on a desktop", () => {
    expect(html).toContain('dir="auto"');
    expect(html).toContain('spellCheck="false"');
    expect(html).toContain('rows="6"');
    expect(render(() => <PasteView />, [], {}, "wide")).toContain('rows="8"');
  });
  it("has no result and no add button until there is text, and a way back that leaves the list alone", () => {
    expect(html).not.toContain('data-testid="paste-result"');
    expect(html).not.toContain('data-testid="paste-accept"');
    expect(html).toContain('data-testid="paste-back"');
  });
});

describe("the paste view after pasting 20 lines", () => {
  const html = render(() => <PasteView />, [], { pasteText: TWENTY });
  it("says how many players were read and how many need a look, and folds the box to one line", () => {
    expect(text(html)).toContain("We read 20 players · 4 need a look");
    expect(text(html)).toContain("Your text: 20 lines");
    expect(html).not.toContain('data-testid="paste-box"');
    expect(html).toContain('data-testid="paste-edit"');
  });
  it("lists a row per player, names isolated, with the same message as the list for a number used twice", () => {
    expect(html).toContain('data-testid="paste-row-19"');
    expect(html).not.toContain('data-testid="paste-row-20"');
    expect(text(html)).toContain("Same number as");
    expect(html).toContain("<bdi");
  });
  it("names each row for a screen reader, and says 'no size' for an empty size", () => {
    const one = render(() => <PasteView />, [], { pasteText: "Imran 5" });
    expect(one).toContain('aria-label="Imran, 5, no size"');
    expect(text(one)).toContain("No size found. You can add it after.");
  });
  it("the add button counts the players; the list is not touched, so there is no choice to make with an empty list", () => {
    expect(text(html)).toContain("Add 20 players");
    expect(html).not.toContain('data-testid="paste-mode-replace"');
  });
});

describe("the paste view with players already in the list", () => {
  const lines = [line("a", "Old One", "1", "M"), line("b", "Old Two", "2", "L"), line("c", "Old Three", "3", "S"), line("d", "Old Four", "4", "XL")];
  const html = render(() => <PasteView />, lines, { pasteText: "Ali 7 M\nBilal 8 L" });
  it("adds to the list by default, offers 'Replace the list' second, and says how many are there", () => {
    expect(text(html)).toContain("Add to the 4 players in the list");
    expect(text(html)).toContain("Replace the list");
    expect(html.indexOf("paste-mode-add")).toBeLessThan(html.indexOf("paste-mode-replace"));
    expect(html).toMatch(/data-testid="paste-mode-add"[^>]*checked|checked[^>]*data-testid="paste-mode-add"/);
    expect(text(html)).toContain("Add 2 players");
  });
  it("lists the lines that are not players apart, each with an Add that names the line", () => {
    const h = render(() => <PasteView />, lines, { pasteText: "Squad for Saturday:\nAli 7 M\n👍" });
    expect(text(h)).toContain("Not added (2)");
    expect(text(h)).toContain("Doesn't look like a player.");
    expect(text(h)).toContain("Nothing to read.");
    expect(h).toContain('data-testid="paste-add-extra-1"');
    expect(h).not.toContain('data-testid="paste-add-extra-3"');
  });
  it("says when only some fit", () => {
    const full = Array.from({ length: 98 }, (_, i) => line(`f${i}`, `F${i}`, String(i), "M"));
    const h = render(() => <PasteView />, full, { pasteText: "A 1 M\nB 2 M\nC 3 M\nD 4 M", limits: { maxLines: 100, minCount: 1, maxCount: 10 } });
    expect(text(h)).toContain("Only 2 more players fit in the list. We'll add the first 2.");
    expect(text(h)).toContain("Add 2 players");
  });
});

describe("the ways in (5.1)", () => {
  it("the toolbar has Paste a list, and the empty state offers it beside Add a player", () => {
    const lines = [line("a", "Ali", "1", "M")];
    const withLines = renderToStaticMarkup(
      <EditorContext.Provider value={editorApi("wide")}>
        <TeamListContext.Provider value={fakeTeamApi(lines)}>
          <TeamListView initialDetailsOpen />
        </TeamListContext.Provider>
      </EditorContext.Provider>,
    );
    expect(withLines).toContain('data-testid="tl-paste"');
    expect(text(withLines)).toContain("Paste a list");
    const empty = render(() => <TeamListView />);
    expect(empty).toContain('data-testid="tl-empty-paste"');
    expect(text(empty)).toContain("or paste the list you already have");
  });
  it("a paste of several lines into a field is handed to the paste view, a single line is not (the field's own handler is on the list)", () => {
    const html = render(() => <TeamListView />, [line("a", "Ali", "1", "M")]);
    expect(html).toContain('data-testid="tl-list"');
  });
});
