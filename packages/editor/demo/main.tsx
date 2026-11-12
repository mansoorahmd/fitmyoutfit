import { StrictMode, useCallback, useEffect, useMemo, useRef, useState, type ComponentType } from "react";
import { createRoot } from "react-dom/client";
// The fonts of the placeholder catalogue (samples/fonts/placeholder-fonts.json), from their npm
// packages. The host application declares the faces; the editor waits for them before trusting text.
import "@fontsource/oswald/700.css";
import "@fontsource/graduate/400.css";
import "@fontsource/noto-sans-arabic/700.css";
import {
  DeviceDesignStore,
  DoneNotice,
  EDITOR_WORDING,
  EditorShell,
  ResumePrompt,
  applyTemplate,
  coloursCommonFirst,
  createAutosave,
  createDesign,
  createDeviceAssetStore,
  createMemoryKeyValueStore,
  designAssetIds,
  openIndexedDbStore,
  paletteColourRef,
  validateFontCatalog,
  validatePalette,
  validateProductDefinition,
  validateTemplate,
  watchOtherTabs,
  type Autosave,
  type DesignDocument,
  type DeviceAssetStore,
  type EditorTiming,
  type FontCatalog,
  type Palette,
  type ProductDefinition,
  type SaveState,
  type Template,
} from "../src";
import { chooseProduct, type DemoProduct } from "./products";
import type { EditorProps } from "./Editor";

interface DemoData {
  product: ProductDefinition;
  palette: Palette;
  fonts: FontCatalog;
  templates: Template[];
}

// The stand-in football jersey (see samples/models/stand-in-jersey.LICENSE.txt) by default; the stand-in
// T-shirt and the old script-generated placeholder by address: ?product=stand-in-tshirt, ?product=placeholder-jersey.
// The developer page (the engine's plain controls, the design JSON, the texture) only with ?dev=1.
const PARAMS = new URLSearchParams(window.location.search);
const DEV = PARAMS.get("dev") === "1";
const DEMO_PRODUCT = chooseProduct(window.location.search);
const PRODUCT_URL = `/products/${DEMO_PRODUCT.id}.json`;
// Placeholder colours, as data, NOT print-tested: the founders' print-tested palette replaces the file.
const PALETTE_URL = "/palettes/placeholder-palette.json";
const FONTS_URL = "/fonts/placeholder-fonts.json";
// The product's sample templates (samples/templates/<product>/index.json lists them); none for the placeholder.
const TEMPLATES_URL = `/templates/${DEMO_PRODUCT.id}`;

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return response.json() as Promise<unknown>;
}

/** Reads the placeholder palette file (validated as a palette). */
function readPalette(json: unknown, product: ProductDefinition): Palette {
  const palette = validatePalette(json);
  if (!palette.ok) throw new Error(palette.errors.map((e) => e.message).join("; "));
  if (palette.value.id !== product.palette.id) {
    throw new Error(`the palette file is "${palette.value.id}" but the product uses "${product.palette.id}"`);
  }
  return palette.value;
}

/** The product's templates, each validated against the product and the fonts; none when the product has no index. */
async function loadTemplates(product: ProductDefinition, fonts: FontCatalog): Promise<Template[]> {
  const response = await fetch(`${TEMPLATES_URL}/index.json`);
  if (!response.ok || !(response.headers.get("content-type") ?? "").includes("json")) return [];
  const index = (await response.json()) as { templates: string[] };
  return Promise.all(
    index.templates.map(async (id) => {
      const checked = validateTemplate(await fetchJson(`${TEMPLATES_URL}/${id}.json`), { product, fonts });
      if (!checked.ok) throw new Error(`template ${id}: ${checked.errors.map((e) => e.message).join("; ")}`);
      return checked.value;
    }),
  );
}

/** The product definition, the colours, the fonts and the templates: data, fetched as JSON and validated, not imported as code. */
async function loadData(): Promise<DemoData> {
  const [productJson, paletteJson, fontsJson] = await Promise.all([fetchJson(PRODUCT_URL), fetchJson(PALETTE_URL), fetchJson(FONTS_URL)]);
  const product = validateProductDefinition(productJson);
  if (!product.ok) throw new Error(product.errors.map((e) => e.message).join("; "));
  const fonts = validateFontCatalog(fontsJson);
  if (!fonts.ok) throw new Error(fonts.errors.map((e) => e.message).join("; "));
  const palette = readPalette(paletteJson, product.value);
  const templates = await loadTemplates(product.value, fonts.value);
  return { product: product.value, palette, fonts: fonts.value, templates };
}

/** A new design: the product's first template applied (a helpful default, 06-editor.md 7.2), no team name yet, a sample player. */
function newDesign(data: DemoData): DesignDocument {
  const design = createDesign(data.product, { teamName: "", samplePlayer: { name: EDITOR_WORDING.lettering.sampleName, number: EDITOR_WORDING.lettering.sampleNumber } });
  return data.templates[0] ? applyTemplate(design, data.templates[0], { product: data.product, fonts: data.fonts }) : design;
}

/** The credit the model's licence asks for, wherever it is shown (a CC BY duty). */
function ModelCredit({ demoProduct }: { demoProduct: DemoProduct }) {
  const credit = demoProduct.credit;
  if (!credit) return null;
  return (
    <>
      3D model:{" "}
      <a href={credit.sourceUrl} target="_blank" rel="noreferrer">
        &ldquo;{credit.title}&rdquo;
      </a>{" "}
      by {credit.author},{" "}
      <a href={credit.licenceUrl} target="_blank" rel="noreferrer">
        {credit.licence}
      </a>
      {credit.changed && ", changed by us"}
    </>
  );
}

interface Session {
  key: number;
  design: DesignDocument;
  startCard: boolean;
  resume: boolean;
}

/** The editor as a coach sees it: the interface of task E3a-2, saving on this device. */
function EditorPage({ data }: { data: DemoData }) {
  const { product } = data;
  const [store, setStore] = useState<{ designs: DeviceDesignStore; assets: DeviceAssetStore; persistent: boolean } | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [saveState, setSaveState] = useState<SaveState | null>(null);
  const [done, setDone] = useState(false);
  const [otherTab, setOtherTab] = useState(false);
  const started = useRef(true);
  const autosave = useRef<Autosave | null>(null);
  const tabs = useRef<ReturnType<typeof watchOtherTabs>>(null);

  // The device store (IndexedDB); when the browser refuses it, the editor still works and says "Not saved".
  useEffect(() => {
    let alive = true;
    openIndexedDbStore()
      .then((kv) => ({ kv, persistent: true }))
      .catch(() => ({ kv: createMemoryKeyValueStore(), persistent: false }))
      .then(async ({ kv, persistent }) => {
        const designs = new DeviceDesignStore(kv);
        const assets = createDeviceAssetStore(designs);
        const saved = persistent ? await designs.loadDesign(product).catch(() => null) : null;
        if (!alive) return;
        if (saved) await assets.restore(designAssetIds(saved.design));
        setStore({ designs, assets, persistent });
        setSession(saved ? { key: 1, design: saved.design, startCard: false, resume: true } : { key: 1, design: newDesign(data), startCard: true, resume: false });
        if (!persistent) setSaveState("failed");
      });
    return () => {
      alive = false;
    };
  }, [data, product]);

  useEffect(() => {
    if (!store) return;
    autosave.current = createAutosave({
      save: async (design) => {
        if (!store.persistent) throw new Error("no storage");
        const record = await store.designs.saveDesign(product.id, design, { started: started.current });
        tabs.current?.announce(record.savedAt);
      },
      onState: setSaveState,
    });
    tabs.current = watchOtherTabs(product.id, () => setOtherTab(true));
    return () => {
      autosave.current?.dispose();
      tabs.current?.close();
    };
  }, [store, product.id]);

  const onDesignChange = useCallback((design: DesignDocument, info: { started: boolean }) => {
    started.current = info.started;
    autosave.current?.schedule(design);
  }, []);

  const onDone = useCallback((design: DesignDocument) => {
    autosave.current?.schedule(design);
    autosave.current
      ?.flush()
      .catch(() => undefined)
      .finally(() => setDone(true));
  }, []);

  const timings = useRef<EditorTiming[]>([]);
  const onTiming = useCallback((t: EditorTiming) => {
    timings.current.push(t);
    (window as unknown as { __editorTimings: EditorTiming[] }).__editorTimings = timings.current;
  }, []);

  const assets = useMemo(
    () => (store ? { upload: store.assets.upload, url: store.assets.url, fileName: store.assets.fileName } : null),
    [store],
  );
  if (!session || !assets || !store) return null;
  return (
    <>
      <EditorShell
        key={session.key}
        product={product}
        palette={data.palette}
        fonts={data.fonts}
        templates={data.templates}
        initialDesign={session.design}
        showStartCard={session.startCard}
        productName={DEMO_PRODUCT.shortName}
        assets={assets}
        onDesignChange={onDesignChange}
        saveState={saveState}
        onDone={onDone}
        // Leaving: the demo has no product page, so it starts the page again (the saved design is offered back).
        onClose={() => {
          void autosave.current?.flush().catch(() => undefined).finally(() => window.location.reload());
        }}
        slots={{ brand: "FitMyOutfit", credit: DEMO_PRODUCT.credit ? <ModelCredit demoProduct={DEMO_PRODUCT} /> : undefined }}
        onTiming={onTiming}
        logTimings
      />
      <ResumePrompt
        open={session.resume}
        onContinue={() => setSession((s) => s && { ...s, resume: false })}
        onStartAgain={() => {
          autosave.current?.dispose();
          void store.designs.clearDesign(product.id).finally(() => {
            setSaveState(null);
            setSession((s) => ({ key: (s?.key ?? 0) + 1, design: newDesign(data), startCard: true, resume: false }));
          });
        }}
      />
      <DoneNotice open={done} onClose={() => setDone(false)} />
      {otherTab && (
        <div role="alert" style={{ position: "fixed", insetInline: 12, top: 64, zIndex: 10, padding: 12, borderRadius: 8, background: "#fff7e6", border: "1px solid #f0d49b", font: "14px system-ui, sans-serif", display: "flex", gap: 12, alignItems: "center" }}>
          <span style={{ flex: 1 }}>{EDITOR_WORDING.frame.otherTab}</span>
          <button type="button" onClick={() => window.location.reload()} style={{ minHeight: 44, padding: "0 14px" }}>
            {EDITOR_WORDING.frame.reload}
          </button>
        </div>
      )}
    </>
  );
}

/** The developer page: the engine's plain controls (?dev=1), as before E3a-2. */
function DevPage({ data }: { data: DemoData }) {
  const [Editor, setEditor] = useState<ComponentType<EditorProps> | null>(null);
  useEffect(() => {
    // Loaded only on the developer page, with its own styles (dev.css, imported by Editor.tsx).
    void import("./Editor").then((m) => setEditor(() => m.Editor));
  }, []);
  if (!Editor) return null;
  const swatches = coloursCommonFirst(data.palette).map((c) => ({ color: paletteColourRef(c), name: c.name }));
  return <Editor product={data.product} swatches={swatches} palette={data.palette} fonts={data.fonts} templates={data.templates} demoProduct={DEMO_PRODUCT} />;
}

function App() {
  const [data, setData] = useState<DemoData | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    loadData()
      .then(setData)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, []);
  if (error) {
    console.error("The demo data could not be loaded:", error);
    return DEV ? <p role="alert">Could not load the demo data: {error}</p> : <p role="alert">{EDITOR_WORDING.states.failed}</p>;
  }
  if (!data) return null;
  return DEV ? <DevPage data={data} /> : <EditorPage data={data} />;
}

const container = document.getElementById("root");
if (container) {
  createRoot(container).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
