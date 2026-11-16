/**
 * E3d: the finish round (docs/design/07-editor-review.md). The rules of its section 4 that can be checked
 * without a page: the stylesheet's scoping (4.4), the type tokens (4.3), the spacing scale (4.2), the panel
 * grid token (4.1), the native controls (4.8); and the plain decisions behind R1, R3, R4, R19.
 * The page-measuring audits (edges, gaps, type in use, overlaps, framing) are scripts: scripts/audit-*.mjs.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { EDITOR_CSS } from "./styles";
import { gutterWidth, rowHasMore } from "./finish";
import { modelTapAction } from "./selection";
import { fontDisplayName } from "./lettering";
import { Swatch } from "./parts";
import { loadPlaceholderFonts } from "../test/fixtures";

/** The stylesheet's rules as [selector, declarations], comments removed (good enough for our own flat CSS). */
function rules(css: string): Array<[string, string]> {
  const flat = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const out: Array<[string, string]> = [];
  for (const m of flat.matchAll(/([^{}]+)\{([^{}]*)\}/g)) out.push([m[1]!.trim(), m[2]!.trim()]);
  return out;
}
const RULES = rules(EDITOR_CSS);

describe("4.4 stylesheet scoping (R8)", () => {
  it("element resets use :where(), so a one-class component rule always wins", () => {
    const resets = RULES.filter(([sel]) => /(^|[\s,>])button(\s|,|$)/.test(sel) && /font:\s*inherit/.test(RULES.find((r) => r[0] === sel)![1]));
    expect(resets.length).toBeGreaterThan(0);
    for (const [sel] of resets) expect(sel.startsWith(":where(")).toBe(true);
    // The rule that broke every button's type is gone.
    expect(EDITOR_CSS).not.toMatch(/(^|\n)\.fmo-editor button \{/);
  });
  it("Done, the Done panel's action, chips, buttons and the tabs take their own tokens", () => {
    const decl = (sel: string) => RULES.find(([s]) => s === sel)?.[1] ?? "";
    expect(decl(".fmo-done")).toContain("font: var(--fmo-type-primary)");
    expect(decl(".fmo-editor .fmo-primary")).toContain("font: var(--fmo-type-primary)");
    expect(decl(".fmo-chip")).toContain("font: var(--fmo-type-chip)");
    expect(decl(".fmo-btn")).toContain("font: var(--fmo-type-button)");
    expect(EDITOR_CSS).toMatch(/\.fmo-tab \{[^}]*font: var\(--fmo-type-tab\)/);
  });
});

describe("4.3 type tokens", () => {
  const TOKENS: Record<string, string> = {
    "panel-title": "700 20px/26px var(--fmo-font-heading)",
    "panel-title-wide": "700 22px/28px var(--fmo-font-heading)",
    section: "700 15px/20px var(--fmo-font-body)",
    label: "600 14px/20px var(--fmo-font-body)",
    body: "400 15px/21px var(--fmo-font-body)",
    button: "600 15px/20px var(--fmo-font-body)",
    primary: "700 18px/18px var(--fmo-font-heading)",
    tab: "500 14px/20px var(--fmo-font-body)",
    chip: "400 14px/20px var(--fmo-font-body)",
    small: "400 13px/18px var(--fmo-font-body)",
    credit: "400 11px/16px var(--fmo-font-body)",
  };
  it("are defined with the review's values", () => {
    for (const [name, value] of Object.entries(TOKENS)) expect(EDITOR_CSS).toContain(`--fmo-type-${name}: ${value};`);
  });
  it("every font shorthand uses a token, except the listed exceptions (inherit, the editor's base, samples, badges, fields, code, the brand)", () => {
    const allowed = [/^var\(--fmo-type-[a-z-]+\)$/, /^inherit$/, /^400 15px\/1\.4 var\(--fmo-font-body\)$/, /^400 16px\/1\.2 var\(--fmo-font-body\)$/, /^600 1[23]px\/2[04]px var\(--fmo-font-body\)$/, /ui-monospace/, /^(700 20px|500 14px)\/1 var\(--fmo-font-(heading|body)\)$/];
    for (const [sel, body] of RULES) {
      for (const m of body.matchAll(/(?:^|;)\s*font:\s*([^;]+)/g)) {
        const value = m[1]!.trim();
        if (value.startsWith("var(--fmo-type") || value === "inherit") continue;
        expect(allowed.some((re) => re.test(value)), `${sel}: font: ${value}`).toBe(true);
      }
    }
  });
  it("no size outside the scale is set on its own (font-size), except the coach's own text shown in a font", () => {
    const sizes = RULES.flatMap(([sel, body]) => [...body.matchAll(/font-size:\s*(\d+)px/g)].map((m) => [sel, Number(m[1])] as const));
    for (const [sel] of sizes) expect(sel, sel).toMatch(/font-chip|font-sample|font-button > span:last-child/);
  });
});

describe("4.1 panel grid and 4.2 spacing scale", () => {
  it("one panel padding token, used by the panel header, the body, the help box and the Done panel", () => {
    expect(EDITOR_CSS).toContain("--fmo-panel-pad: 16px;");
    for (const sel of [".fmo-panel-head", ".fmo-panel-body", ".fmo-done-inner"]) expect(RULES.find(([s]) => s === sel)?.[1], sel).toContain("var(--fmo-panel-pad)");
    expect(RULES.find(([s]) => s === ".fmo-help")?.[1]).toContain("var(--fmo-panel-pad)");
  });
  it("the body's end padding gives back the measured gutter, so content ends at 16 whether or not it scrolls (R4)", () => {
    const body = RULES.find(([s]) => s === ".fmo-panel-body")![1];
    expect(body).toContain("calc(var(--fmo-panel-pad) - var(--fmo-gutter))");
    expect(body).toContain("scrollbar-gutter: stable");
  });
  it("vertical margins and gaps between blocks are on the scale 4, 8, 12, 16, 24", () => {
    const scale = new Set([0, 4, 8, 12, 16, 24]);
    for (const [sel, body] of RULES) {
      for (const m of body.matchAll(/(?:^|;)\s*(margin-top|margin-bottom|row-gap)\s*:\s*(-?\d+)px/g)) expect(scale.has(Math.abs(Number(m[2]))), `${sel} ${m[1]}: ${m[2]}`).toBe(true);
    }
  });
  it("a header icon button keeps 44 px and its icon ends on the content edge (-10 px)", () => {
    expect(RULES.find(([s]) => s === ".fmo-icon-btn")?.[1]).toMatch(/width: 44px; height: 44px/);
    expect(EDITOR_CSS).toContain(".fmo-panel-head > :last-child:not(.fmo-panel-title) { margin-inline-end: -10px; }");
  });
});

describe("4.8 native controls (R3)", () => {
  it("rows wrap on wide and short layouts; on a phone they scroll with no bar and an end fade", () => {
    expect(EDITOR_CSS).toMatch(/\.fmo-editor:is\(\[data-layout="wide"\], \[data-layout="short"\]\) \.fmo-scroll-row[^{]*\{[^}]*flex-wrap: wrap; overflow: visible/);
    expect(RULES.find(([s]) => s === ".fmo-scroll-row")?.[1]).toContain("scrollbar-width: none");
    expect(EDITOR_CSS).toContain('.fmo-scroll-row[data-more="true"]');
  });
  it("whether a row has more at its end", () => {
    expect(rowHasMore({ scrollLeft: 0, scrollWidth: 805, clientWidth: 299 })).toBe(true);
    expect(rowHasMore({ scrollLeft: 506, scrollWidth: 805, clientWidth: 299 })).toBe(false);
    expect(rowHasMore({ scrollLeft: -100, scrollWidth: 805, clientWidth: 299 })).toBe(true); // right to left
    expect(rowHasMore({ scrollLeft: 0, scrollWidth: 300, clientWidth: 299 })).toBe(false);
  });
  it("the gutter is what the bar takes, within 0 to the panel padding", () => {
    expect(gutterWidth({ offsetWidth: 360, clientWidth: 352 })).toBe(8);
    expect(gutterWidth({ offsetWidth: 360, clientWidth: 360 })).toBe(0);
    expect(gutterWidth({ offsetWidth: 360, clientWidth: 300 })).toBe(16);
  });
});

describe("R1: the start card and the first tap on the shirt", () => {
  const tools = ["design", "colours", "team", "players", "logos", "text"] as const;
  it("a tap on an item while the card is open closes it as Skip and opens the item's tool", () => {
    expect(modelTapAction({ startCard: true, itemTool: "players", activeTool: null, tools })).toEqual({ closeStartCard: true, openTool: "players" });
  });
  it("a tap on empty stage (turning, zooming) leaves the card open", () => {
    expect(modelTapAction({ startCard: true, itemTool: null, activeTool: null, tools })).toEqual({ closeStartCard: false, openTool: null });
  });
  it("without the card: the item's tool opens unless it is open already", () => {
    expect(modelTapAction({ startCard: false, itemTool: "logos", activeTool: "colours", tools })).toEqual({ closeStartCard: false, openTool: "logos" });
    expect(modelTapAction({ startCard: false, itemTool: "logos", activeTool: "logos", tools })).toEqual({ closeStartCard: false, openTool: null });
  });
});

describe("R19: font names in the coach's words", () => {
  it("the family only, never the catalogue's notes", () => {
    for (const f of loadPlaceholderFonts().fonts) expect(fontDisplayName(f)).not.toContain("(");
    expect(fontDisplayName({ family: "Graduate", name: "Graduate (varsity numbers)" })).toBe("Graduate");
  });
});

describe("R5, R7: the start card's pick order on the swatch", () => {
  it("a picked swatch carries its number, hidden from assistive technology (its name says the role)", () => {
    const html = renderToStaticMarkup(<Swatch hex="#C8102E" label="Red, Main" selected badge="1" onPick={() => undefined} />);
    expect(html).toContain('aria-label="Red, Main"');
    expect(html).toMatch(/<span class="fmo-swatch-order" aria-hidden="true">1<\/span>/);
  });
});
