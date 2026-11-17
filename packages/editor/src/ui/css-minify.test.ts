/** E3d: the build step that takes the comments and needless whitespace out of the editor's stylesheet string. */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { minifyCss, transformEditorCss } from "../../scripts/minify-editor-css";
import { EDITOR_CSS } from "./styles";

describe("minifyCss", () => {
  it("drops comments and whitespace, keeps descendant spaces and calc()", () => {
    expect(minifyCss("/* a */ .fmo-editor :focus-visible {\n  outline: 2px solid red;\n}\n.x { height: calc(100dvh - 56px); }")).toBe(".fmo-editor :focus-visible{outline: 2px solid red;}.x{height: calc(100dvh - 56px);}");
  });
  it("the plugin rewrites only styles.ts, and keeps every rule (same rules, fewer bytes)", () => {
    const file = resolve(import.meta.dirname, "styles.ts");
    const code = readFileSync(file, "utf8");
    const out = transformEditorCss(code, file);
    expect(out).not.toBeNull();
    expect(out!.length).toBeLessThan(code.length - 4000);
    const css = (text: string) => text.slice(text.indexOf("/* css */ `") + 11, text.lastIndexOf("`"));
    expect(css(out!)).not.toContain("/*");
    const rules = (text: string) => (minifyCss(text).match(/\{/g) ?? []).length;
    expect(rules(css(out!))).toBe(rules(css(code)));
    expect(transformEditorCss("export const x = 1;", "/a/b.ts")).toBeNull();
    expect(EDITOR_CSS.length).toBeGreaterThan(0);
  });
});
