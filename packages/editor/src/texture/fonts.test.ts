import { describe, expect, it } from "vitest";
import { FontWatcher, fontRequests, fontStack, fontsReady, layerFont, loadDesignFonts, type FontSetLike, type FontStatus } from "./fonts";
import { createDesign } from "../design/create";
import { addCatalogFont } from "../design/font-catalog";
import { addFont, addLayer, updateLayer } from "../design/edit";
import type { DesignDocument, Layer } from "../design/schema";
import { loadPlaceholderFonts, loadPlaceholderProduct, RED } from "../test/fixtures";

const product = loadPlaceholderProduct();
const catalog = loadPlaceholderFonts();

function name(value: string, fontId = "oswald-700"): Layer {
  return {
    id: "name",
    kind: "text",
    pieceId: "back",
    position: { x: 280, y: 150 },
    size: { width: 400, height: 80 },
    rotation: 0,
    value,
    direction: "auto",
    fontId,
    fontSize: 60,
    fill: RED,
    align: "center",
  };
}

const withFonts = addCatalogFont(createDesign(product), catalog, "oswald-700");

describe("font strings", () => {
  it("a layer's stack is its font, then its fallbacks, then sans-serif", () => {
    const layer = name("Ali علي");
    expect(fontStack(withFonts, "oswald-700").map((f) => f.family)).toEqual(["Oswald", "Noto Sans Arabic"]);
    expect(layerFont(withFonts, layer as never)).toBe('normal 700 60px "Oswald", "Noto Sans Arabic", sans-serif');
    expect(layerFont(withFonts, layer as never, 12.34567)).toBe('normal 700 12.346px "Oswald", "Noto Sans Arabic", sans-serif');
  });

  it("a font without weight or style draws at 400 normal; an unknown font has an empty stack", () => {
    const design = addFont(createDesign(product), { id: "plain", family: "Plain Font" });
    expect(layerFont(design, name("x", "plain") as never)).toBe('normal 400 60px "Plain Font", sans-serif');
    expect(fontStack(design, "nope")).toEqual([]);
  });

  it("requests list each family of each text layer once, with the characters to load", () => {
    let design = addLayer(withFonts, name("ALI علي"), { product });
    design = addLayer(design, { ...name("ALI"), id: "second" }, { product });
    expect(fontRequests(design)).toEqual([
      { family: "Oswald", font: 'normal 700 16px "Oswald"', text: " AILعلي" },
      { family: "Noto Sans Arabic", font: 'normal 700 16px "Noto Sans Arabic"', text: " AILعلي" },
      { family: "Oswald", font: 'normal 700 16px "Oswald"', text: "AIL" },
      { family: "Noto Sans Arabic", font: 'normal 700 16px "Noto Sans Arabic"', text: "AIL" },
    ]);
    expect(fontRequests(createDesign(product))).toEqual([]);
  });
});

/** A fake document.fonts: loads stay pending until the test settles them. */
class FakeFonts implements FontSetLike {
  readonly loads: Array<{ font: string; text?: string; resolve: () => void; reject: () => void }> = [];
  constructor(private readonly families: string[]) {}
  load(font: string, text?: string): Promise<unknown[]> {
    return new Promise((resolve, reject) => {
      this.loads.push({ font, text, resolve: () => resolve([]), reject: () => reject(new Error("network")) });
    });
  }
  forEach(callback: (face: { family: string }) => void): void {
    // CSS-declared faces report the family with quotes, as browsers do.
    this.families.forEach((family) => callback({ family: `"${family}"` }));
  }
}

const tick = () => new Promise((r) => setTimeout(r, 0));

describe("FontWatcher: text is redrawn when its font arrives, never left in a fallback silently", () => {
  const design: DesignDocument = addLayer(withFonts, name("محمد علی"), { product });

  it("reports loading, then calls back once the faces have loaded", async () => {
    const fonts = new FakeFonts(["Oswald", "Noto Sans Arabic"]);
    const changes: FontStatus[] = [];
    const watcher = new FontWatcher(fonts, (s) => changes.push(s));
    expect(watcher.watch(design)).toEqual({ loading: ["Oswald", "Noto Sans Arabic"], missing: [], failed: [] });
    expect(fonts.loads.map((l) => l.font)).toEqual(['normal 700 16px "Oswald"', 'normal 700 16px "Noto Sans Arabic"']);
    await tick();
    expect(changes).toEqual([]); // nothing arrived yet: no redraw
    fonts.loads[1]!.resolve();
    await tick();
    expect(changes).toEqual([{ loading: ["Oswald"], missing: [], failed: [] }]);
    fonts.loads[0]!.resolve();
    await tick();
    expect(changes[1]).toEqual({ loading: [], missing: [], failed: [] });
    expect(fontsReady(changes[1]!)).toBe(true);
  });

  it("loads each request once, and again only for new characters", async () => {
    const fonts = new FakeFonts(["Oswald", "Noto Sans Arabic"]);
    const watcher = new FontWatcher(fonts, () => {});
    watcher.watch(design);
    watcher.watch(design);
    expect(fonts.loads).toHaveLength(2);
    watcher.watch(updateLayer(design, "name", { value: "محمد علی خان" }));
    expect(fonts.loads).toHaveLength(4);
  });

  it("names a family no face is declared for (the host forgot to load it)", () => {
    const fonts = new FakeFonts(["Oswald"]);
    const watcher = new FontWatcher(fonts, () => {});
    expect(watcher.watch(design).missing).toEqual(["Noto Sans Arabic"]);
  });

  it("names a family whose files failed to load, and still calls back so the view can say so", async () => {
    const fonts = new FakeFonts(["Oswald", "Noto Sans Arabic"]);
    const changes: FontStatus[] = [];
    const watcher = new FontWatcher(fonts, (s) => changes.push(s));
    watcher.watch(design);
    fonts.loads[0]!.resolve();
    fonts.loads[1]!.reject();
    await tick();
    expect(changes[changes.length - 1]).toEqual({ loading: [], missing: [], failed: ["Noto Sans Arabic"] });
  });

  it("copes with a load() that throws instead of rejecting", async () => {
    const fonts: FontSetLike = { load: () => { throw new Error("bad font string"); }, forEach: (cb) => cb({ family: "Oswald" }) };
    const changes: FontStatus[] = [];
    new FontWatcher(fonts, (s) => changes.push(s)).watch(addLayer(addFont(createDesign(product), { id: "o", family: "Oswald" }), name("A", "o"), { product }));
    await tick();
    expect(changes[0]).toEqual({ loading: [], missing: [], failed: ["Oswald"] });
  });

  it("stops calling back after dispose", async () => {
    const fonts = new FakeFonts(["Oswald", "Noto Sans Arabic"]);
    const changes: FontStatus[] = [];
    const watcher = new FontWatcher(fonts, (s) => changes.push(s));
    watcher.watch(design);
    watcher.dispose();
    fonts.loads.forEach((l) => l.resolve());
    await tick();
    expect(changes).toEqual([]);
  });

  it("loadDesignFonts waits until nothing is loading (for proof renders)", async () => {
    const fonts = new FakeFonts(["Oswald", "Noto Sans Arabic"]);
    let done: FontStatus | null = null;
    void loadDesignFonts(fonts, design).then((s) => (done = s));
    await tick();
    expect(done).toBeNull();
    fonts.loads.forEach((l) => l.resolve());
    await tick();
    expect(done).toEqual({ loading: [], missing: [], failed: [] });
    // A design without text is ready at once.
    expect(await loadDesignFonts(fonts, withFonts)).toEqual({ loading: [], missing: [], failed: [] });
  });
});
