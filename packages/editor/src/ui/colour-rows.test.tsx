/**
 * E3f: colours as a heading with its swatches right under it. Swatches are recorded as they render (the markup of
 * `react-dom/server` has no clicks), then their taps are called: each tap is one `commit` that already gives the
 * colour, so nothing is chosen first.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createDesign } from "../design/create";
import type { DesignDocument } from "../design/schema";
import { loadPlaceholderFonts, loadPlaceholderPalette, loadStandInJerseyProduct } from "../test/fixtures";
import { EDITOR_WORDING as W } from "./content";

interface Seen {
  testId?: string;
  selected: boolean;
  disabled?: boolean;
  label: string;
  onPick: () => void;
}
const seen: Seen[] = [];
vi.mock("./parts", async (importOriginal) => {
  const original = (await importOriginal()) as Record<string, unknown>;
  return {
    ...original,
    Swatch: (props: Seen) => {
      seen.push(props);
      return <button type="button" data-testid={props.testId} aria-pressed={props.selected} disabled={props.disabled} />;
    },
  };
});

const { EditorContext } = await import("./context");
const { TeamColourRows } = await import("./ColourRows");
const { ColoursTool } = await import("./ColoursTool");

const product = loadStandInJerseyProduct();
const palette = loadPlaceholderPalette();
const fonts = loadPlaceholderFonts();
const design = createDesign(product, { teamName: "LAHORE LIONS", samplePlayer: { name: "ALI", number: "10" } });
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
const noop = () => undefined;

type Edit = (d: DesignDocument) => DesignDocument;
let commits: Array<{ edit: Edit; label: string }> = [];
function render(node: React.ReactNode, d: DesignDocument = design) {
  const api = {
    product, palette, fonts, templates: [], wording: W, assets: { upload: async () => ({ assetId: "a1" }), url: () => null }, layout: "wide", detent: "normal", setDetent: noop, design: d,
    commit: (edit: Edit, label: string) => {
      commits.push({ edit, label });
      return true;
    },
    begin: noop, preview: noop, end: noop, hoverPreview: noop, textFits: [], fontsLoading: false, fontsFailed: false, garmentView: null, showSide: noop, focusOn: noop, announce: noop,
    colourTarget: { kind: "zone", id: "body_front" }, chooseColourTarget: noop, recentColours: [], useColour: noop, setTyping: noop, openTool: noop, nudge: noop, reducedMotion: false, markTiming: noop,
    snapping: true, setSnapping: noop, selectedId: null, select: noop, logoNotes: {}, setLogoNote: noop,
  } as never;
  return renderToStaticMarkup(<EditorContext.Provider value={api}>{node}</EditorContext.Provider>);
}

beforeEach(() => {
  seen.length = 0;
  commits = [];
});

describe("E3f: the team colours as three rows", () => {
  it("each colour is a heading with its swatches under it; the accent is optional and has None", () => {
    const html = render(<TeamColourRows prefix="start" />);
    const t = text(html);
    expect(t.indexOf(W.colours.roleHeading.main)).toBeGreaterThanOrEqual(0);
    expect(t.indexOf(W.colours.roleHeading.main)).toBeLessThan(t.indexOf(W.colours.roleHeading.second));
    expect(t.indexOf(W.colours.roleHeading.second)).toBeLessThan(t.indexOf(W.colours.roleHeading.accent));
    expect(t).toContain(`${W.colours.roleHeading.accent} ${W.colours.optional}`);
    expect(html).toContain('data-testid="start-no-accent"');
    // No "choose the role first": no role chips, no radio group of slots.
    expect(html).not.toContain("team-slot");
    // The swatches sit inside their own row, after its heading.
    for (const role of ["main", "second", "accent"]) {
      const row = html.slice(html.indexOf(`data-testid="start-row-${role}"`));
      expect(row.indexOf("<h3")).toBeLessThan(row.indexOf(`start-colour-${role}-`));
    }
    expect(seen.filter((s) => s.testId?.startsWith("start-colour-main-")).length).toBeGreaterThan(3);
  });

  it("one click sets the colour (one undo step); the chosen swatch is marked", () => {
    render(<TeamColourRows prefix="start" />);
    const mainId = design.teamColors.main.id;
    expect(seen.find((s) => s.testId === `start-colour-main-${mainId}`)?.selected).toBe(true);
    const target = seen.find((s) => s.testId?.startsWith("start-colour-second-") && !s.selected && !s.disabled)!;
    target.onPick();
    expect(commits).toHaveLength(1);
    expect(commits[0]!.label).toBe("team-colour");
    const after = commits[0]!.edit(design);
    expect(`start-colour-second-${after.teamColors.second.id}`).toBe(target.testId);
    expect(after.teamColors.main).toEqual(design.teamColors.main);
  });

  it("the same colour can't be chosen for two rows: it is dimmed in the others and its name says where it is used", () => {
    render(<TeamColourRows prefix="start" />);
    const mainId = design.teamColors.main.id;
    const inSecond = seen.find((s) => s.testId === `start-colour-second-${mainId}`)!;
    expect(inSecond.disabled).toBe(true);
    expect(inSecond.selected).toBe(false);
    expect(inSecond.label).toContain(W.colours.roles.main);
    // In its own row it is the chosen one, not dimmed.
    const own = seen.find((s) => s.testId === `start-colour-main-${mainId}`)!;
    expect(own.disabled).toBe(false);
  });

  it("None removes the accent in one step", () => {
    const withAccent = (() => {
      const gold = palette.colors.find((c) => c.id === "placeholder-gold")!;
      return { ...design, teamColors: { ...design.teamColors, accent: { id: gold.id, hex: gold.hex } } } as DesignDocument;
    })();
    const html = render(<TeamColourRows prefix="team" />, withAccent);
    expect(html).toMatch(/data-testid="team-no-accent"/);
    expect(seen.find((s) => s.testId === `team-colour-accent-${withAccent.teamColors.accent!.id}`)?.selected).toBe(true);
  });
});

describe("E3f: the Colours tool, one row per part", () => {
  it("every part is a row with its name as the heading; a swatch's tap sets that part's colour in one step", () => {
    const html = render(<ColoursTool />);
    for (const zone of product.zones) expect(text(html)).toContain(zone.name);
    const sleeve = product.zones.find((z) => z.id !== "body_front")!;
    const swatch = seen.find((s) => s.testId?.startsWith(`swatch-${sleeve.id}-placeholder-`) && !s.selected)!;
    swatch.onPick();
    expect(commits).toHaveLength(1);
    expect(commits[0]!.label).toBe("zone-colour");
    const after = commits[0]!.edit(design);
    expect(`swatch-${sleeve.id}-${after.zones[sleeve.id]!.id}`).toBe(swatch.testId);
    // Only that part changed.
    expect(after.zones.body_front).toEqual(design.zones.body_front);
  });

  it("a team colour in a part's row makes the part follow it", () => {
    render(<ColoursTool />);
    seen.find((s) => s.testId === "swatch-body_front-second")!.onPick();
    expect(commits).toHaveLength(1);
    expect(commits[0]!.edit(design).zones.body_front!.teamColor).toBe("second");
  });
});
