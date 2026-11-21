/**
 * E3f: a click on a part of the garment opens its colour row (a popover on desktop; the Colours tool on a phone),
 * the item under the mouse gets its outline, a part gets its name. Swatches are recorded as they render so their
 * taps can be called: two clicks in all (the part, then a swatch), the second one step that gives the colour.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createDesign } from "../design/create";
import type { DesignDocument } from "../design/schema";
import type { CanvasHover } from "../react/DesignCanvas";
import { loadPlaceholderFonts, loadPlaceholderPalette, loadStandInJerseyProduct } from "../test/fixtures";
import { EDITOR_WORDING as W } from "./content";
import { partTapAction } from "./selection";

interface Seen {
  testId?: string;
  selected: boolean;
  onPick: () => void;
}
const seen: Seen[] = [];
vi.mock("./parts", async (importOriginal) => {
  const original = (await importOriginal()) as Record<string, unknown>;
  return {
    ...original,
    Swatch: (props: Seen) => {
      seen.push(props);
      return <button type="button" data-testid={props.testId} aria-pressed={props.selected} />;
    },
  };
});

const { EditorContext } = await import("./context");
const { PartPopover } = await import("./PartPopover");
const { HoverMarks } = await import("./HoverMarks");

const product = loadStandInJerseyProduct();
const palette = loadPlaceholderPalette();
const fonts = loadPlaceholderFonts();
const design = createDesign(product, { teamName: "LAHORE LIONS", samplePlayer: { name: "ALI", number: "10" } });
const noop = () => undefined;
type Edit = (d: DesignDocument) => DesignDocument;
let commits: Array<{ edit: Edit; label: string }> = [];
const api = {
  product, palette, fonts, templates: [], wording: W, assets: { upload: async () => ({ assetId: "a1" }), url: () => null }, layout: "wide", detent: "normal", setDetent: noop, design,
  commit: (edit: Edit, label: string) => {
    commits.push({ edit, label });
    return true;
  },
  begin: noop, preview: noop, end: noop, hoverPreview: noop, textFits: [], fontsLoading: false, fontsFailed: false, garmentView: null, showSide: noop, focusOn: noop, announce: noop,
  colourTarget: { kind: "zone", id: "body_front" }, chooseColourTarget: noop, recentColours: [], useColour: noop, setTyping: noop, openTool: noop, nudge: noop, reducedMotion: false, markTiming: noop,
  snapping: true, setSnapping: noop, selectedId: null, select: noop, logoNotes: {}, setLogoNote: noop,
} as never;
const render = (node: React.ReactNode) => renderToStaticMarkup(<EditorContext.Provider value={api}>{node}</EditorContext.Provider>);
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

beforeEach(() => {
  seen.length = 0;
  commits = [];
});

describe("E3f: what a click on a part opens", () => {
  const base = { zoneId: "sleeves", shapeGroup: null, layout: "wide" as const, startCard: false, doneOpen: false, typing: false };
  it("desktop: a popover by the click; a phone or landscape: the Colours tool on that part's row", () => {
    expect(partTapAction(base)).toEqual({ target: { kind: "zone", id: "sleeves" }, open: "popover" });
    expect(partTapAction({ ...base, layout: "compact" })).toEqual({ target: { kind: "zone", id: "sleeves" }, open: "panel" });
    expect(partTapAction({ ...base, layout: "short" })?.open).toBe("panel");
  });
  it("the group of shapes on top is the part when there is one", () => {
    expect(partTapAction({ ...base, zoneId: "body_front", shapeGroup: "hoops" })?.target).toEqual({ kind: "shapes", id: "hoops" });
  });
  it("nothing opens over the start card, the Done panel or while typing, nor on fabric that is no part", () => {
    expect(partTapAction({ ...base, startCard: true })).toBeNull();
    expect(partTapAction({ ...base, doneOpen: true })).toBeNull();
    expect(partTapAction({ ...base, typing: true })).toBeNull();
    expect(partTapAction({ ...base, zoneId: null })).toBeNull();
  });
});

describe("E3f: the popover", () => {
  it("is named by the part and shows its row: the part's name, its colour now, the team colours first", () => {
    const html = render(<PartPopover target={{ kind: "zone", id: "sleeves" }} x={100} y={100} onClose={noop} />);
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-label="Sleeves"');
    expect(text(html)).toContain("Sleeves White");
    expect(html.indexOf('data-testid="swatch-sleeves-main"')).toBeGreaterThan(0);
    expect(html.indexOf('data-testid="swatch-sleeves-main"')).toBeLessThan(html.indexOf('data-testid="swatch-sleeves-placeholder-gold"'));
  });

  it("two clicks change a part: the part (opens it), then one swatch, which is one undo step that changes only that part", () => {
    render(<PartPopover target={{ kind: "zone", id: "sleeves" }} x={100} y={100} onClose={noop} />);
    seen.find((s) => s.testId === "swatch-sleeves-placeholder-gold")!.onPick();
    expect(commits).toHaveLength(1);
    const after = commits[0]!.edit(design);
    expect(after.zones.sleeves!.id).toBe("placeholder-gold");
    expect(after.zones.body_front).toEqual(design.zones.body_front);
  });
});

describe("E3f: what the hover shows", () => {
  const at = { x: 200, y: 150 };
  it("an item (not the selected one) gets a thin outline of its box", () => {
    const hover: CanvasHover = { kind: "item", layerId: "team-name-1", selected: false, ...at, corners: [{ x: 10, y: 10 }, { x: 90, y: 10 }, { x: 90, y: 40 }, { x: 10, y: 40 }] };
    const html = renderToStaticMarkup(<HoverMarks hover={hover} name={null} />);
    expect(html).toContain('data-testid="hover-box"');
    expect(html).toContain('points="10.0,10.0 90.0,10.0 90.0,40.0 10.0,40.0"');
    expect(html).toContain('aria-hidden="true"');
    expect(renderToStaticMarkup(<HoverMarks hover={{ ...hover, selected: true }} name={null} />)).toBe("");
  });
  it("a part is named by a small label near the pointer; nothing is shown for nothing, or a part with no name", () => {
    const hover: CanvasHover = { kind: "part", zoneId: "sleeves", shapeGroup: null, ...at };
    const html = renderToStaticMarkup(<HoverMarks hover={hover} name="Sleeves" />);
    expect(html).toContain('data-testid="hover-label"');
    expect(html).toContain("translate(214px, 168px)");
    expect(text(html)).toContain("Sleeves");
    expect(renderToStaticMarkup(<HoverMarks hover={null} name={null} />)).toBe("");
    expect(renderToStaticMarkup(<HoverMarks hover={hover} name={null} />)).toBe("");
  });
});
