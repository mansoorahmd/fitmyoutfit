/**
 * What the first part of the team list left out (08-team-list.md 4.5, 4.6, 4.7), now there: the size listbox in
 * Youth and Adult groups, the line menu as a sheet on a phone and a popover on a desktop, focus after a removal,
 * and the Style view's "Capitals / As typed".
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { createDesign } from "../design/create.js";
import { addCatalogFont } from "../design/font-catalog.js";
import { addLayer } from "../design/edit.js";
import { EDITOR_WORDING } from "./content.js";
import { EditorContext, type EditorApi } from "./context.js";
import { PlayersStyle } from "./LetteringTools.js";
import { MenuView } from "./TeamList.js";
import { SizeListbox } from "./TeamListLine.js";
import { TeamListContext } from "./team-list-context.js";
import { fakeTeamApi } from "./team-list-test-api.js";
import { focusAfterRemoval } from "../team-list/keys.js";
import { newLine } from "../team-list/lines.js";
import { DEFAULT_TEAM_SIZES, type EditorLine } from "../team-list/types.js";
import { loadPlaceholderFonts, loadPlaceholderPalette, loadPlaceholderProduct } from "../test/fixtures.js";

const W = EDITOR_WORDING;
const line = (id: string, name: string, extra: Partial<EditorLine> = {}): EditorLine => ({ ...newLine(id), name, number: "1", size: "M", ...extra });
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/\s+/g, " ").trim();

describe("the size listbox: Youth and Adult (4.5)", () => {
  const html = renderToStaticMarkup(<SizeListbox id="sizes" sizes={DEFAULT_TEAM_SIZES} typed="" active={5} wording={W} onPick={() => undefined} />);
  it("is a listbox of two named groups, Youth first, with a heading each and the options in the product's order", () => {
    expect(html).toContain('role="listbox"');
    expect(html.match(/role="group"/g)).toHaveLength(2);
    expect(html).toContain('aria-label="Youth"');
    expect(html).toContain('aria-label="Adult"');
    expect(html.indexOf('aria-label="Youth"')).toBeLessThan(html.indexOf('aria-label="Adult"'));
    const order = [...html.matchAll(/role="option"[^>]*data-size="([A-Z0-9]+)"/g)].map((m) => m[1]);
    expect(order).toEqual(DEFAULT_TEAM_SIZES.map((s) => s.code));
    expect(html.indexOf('data-size="YXL"')).toBeLessThan(html.indexOf('aria-label="Adult"'));
  });
  it("marks the highlighted option by its place in the whole list, across the groups", () => {
    expect(html).toMatch(/aria-selected="true"[^>]*data-size="S"|data-size="S"[^>]*aria-selected="true"/);
    expect((html.match(/aria-selected="true"/g) ?? []).length).toBe(1);
  });
  it("shows only the group that has a match while the typed text filters", () => {
    const youthOnly = renderToStaticMarkup(<SizeListbox id="sizes" sizes={DEFAULT_TEAM_SIZES} typed="y" active={-1} wording={W} onPick={() => undefined} />);
    expect(youthOnly).toContain('aria-label="Youth"');
    expect(youthOnly).not.toContain('aria-label="Adult"');
  });
});

describe("the line menu (4.6)", () => {
  const items = [{ id: "up", label: "Move up", onSelect: () => undefined }, { id: "remove", label: "Remove", danger: true, onSelect: () => undefined }];
  it("is a sheet in the panel area on a phone: a scrim, a title with the player's name, items of 48 px, in the panel and not fixed to the page", () => {
    const html = renderToStaticMarkup(<MenuView anchor={null} sheet label="More for Ali Raza" items={items} onClose={() => undefined} />);
    expect(html).toContain('data-sheet="true"');
    expect(html).toContain("fmo-tl-sheet");
    expect(html).toContain('data-testid="tl-menu-scrim"');
    expect(text(html)).toContain("More for Ali Raza");
    expect(html).not.toContain("visibility:hidden");
  });
  it("is a popover next to its button on a desktop: no scrim, placed by the button", () => {
    const html = renderToStaticMarkup(<MenuView anchor={null} label="More for Ali Raza" items={items} onClose={() => undefined} />);
    expect(html).not.toContain("fmo-tl-sheet");
    expect(html).not.toContain("tl-menu-scrim");
  });
  it("has the sheet's look in the stylesheet: it rises from the foot of the panel", async () => {
    const { EDITOR_CSS } = await import("./styles.js");
    expect(EDITOR_CSS).toMatch(/\.fmo-tl-menu\.fmo-tl-sheet \{ position: absolute;[^}]*inset: auto 0 0 0;/);
  });
});

describe("focus after a removal (4.7, 13.7)", () => {
  const lines = [line("a", "Ali"), line("b", "Bilal"), line("c", "Usman")];
  it("goes to the same field of the line that took the removed one's place", () => {
    expect(focusAfterRemoval({ lines, removedId: "b", lastField: "number", showNumber: true, phoneWithoutKeyboard: false })).toEqual({ id: "c", field: "number" });
    expect(focusAfterRemoval({ lines, removedId: "a", lastField: "size", showNumber: true, phoneWithoutKeyboard: false })).toEqual({ id: "b", field: "size" });
  });
  it("takes the line before when the last one is removed, and names nothing when the list is empty", () => {
    expect(focusAfterRemoval({ lines, removedId: "c", lastField: "name", showNumber: true, phoneWithoutKeyboard: false })).toEqual({ id: "b", field: "name" });
    expect(focusAfterRemoval({ lines: [lines[0]!], removedId: "a", lastField: "name", showNumber: true, phoneWithoutKeyboard: false })).toBeNull();
    expect(focusAfterRemoval({ lines, removedId: "gone", lastField: "name", showNumber: true, phoneWithoutKeyboard: false })).toBeNull();
  });
  it("falls back to the field the new line has, and to the name when none was focused", () => {
    const spare = [line("a", "Ali"), line("b", "Bilal"), line("c", "", { noName: true })];
    expect(focusAfterRemoval({ lines: spare, removedId: "b", lastField: "name", showNumber: true, phoneWithoutKeyboard: false })).toEqual({ id: "c", field: "number" });
    expect(focusAfterRemoval({ lines, removedId: "a", lastField: null, showNumber: true, phoneWithoutKeyboard: false })).toEqual({ id: "b", field: "name" });
    expect(focusAfterRemoval({ lines, removedId: "a", lastField: "number", showNumber: false, phoneWithoutKeyboard: false })).toEqual({ id: "b", field: "name" });
  });
  it("on a phone with the keyboard closed the line itself takes focus (a field would raise the keyboard)", () => {
    expect(focusAfterRemoval({ lines, removedId: "b", lastField: "number", showNumber: true, phoneWithoutKeyboard: true })).toEqual({ id: "c", field: "line" });
  });
});

describe("Capitals and As typed in the Style view (Q-TL2)", () => {
  const product = loadPlaceholderProduct();
  const fonts = loadPlaceholderFonts();
  const withName = (letterCase?: "as-typed") => {
    let d = createDesign(product, { teamName: "LIONS", samplePlayer: { name: "Ali Raza", number: "10" } });
    d = addCatalogFont(d, fonts, "oswald-700");
    return addLayer(d, { id: "name", kind: "text", role: "player-name", pieceId: "front", position: { x: 280, y: 300 }, size: { width: 400, height: 80 }, rotation: 0, value: "Ali Raza", direction: "auto", fontId: "oswald-700", fontSize: 60, fill: { id: "x", hex: "#00FF00" }, align: "center", ...(letterCase ? { letterCase } : {}) }, { product });
  };
  function style(design: ReturnType<typeof withName>) {
    const noop = () => undefined;
    const api: EditorApi = {
      product, palette: loadPlaceholderPalette(), fonts, templates: [], wording: W, assets: { upload: async () => ({ assetId: "a" }), url: () => null }, layout: "compact", detent: "expanded", setDetent: noop, design,
      commit: () => true, begin: noop, preview: noop, end: noop, hoverPreview: noop, textFits: [], fontsLoading: false, fontsFailed: false, garmentView: null,
      showSide: noop, focusOn: noop, announce: noop, colourTarget: { kind: "zone", id: "body_front" }, chooseColourTarget: noop, recentColours: [], useColour: noop,
      setTyping: noop, openTool: noop, nudge: noop, reducedMotion: false, markTiming: noop, snapping: true, setSnapping: noop, selectedId: null, select: noop, logoNotes: {}, setLogoNote: noop,
    };
    return renderToStaticMarkup(
      <EditorContext.Provider value={api}>
        <TeamListContext.Provider value={fakeTeamApi([])}>
          <PlayersStyle onBack={() => undefined} showPreviewAs={false} />
        </TeamListContext.Provider>
      </EditorContext.Provider>,
    );
  }
  it("offers Capitals and As typed with Capitals chosen by default, and says Arabic and Urdu have none", () => {
    const html = style(withName());
    expect(html).toContain('data-testid="letter-case"');
    expect(text(html)).toContain("Capitals");
    expect(text(html)).toContain("As typed");
    expect(text(html)).toContain("Arabic and Urdu names have no capitals");
    expect(html).toMatch(/aria-pressed="true" data-value="upper"/);
  });
  it("shows As typed chosen when the design says so", () => {
    expect(style(withName("as-typed"))).toMatch(/aria-pressed="true" data-value="as-typed"/);
  });
  it("is not offered when the design has no player name item", () => {
    const d = createDesign(product, { teamName: "LIONS" });
    expect(style(d as ReturnType<typeof withName>)).not.toContain('data-testid="letter-case"');
  });
});
