/**
 * E3d: the rules of docs/design/07-editor-review.md section 4 that the stylesheet itself can be held to (the page
 * audits in scripts/audit measure the rest in a browser). Each fails when a rule is broken by a new CSS rule.
 */
import { describe, expect, it } from "vitest";
import { EDITOR_CSS } from "./styles";

/** Every rule of the stylesheet as [selector, declarations], at any depth (inside @media and @supports too). */
function rules(css: string): [string, string][] {
  const out: [string, string][] = [];
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const re = /([^{}]+)\{([^{}]*)\}/g;
  for (const m of clean.matchAll(re)) out.push([m[1]!.trim(), m[2]!.trim()]);
  return out;
}
const all = rules(EDITOR_CSS);
const decl = (body: string, prop: string) => [...body.matchAll(new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*([^;]+)`, "g"))].map((m) => m[1]!.trim());

describe("4.3 type tokens", () => {
  it("defines the section's tokens with their values", () => {
    const tokens: Record<string, string> = {
      "panel-title": "700 20px/26px var(--fmo-font-heading)",
      "panel-title-wide": "700 22px/28px var(--fmo-font-heading)",
      section: "700 15px/20px var(--fmo-font-body)",
      label: "600 14px/20px var(--fmo-font-body)",
      body: "400 15px/21px var(--fmo-font-body)",
      button: "600 15px/20px var(--fmo-font-body)",
      primary: "700 18px/18px var(--fmo-font-heading)",
      tab: "500 14px/20px var(--fmo-font-body)",
      small: "400 13px/18px var(--fmo-font-body)",
      credit: "400 11px/16px var(--fmo-font-body)",
    };
    for (const [name, value] of Object.entries(tokens)) expect(EDITOR_CSS, name).toContain(`--fmo-type-${name}: ${value};`);
  });

  it("every font a rule sets is a token, but for these named exceptions", () => {
    // The root faces (editor, Done panel, dialogs), the brand, small marks over swatches and counts, the step
    // number, the 16 px field (no zoom on iOS) and code in the colour match.
    const allowed = new Map([
      [".fmo-editor", "400 15px/1.4 var(--fmo-font-body)"],
      [".fmo-topbar-brand", "700 20px/1 var(--fmo-font-heading)"],
      [".fmo-topbar-brand small", "500 14px/1 var(--fmo-font-body)"],
      [".fmo-kit-count", "600 12px/20px var(--fmo-font-body)"],
      [".fmo-done-panel", "400 15px/1.4 var(--fmo-font-body)"],
      [".fmo-step-n", "600 13px/24px var(--fmo-font-body)"],
      [".fmo-swatch-order", "600 12px/20px var(--fmo-font-body)"],
      [".fmo-field", "400 16px/1.2 var(--fmo-font-body)"],
      [".fmo-match-col code", "500 13px/1 ui-monospace, Menlo, Consolas, monospace"],
      [".fmo-dialog", "400 15px/1.4 var(--fmo-font-body)"],
    ]);
    const raw: string[] = [];
    for (const [selector, body] of all)
      for (const value of decl(body, "font")) {
        if (/^var\(--fmo-type-[\w-]+\)$/.test(value) || value === "inherit") continue;
        if (allowed.get(selector) === value) continue;
        raw.push(`${selector} { font: ${value} }`);
      }
    expect(raw).toEqual([]);
  });

  it("4.4: the element reset never outranks a component class (:where)", () => {
    expect(EDITOR_CSS).toContain(":where(.fmo-editor, .fmo-done-panel, .fmo-dialog) button { font: inherit; color: inherit; }");
    expect(EDITOR_CSS).not.toMatch(/(^|\n)\.fmo-editor button \{/);
  });
});

describe("4.1 panel grid", () => {
  it("one padding token, 16 px, for the header, the body, the help box and the Done panel", () => {
    expect(EDITOR_CSS).toContain("--fmo-panel-pad: 16px;");
    const body = (selector: string) => all.filter(([s]) => s === selector).map(([, b]) => b).join(";");
    expect(body(".fmo-panel-head")).toContain("padding: 0 var(--fmo-panel-pad)");
    expect(body(".fmo-panel-body")).toContain("var(--fmo-panel-pad)");
    expect(body(".fmo-done-inner")).toContain("var(--fmo-panel-pad)");
    expect(body(".fmo-help")).toContain("var(--fmo-panel-pad)");
    // The tablet header shares the content's 560 px column.
    expect(body(".fmo-panel-head")).toContain("max-width: calc(560px + 2 * var(--fmo-panel-pad))");
    expect(body(".fmo-panel-inner")).toContain("max-width: 560px");
  });
  it("a field beside a text button shares its row (the button never ends past the content's edge)", () => {
    expect(EDITOR_CSS).toContain(".fmo-item-head > .fmo-field { flex: 1 1 auto; min-width: 0; width: auto; }");
  });
  it("the body's scrollbar gutter is stable and comes out of the end padding (content ends at -16 in every tool)", () => {
    const body = all.find(([s]) => s === ".fmo-panel-body")![1];
    expect(body).toContain("scrollbar-gutter: stable");
    expect(body).toContain("calc(var(--fmo-panel-pad) - var(--fmo-gutter))");
  });
});

describe("4.2 spacing scale", () => {
  it("the panels' margins and gaps are 4, 8, 12, 16 or 24 (or 0)", () => {
    const off: string[] = [];
    const scale = new Set(["0", "4px", "8px", "12px", "16px", "24px", "auto"]);
    for (const [selector, body] of all) {
      if (!/fmo-(stack|section|label|section-title|panel-inner|panel-body|item|alert|family|muted|line|field-error|start-picked|step-label)\b/.test(selector)) continue;
      for (const prop of ["margin-top", "margin-bottom", "gap", "row-gap"]) for (const v of decl(body, prop)) if (!scale.has(v)) off.push(`${selector} { ${prop}: ${v} }`);
      for (const v of decl(body, "margin")) for (const part of v.split(/\s+/)) if (!scale.has(part) && !part.startsWith("max(") && !part.startsWith("calc(")) off.push(`${selector} { margin: ${v} }`);
    }
    expect([...new Set(off)]).toEqual([]);
  });
});

describe("4.7 controls on the stage share one look", () => {
  it("96% surface, a 24% ink line and a soft shadow, on every floating control", () => {
    expect(EDITOR_CSS).toContain("--fmo-float-fill: rgb(255 255 255 / 0.96);");
    expect(EDITOR_CSS).toContain("--fmo-float-line: rgb(11 21 48 / 0.24);");
    expect(EDITOR_CSS).toContain("--fmo-float-shadow: 0 1px 3px rgb(11 21 48 / 0.12);");
    for (const selector of [".fmo-sides", ".fmo-view .fmo-round", ".fmo-kit-button", ".fmo-hint", ".fmo-turn-to"]) {
      const body = all.filter(([s]) => s === selector).map(([, b]) => b).join(";");
      expect(body, selector).toContain("var(--fmo-float-line)");
    }
  });
});

describe("4.8 native controls", () => {
  it("rows wrap on wide and landscape layouts; on phones they scroll with no bar and an end fade", () => {
    expect(EDITOR_CSS).toMatch(/\.fmo-editor:is\(\[data-layout="wide"\], \[data-layout="short"\]\) \.fmo-scroll-row[^{]*\{ flex-wrap: wrap; overflow: visible;/);
    expect(EDITOR_CSS).toContain(".fmo-scroll-row::-webkit-scrollbar { display: none; }");
    expect(EDITOR_CSS).toContain('.fmo-scroll-row[data-more="true"]');
  });
});
