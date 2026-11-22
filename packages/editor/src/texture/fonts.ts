/**
 * Fonts for drawing text and number layers: the CSS font string a layer is
 * drawn with, and a watcher that makes sure a font that is not loaded yet
 * does not leave the text in a fallback font: it asks the browser to load
 * every face the text needs and calls back when they arrive (or fail), so
 * the caller redraws and can say what is still missing. Plain code over a
 * minimal `FontSetLike` (the browser's `document.fonts` satisfies it), so it
 * is tested without a browser.
 *
 * A layer's font stack is its font, then the font's `fallbackFontIds` in
 * order, then the generic `sans-serif` as the last resort.
 */
import { drawnText } from "../design/letter-case.js";
import type { DesignDocument, FontRef, Layer } from "../design/schema.js";

type TextLike = Extract<Layer, { kind: "text" | "number" }>;

/** The fonts tried for a layer, in order: its own, then its fallbacks. Unknown ids are skipped. */
export function fontStack(design: DesignDocument, fontId: string): FontRef[] {
  const byId = new Map(design.fonts.map((f) => [f.id, f]));
  const own = byId.get(fontId);
  if (!own) return [];
  const stack = [own];
  for (const id of own.fallbackFontIds ?? []) {
    const fallback = byId.get(id);
    if (fallback && !stack.includes(fallback)) stack.push(fallback);
  }
  return stack;
}

/** A family name quoted for CSS. The format forbids quotes and backslashes in family names, so this is safe. */
export function quoteFamily(family: string): string {
  return `"${family}"`;
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/**
 * The CSS font shorthand for drawing a layer, with the size in the drawing's
 * units (piece millimetres, since the texture draws in a mm transform):
 * `normal 700 60px "Oswald", "Noto Sans Arabic", sans-serif`. Weight and
 * style come from the layer's own font.
 */
export function layerFont(design: DesignDocument, layer: TextLike, size: number = layer.fontSize): string {
  const stack = fontStack(design, layer.fontId);
  const own = stack[0];
  const families = [...stack.map((f) => quoteFamily(f.family)), "sans-serif"].join(", ");
  return `${own?.style ?? "normal"} ${own?.weight ?? 400} ${round(size)}px ${families}`;
}

/** What the browser must load for one family of one layer: a font string with one family, and the text. */
export interface FontRequest {
  family: string;
  /** CSS font shorthand with this family only, at a nominal size (16px): what `FontFaceSet.load` takes. */
  font: string;
  /** The characters to load faces for (font files are split by Unicode range). */
  text: string;
}

const requestKey = (r: FontRequest) => `${r.font}|${r.text}`;

/**
 * Everything the browser must load to draw the design's text and number
 * layers: per layer, each family of its stack with the layer's characters.
 * The same family and characters are listed once.
 */
export function fontRequests(design: DesignDocument): FontRequest[] {
  const out = new Map<string, FontRequest>();
  for (const layer of design.layers) {
    if (layer.kind !== "text" && layer.kind !== "number") continue;
    const chars = [...new Set(layer.kind === "text" ? drawnText(layer) : layer.value)].sort().join("");
    for (const font of fontStack(design, layer.fontId)) {
      const request = { family: font.family, font: `${font.style ?? "normal"} ${font.weight ?? 400} 16px ${quoteFamily(font.family)}`, text: chars };
      out.set(requestKey(request), request);
    }
  }
  return [...out.values()];
}

/** The parts of the browser's `FontFaceSet` (`document.fonts`) the watcher uses. */
export interface FontSetLike {
  load(font: string, text?: string): Promise<unknown[]>;
  /** Visits every font face known to the document, including those declared in CSS. */
  forEach(callback: (face: { family: string }) => void): void;
}

export interface FontStatus {
  /** Families still loading: the text may show in a fallback font until they arrive. */
  loading: string[];
  /** Families no font face is declared for: the text is drawn in a fallback font. The host must provide them. */
  missing: string[];
  /** Families whose files failed to load. */
  failed: string[];
}

export const FONTS_READY: FontStatus = Object.freeze({ loading: [], missing: [], failed: [] }) as FontStatus;

/** True when nothing is loading, missing or failed. */
export function fontsReady(status: FontStatus): boolean {
  return status.loading.length === 0 && status.missing.length === 0 && status.failed.length === 0;
}

/** Family names as CSS declares them may carry quotes. */
function bareFamily(family: string): string {
  return family.replace(/^["']|["']$/g, "").trim();
}

/**
 * Loads the faces a design needs and calls `onChange` whenever some arrive
 * (or fail), so the caller redraws with the real font. Each request is
 * loaded once; asking again for the same text costs nothing.
 */
export class FontWatcher {
  private readonly state = new Map<string, "loading" | "loaded" | "failed">();
  private current: FontRequest[] = [];
  private disposed = false;

  constructor(
    private readonly fonts: FontSetLike,
    private readonly onChange: (status: FontStatus) => void,
  ) {}

  /** Starts loading what the design needs and returns the status right now. Later changes go to `onChange`. */
  watch(design: DesignDocument): FontStatus {
    this.current = fontRequests(design);
    for (const request of this.current) {
      const key = requestKey(request);
      if (this.state.has(key)) continue;
      this.state.set(key, "loading");
      let settled: Promise<unknown>;
      try {
        settled = Promise.resolve(this.fonts.load(request.font, request.text));
      } catch (error) {
        settled = Promise.reject(error);
      }
      settled.then(
        () => this.finish(key, "loaded"),
        () => this.finish(key, "failed"),
      );
    }
    return this.status();
  }

  private finish(key: string, result: "loaded" | "failed"): void {
    this.state.set(key, result);
    if (!this.disposed) this.onChange(this.status());
  }

  /** The status of the fonts the last watched design needs. */
  status(): FontStatus {
    const declared = new Set<string>();
    this.fonts.forEach((face) => declared.add(bareFamily(face.family)));
    const loading = new Set<string>();
    const missing = new Set<string>();
    const failed = new Set<string>();
    for (const request of this.current) {
      const state = this.state.get(requestKey(request));
      if (!declared.has(request.family)) missing.add(request.family);
      else if (state === "loading") loading.add(request.family);
      else if (state === "failed") failed.add(request.family);
    }
    return { loading: [...loading], missing: [...missing], failed: [...failed] };
  }

  /** Stops calling back. */
  dispose(): void {
    this.disposed = true;
  }
}

/**
 * Waits until every font the design needs has loaded or failed, for a
 * caller that must not draw with a fallback (a proof render, later).
 */
export async function loadDesignFonts(fonts: FontSetLike, design: DesignDocument): Promise<FontStatus> {
  return new Promise((resolve) => {
    let watcher: FontWatcher | null = null;
    const check = (status: FontStatus) => {
      if (status.loading.length === 0) {
        watcher?.dispose();
        resolve(status);
      }
    };
    watcher = new FontWatcher(fonts, check);
    check(watcher.watch(design));
  });
}
