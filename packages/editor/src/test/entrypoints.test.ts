import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const srcDir = resolve(import.meta.dirname, "..");

/** Bare (package) imports reached from a source file, following relative imports. */
function externalImports(file: string, seen = new Set<string>(), found = new Set<string>()): Set<string> {
  if (seen.has(file)) return found;
  seen.add(file);
  const source = readFileSync(file, "utf8");
  for (const match of source.matchAll(/(?:\bfrom\s*|\bimport\s*\(?\s*)["']([^"']+)["']/g)) {
    const spec = match[1]!;
    if (spec.startsWith(".")) {
      const base = resolve(dirname(file), spec);
      const candidates = [`${base}.ts`, `${base}.tsx`, resolve(base, "index.ts")];
      const target = candidates.find((c) => {
        try {
          readFileSync(c);
          return true;
        } catch {
          return false;
        }
      });
      if (target) externalImports(target, seen, found);
    } else {
      found.add(spec);
    }
  }
  return found;
}

describe("the design entry point (@fitmyoutfit/editor/design)", () => {
  it("imports only zod: no React, no Three.js, no Node or DOM modules", () => {
    const found = [...externalImports(resolve(srcDir, "design/index.ts"))];
    expect(found).toEqual(["zod"]);
  });

  it("has no test or fixture files that the build would pick up", () => {
    const files = readdirSync(resolve(srcDir, "design"));
    expect(files.filter((f) => f.includes("fixtures"))).toEqual([]);
  });
});

describe("the package is standalone", () => {
  it("never imports Medusa or Next.js", () => {
    const pkg = JSON.parse(readFileSync(resolve(srcDir, "../package.json"), "utf8")) as Record<string, Record<string, string>>;
    const names = [
      ...Object.keys(pkg.dependencies ?? {}),
      ...Object.keys(pkg.peerDependencies ?? {}),
      ...Object.keys(pkg.devDependencies ?? {}),
    ];
    expect(names.filter((n) => /medusa|^next$|^next\//.test(n))).toEqual([]);
    const found = [...externalImports(resolve(srcDir, "index.ts"))];
    expect(found.filter((n) => /medusa|^next($|\/)/.test(n))).toEqual([]);
  });
});

describe("server safety", () => {
  it("can be imported where there is no window or document", { timeout: 60_000 }, async () => {
    expect(typeof window).toBe("undefined");
    expect(typeof document).toBe("undefined");
    const editor = await import("../index");
    expect(typeof editor.DesignCanvas).toBe("function");
    expect(typeof editor.createDesign).toBe("function");
    const design = await import("../design");
    expect(typeof design.validateDesign).toBe("function");
  });
});
