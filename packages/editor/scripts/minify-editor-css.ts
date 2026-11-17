import type { Plugin } from "vite";

// A build step for the editor's stylesheet string (src/ui/styles.ts, EDITOR_CSS): its comments and indentation
// are for whoever reads the source, not for every visitor's download (E3d: about 2 KB gzipped of the demo route).
// Only comments and whitespace go: runs of whitespace become one space, and spaces next to "{", "}" and ";" go.
// A space before ":" is kept (".fmo-editor :focus-visible" is a descendant selector), and so is every space
// inside calc() and the like. Used by vite.demo.config.ts and vite.lib.config.ts.

/** The stylesheet with its comments and needless whitespace taken out. */
export function minifyCss(css: string): string {
  return css
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\s+/g, " ")
    .replace(/\s*([{};])\s*/g, "$1")
    .trim();
}

/** The module's code with its EDITOR_CSS template string minified, or null for any other module. */
export function transformEditorCss(code: string, id: string): string | null {
  if (!id.replace(/\\/g, "/").endsWith("/src/ui/styles.ts")) return null;
  const out = code.replace(/(export const EDITOR_CSS = \/\* css \*\/ `)([\s\S]*?)(`;)/, (_: string, open: string, css: string, close: string) => {
    if (css.includes("${")) throw new Error("minify-editor-css: the stylesheet has an interpolation; keep it a plain string");
    return open + minifyCss(css) + close;
  });
  return out === code ? null : out;
}

/** A Vite plugin: the EDITOR_CSS template string in src/ui/styles.ts, minified when the module is built. */
export function minifyEditorCss(): Plugin {
  return {
    name: "fmo-minify-editor-css",
    // Before the TypeScript transform, which drops the "/* css */" marker the match relies on.
    enforce: "pre",
    transform(code: string, id: string) {
      const out = transformEditorCss(code, id);
      return out === null ? null : { code: out, map: null };
    },
  };
}
