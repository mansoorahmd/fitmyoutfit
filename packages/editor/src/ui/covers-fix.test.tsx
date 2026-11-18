/**
 * E3e (QA 17, B1, B2): "Move it clear" is offered only when a fix exists; a free place is free of every item on the
 * piece, drawn above or below; the fix searches away from the covered item first, checks for cut-off parts and falls
 * back to making the item smaller.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { createDesign } from "../design/create";
import { addLayer, updateLayer } from "../design/edit";
import { newLogoLayer } from "../design/new-layers";
import { isClipped } from "../design/print-area";
import type { DesignDocument, ProductDefinition } from "../design/schema";
import { EDITOR_WORDING as W } from "./content";
import { EditorContext, type EditorApi } from "./context";
import { clearAnnouncement, clearFix, coveredItem, moveClear, overlappedItem } from "./overlap";
import { SelectedWarnings } from "./SelectedItem";
import { loadPlaceholderFonts, loadPlaceholderPalette, loadStandInJerseyProduct, loadStandInProduct } from "../test/fixtures";

const palette = loadPlaceholderPalette();
const fonts = loadPlaceholderFonts();
const noop = () => undefined;
const api = (product: ProductDefinition, design: DesignDocument, overrides: Partial<EditorApi>): EditorApi => ({
  product, palette, fonts, templates: [], wording: W, assets: { upload: async () => ({ assetId: "a1" }), url: () => null }, layout: "wide", detent: "normal", setDetent: noop, design,
  commit: () => true, begin: noop, preview: noop, end: noop, hoverPreview: noop, textFits: [], fontsLoading: false, fontsFailed: false,
  garmentView: null, showSide: noop, focusOn: noop, announce: noop, colourTarget: { kind: "zone", id: "body_front" }, chooseColourTarget: noop,
  recentColours: [], useColour: noop, setTyping: noop, openTool: noop, nudge: noop, reducedMotion: false, markTiming: noop, snapping: true, setSnapping: noop, selectedId: null, select: noop, logoNotes: {}, setLogoNote: noop,
  ...overrides,
});
const render = (product: ProductDefinition, design: DesignDocument, selectedId: string) =>
  renderToStaticMarkup(
    <EditorContext.Provider value={api(product, design, { selectedId })}>
      <SelectedWarnings />
    </EditorContext.Provider>,
  );

/** Logos placed one after the other on a piece (the last is drawn on top). */
function withLogos(product: ProductDefinition, pieceId: string, logos: Array<{ id: string; at?: { x: number; y: number }; side?: number }>): DesignDocument {
  let d = createDesign(product, { teamName: "LAHORE LIONS", samplePlayer: { name: "ALI", number: "10" } });
  for (const l of logos) {
    const base = newLogoLayer(product, { id: l.id, pieceId, role: "crest", asset: { assetId: l.id, mediaType: "image/png", width: 1000, height: 1000 } });
    d = addLayer(d, { ...base, ...(l.side ? { size: { width: l.side, height: l.side } } : {}), ...(l.at ? { position: l.at } : {}) }, { product });
  }
  return d;
}
const at = (d: DesignDocument, id: string) => d.layers.find((l) => l.id === id)!;

for (const [name, product] of [["jersey", loadStandInJerseyProduct()], ["T-shirt", loadStandInProduct()]] as const) {
  describe(`"Move it clear", on the ${name}`, () => {
    it("B1: where no place is free (two logos on a sleeve) there is no fix, no button, and the words say what to do", () => {
      const d = withLogos(product, "sleeve_left", [{ id: "logo-1" }, { id: "logo-2" }]);
      expect(coveredItem(d, at(d, "logo-2"))?.id).toBe("logo-1");
      expect(clearFix(d, "logo-2", product)).toBeNull();
      const html = render(product, d, "logo-2");
      expect(html).toContain('data-testid="covers-logo-2"');
      expect(html).not.toContain('data-testid="move-clear-logo-2"');
      expect(html).not.toContain(W.selection.moveClear);
      expect(html).toContain('data-testid="move-clear-none-logo-2"');
      expect(html).toContain("There is no free place for it here. Make it smaller or move it by hand.");
      expect(W.selection.coversNoRoom).toBe("There is no free place for it here. Make it smaller or move it by hand.");
    });

    it("B1: where a fix exists the button is shown and the sentence is not", () => {
      const d = withLogos(product, "front", [{ id: "logo-1" }, { id: "logo-2" }]);
      const html = render(product, d, "logo-2");
      expect(html).toContain('data-testid="move-clear-logo-2"');
      expect(html).toContain(W.selection.moveClear);
      expect(html).not.toContain("move-clear-none");
    });

    it("B2: a free place is free of items drawn above the moved one too", () => {
      const d0 = withLogos(product, "front", [{ id: "logo-1" }, { id: "logo-2" }]);
      const first = clearFix(d0, "logo-2", product)!;
      const landing = at(first.design, "logo-2").position;
      // A third item, drawn above, stands exactly where the fix would have parked the second.
      const third = newLogoLayer(product, { id: "logo-3", pieceId: "front", role: "crest", asset: { assetId: "logo-3", mediaType: "image/png", width: 1000, height: 1000 } });
      const d = addLayer(d0, { ...third, position: { ...landing } }, { product });
      expect(overlappedItem(d, at(d, "logo-2"))).not.toBeNull();
      const fixed = clearFix(d, "logo-2", product)!;
      expect(fixed).not.toBeNull();
      const moved = at(fixed.design, "logo-2");
      expect(overlappedItem(fixed.design, moved)).toBeNull();
      expect(moved.position).not.toEqual(landing);
      expect(isClipped(product, moved)).toBe(false);
    });

    it("the nearest free place, away from the item it covers first (the search's direction)", () => {
      const d = withLogos(product, "front", [{ id: "logo-1" }, { id: "logo-2" }]);
      const before = at(d, "logo-2").position;
      const fixed = clearFix(d, "logo-2", product)!;
      expect(fixed.how).toBe("moved");
      const moved = at(fixed.design, "logo-2");
      // Level with the one it covers: away is up (smaller y); 100 mm is its own height, the nearest free place.
      expect(moved.position.x).toBeCloseTo(before.x, 6);
      expect(moved.position.y).toBeCloseTo(before.y - 100, 6);
      // Drawn above and a little lower than the one under it: away is down.
      const lower = updateLayer(d, "logo-2", { position: { x: before.x, y: before.y + 10 } }, { product });
      const down = at(clearFix(lower, "logo-2", product)!.design, "logo-2");
      expect(down.position.y).toBeGreaterThan(before.y + 10);
    });
  });
}

describe("the fix does not park an item where it is cut off (clipping)", () => {
  const product = loadStandInJerseyProduct();
  it("on a side panel the place above is cut off by the piece's outline: the fix goes the other way", () => {
    const d = withLogos(product, "side_panel_left", [{ id: "logo-1" }, { id: "logo-2" }]);
    const before = at(d, "logo-2").position;
    const fixed = clearFix(d, "logo-2", product)!;
    expect(fixed).not.toBeNull();
    const moved = at(fixed.design, "logo-2");
    expect(isClipped(product, moved)).toBe(false);
    expect(moved.position.y).toBeGreaterThan(before.y);
    expect(overlappedItem(fixed.design, moved)).toBeNull();
  });
});

describe("the fix makes the item smaller when no place is free, and says so (B1)", () => {
  const product = loadStandInJerseyProduct();
  // A small logo at the sleeve's left, a big one over it: the big one cannot move clear (the sleeve is too short), but fits when smaller.
  const d = withLogos(product, "sleeve_left", [{ id: "logo-1", at: { x: 140, y: 100 }, side: 10 }, { id: "logo-2" }]);
  it("shrinks until it covers nothing, as one fix", () => {
    const before = at(d, "logo-2");
    expect(coveredItem(d, before)?.id).toBe("logo-1");
    const fixed = clearFix(d, "logo-2", product);
    expect(fixed?.how).toBe("smaller");
    const after = at(fixed!.design, "logo-2");
    expect(after.size.width).toBeLessThan(before.size.width);
    expect(overlappedItem(fixed!.design, after)).toBeNull();
    expect(isClipped(product, after)).toBe(false);
    expect(moveClear(d, "logo-2", product)).toEqual(fixed!.design);
    expect(render(product, d, "logo-2")).toContain('data-testid="move-clear-logo-2"');
  });
  it("announces it in words; a move is not announced", () => {
    const fixed = clearFix(d, "logo-2", product)!;
    expect(clearAnnouncement(W, fixed, "Team name")).toBe("Made smaller so it no longer covers the team name.");
    expect(clearAnnouncement(W, { design: fixed.design, how: "moved" }, "Team name")).toBeNull();
  });
});
