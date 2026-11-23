/**
 * The product pictures page (`?pictures=1`, demo only; not in the library's bundle). It renders each of our garments
 * from its own 3D model, with the designer's lights and fabric, without the body, straight from the front and from
 * the back, and gives each picture as a 1200 x 1200 WebP with a transparent background.
 *
 * Every picture is one design (a template of the product in two team colours, no team name, a sample player on the
 * back) so the set reads as one kit. The camera is the editor's own front and back view. Each render is made large
 * (1800 CSS px), cropped by what is not transparent, and placed with one scale for the whole set (pictures-layout.ts).
 *
 * The page puts the results in `window.__pictures` (a list of { name, bytes, quality, dataUrl }) and shows them with
 * download links. The command in the README (scripts/render-pictures.mjs) drives it in a headless Chrome.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource/oswald/700.css";
import "@fontsource/graduate/400.css";
import "@fontsource/noto-sans-arabic/700.css";
import {
  DesignCanvas,
  EDITOR_WORDING,
  applyTemplate,
  createDesign,
  fontsReady,
  validateFontCatalog,
  validatePalette,
  validateProductDefinition,
  validateTemplate,
  type DesignCanvasHandle,
  type DesignDocument,
  type FontCatalog,
  type FontStatus,
  type Palette,
  type ProductDefinition,
} from "../src";
import { PICTURE_GARMENTS, PICTURE_MAX_BYTES, PICTURE_SIZE, alphaBox, layoutPictures, pictureFileName, qualitySteps, type Box, type PictureGarment, type PictureSide } from "./pictures-layout";

/** The render's edge in CSS pixels; the browser's device pixel ratio makes it larger still. */
const RENDER = 1800;
/** The two team colours of the kit (palette ids): Main on the body, Second on the panels, collar and lettering. */
const KIT = { main: "placeholder-navy", second: "placeholder-white" } as const;
const SAMPLE = { name: "PLAYER", number: "10" } as const;

export interface RenderedPicture {
  name: string;
  bytes: number;
  quality: number;
  dataUrl: string;
}

declare global {
  interface Window {
    __pictures?: RenderedPicture[];
    __picturesError?: string;
  }
}

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return response.json() as Promise<unknown>;
}

interface Kit {
  garment: PictureGarment;
  product: ProductDefinition;
  design: DesignDocument;
}

/** The kit's design for one garment: the chosen template, in the two colours, no team name, a sample player. */
async function loadKit(garment: PictureGarment, palette: Palette, fonts: FontCatalog): Promise<Kit> {
  const checked = validateProductDefinition(await fetchJson(`/products/${garment.productId}.json`));
  if (!checked.ok) throw new Error(`product ${garment.productId}: ${checked.errors.map((e) => e.message).join("; ")}`);
  const product = checked.value;
  const colour = (id: string) => {
    const found = palette.colors.find((c) => c.id === id);
    if (!found) throw new Error(`the palette has no colour ${id}`);
    return { id: found.id, hex: found.hex };
  };
  const base = createDesign(product, { teamColors: { main: colour(KIT.main), second: colour(KIT.second) }, teamName: "", samplePlayer: SAMPLE });
  const tpl = validateTemplate(await fetchJson(`/templates/${garment.productId}/${garment.template}.json`), { product, fonts });
  if (!tpl.ok) throw new Error(`template ${garment.template}: ${tpl.errors.map((e) => e.message).join("; ")}`);
  return { garment, product, design: applyTemplate(base, tpl.value, { product, fonts }) };
}

const frames = (n: number) =>
  new Promise<void>((resolve) => {
    const step = (left: number) => (left <= 0 ? resolve() : requestAnimationFrame(() => step(left - 1)));
    step(n);
  });

/** The WebP of a canvas at the best quality that fits the size limit. */
async function encodeWebp(canvas: HTMLCanvasElement): Promise<{ blob: Blob; quality: number }> {
  let smallest = Infinity;
  for (const quality of qualitySteps()) {
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", quality));
    if (!blob || blob.type !== "image/webp") throw new Error("this browser cannot encode WebP");
    smallest = blob.size;
    if (blob.size <= PICTURE_MAX_BYTES) return { blob, quality };
  }
  throw new Error(`the picture is over ${PICTURE_MAX_BYTES} bytes even at the lowest quality (${smallest})`);
}

const toDataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });

/** One render: the WebGL canvas's pixels, copied at once (the page keeps the drawing buffer), with the box of the garment in them. */
interface Shot {
  name: string;
  copy: HTMLCanvasElement;
  box: Box;
}

function grab(stage: HTMLElement, name: string): Shot {
  const gl = stage.querySelector("canvas");
  if (!gl) throw new Error("no canvas on the stage");
  const copy = document.createElement("canvas");
  copy.width = gl.width;
  copy.height = gl.height;
  const ctx = copy.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("no 2D canvas");
  ctx.drawImage(gl, 0, 0);
  const box = alphaBox(ctx.getImageData(0, 0, copy.width, copy.height).data, copy.width, copy.height);
  if (!box) throw new Error(`${name}: the render is empty`);
  const margin = 4;
  if (box.left < margin || box.top < margin || box.right > copy.width - margin || box.bottom > copy.height - margin) {
    throw new Error(`${name}: the garment touches the render's edge (${JSON.stringify(box)} in ${copy.width} px)`);
  }
  return { name, copy, box };
}

function PicturesPage() {
  const stage = useRef<HTMLDivElement>(null);
  const handle = useRef<DesignCanvasHandle>(null);
  const [kits, setKits] = useState<Kit[] | null>(null);
  const [fonts, setFonts] = useState<FontCatalog | null>(null);
  const [current, setCurrent] = useState(0);
  const [results, setResults] = useState<RenderedPicture[]>([]);
  const [status, setStatus] = useState("Loading the garments...");
  const shots = useRef<Shot[]>([]);
  const fontStatus = useRef<FontStatus | null>(null);
  const drawn = useRef(0);
  const modelReady = useRef(false);

  const fail = useCallback((e: unknown) => {
    const text = e instanceof Error ? e.message : String(e);
    window.__picturesError = text;
    setStatus(`Failed: ${text}`);
    console.error("[pictures]", text);
  }, []);

  useEffect(() => {
    Promise.all([fetchJson("/palettes/placeholder-palette.json"), fetchJson("/fonts/placeholder-fonts.json")])
      .then(async ([paletteJson, fontsJson]) => {
        const palette = validatePalette(paletteJson);
        const catalogue = validateFontCatalog(fontsJson);
        if (!palette.ok) throw new Error(palette.errors.map((e) => e.message).join("; "));
        if (!catalogue.ok) throw new Error(catalogue.errors.map((e) => e.message).join("; "));
        setFonts(catalogue.value);
        setKits(await Promise.all(PICTURE_GARMENTS.map((g) => loadKit(g, palette.value, catalogue.value))));
      })
      .catch(fail);
  }, [fail]);

  /** Waits until the model is in, the fonts are in and the texture has been drawn, then a few frames more. */
  const settle = useCallback(async () => {
    const started = performance.now();
    await document.fonts.load("700 100px Oswald");
    await document.fonts.load("400 100px Graduate");
    while (!(modelReady.current && drawn.current > 0 && fontStatus.current && fontsReady(fontStatus.current))) {
      if (performance.now() - started > 60_000) throw new Error("timed out waiting for the model and the fonts");
      await frames(2);
    }
    await frames(8);
  }, []);

  // One garment at a time: front, then back; a new key remounts the canvas for the next garment.
  useEffect(() => {
    const kit = kits?.[current];
    if (!kits || !kit || !stage.current) return;
    let alive = true;
    void (async () => {
      try {
        setStatus(`Rendering ${kit.garment.name}...`);
        await settle();
        for (const side of ["front", "back"] as PictureSide[]) {
          handle.current?.showSide(side, { animate: false });
          await frames(10);
          if (!alive) return;
          shots.current.push(grab(stage.current!, pictureFileName(kit.garment.name, side)));
        }
        if (current + 1 < kits.length) {
          modelReady.current = false;
          drawn.current = 0;
          fontStatus.current = null;
          setCurrent(current + 1);
          return;
        }
        setStatus("Placing and encoding...");
        const source = shots.current[0]!.copy.width;
        const { placements } = layoutPictures(
          shots.current.map((s) => s.box),
          source,
        );
        const out: RenderedPicture[] = [];
        for (const [i, shot] of shots.current.entries()) {
          const p = placements[i]!;
          const canvas = document.createElement("canvas");
          canvas.width = PICTURE_SIZE;
          canvas.height = PICTURE_SIZE;
          const ctx = canvas.getContext("2d")!;
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = "high";
          ctx.drawImage(shot.copy, p.x, p.y, p.width, p.height);
          const { blob, quality } = await encodeWebp(canvas);
          out.push({ name: shot.name, bytes: blob.size, quality, dataUrl: await toDataUrl(blob) });
        }
        window.__pictures = out;
        setResults(out);
        setStatus("Done");
      } catch (e) {
        fail(e);
      }
    })();
    return () => {
      alive = false;
    };
  }, [kits, current, settle, fail]);

  const kit = kits?.[current];
  return (
    <div style={{ font: "14px system-ui, sans-serif", padding: 12 }}>
      <p data-testid="pictures-status">{status}</p>
      {results.length > 0 && (
        <ul style={{ display: "flex", flexWrap: "wrap", gap: 12, listStyle: "none", padding: 0 }}>
          {results.map((r) => (
            <li key={r.name} style={{ background: "#F3F4F7", padding: 8 }}>
              <img src={r.dataUrl} alt={r.name} width={300} height={300} />
              <br />
              <a href={r.dataUrl} download={r.name}>
                {r.name}
              </a>{" "}
              ({Math.round(r.bytes / 1024)} KB)
            </li>
          ))}
        </ul>
      )}
      {/* The render surface: large, at the top left, behind the page's own text. */}
      <div ref={stage} style={{ position: "absolute", left: 0, top: 0, width: RENDER, height: RENDER, zIndex: -1, pointerEvents: "none" }} data-testid="pictures-stage">
        {kit && fonts && (
          <DesignCanvas
            key={kit.garment.productId}
            ref={handle}
            design={kit.design}
            product={kit.product}
            showBody={false}
            reducedMotion
            textureSize={4096}
            style={{ background: "transparent", minHeight: 0 }}
            onModelReady={() => {
              modelReady.current = true;
            }}
            onTextureDrawn={() => {
              drawn.current += 1;
            }}
            onFontStatus={(s) => {
              fontStatus.current = s;
            }}
            onError={fail}
            errorFallback={<p>{EDITOR_WORDING.states.failed}</p>}
          />
        )}
      </div>
    </div>
  );
}

/** Keeps the 3D canvas's pixels after a frame, so the page can copy them: only on this page. */
function keepDrawingBuffer() {
  const original = HTMLCanvasElement.prototype.getContext as (this: HTMLCanvasElement, type: string, attributes?: unknown) => RenderingContext | null;
  HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, attributes?: unknown) {
    if (type === "webgl" || type === "webgl2") return original.call(this, type, { ...(attributes as object), preserveDrawingBuffer: true });
    return original.call(this, type, attributes);
  } as typeof HTMLCanvasElement.prototype.getContext;
}

export function mountPicturesPage(container: HTMLElement) {
  keepDrawingBuffer();
  createRoot(container).render(<PicturesPage />);
}
