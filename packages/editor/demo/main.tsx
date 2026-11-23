import { StrictMode, useCallback, useEffect, useMemo, useRef, useState, type ComponentType } from "react";
import { createRoot } from "react-dom/client";
// The fonts of the placeholder catalogue (samples/fonts/placeholder-fonts.json), from their npm
// packages. The host application declares the faces; the editor waits for them before trusting text.
import "@fontsource/oswald/700.css";
import "@fontsource/graduate/400.css";
import "@fontsource/noto-sans-arabic/700.css";
// The store's interface faces (E3d, D4): the host provides them, not the package (decision 009). Latin only,
// the weights the editor's stylesheet uses.
import "@fontsource/barlow-condensed/latin-700.css";
import "@fontsource/inter/latin-400.css";
import "@fontsource/inter/latin-500.css";
import "@fontsource/inter/latin-600.css";
import "@fontsource/inter/latin-700.css";
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
  type GarmentChange,
  type GarmentChoice,
  type Palette,
  type ProductDefinition,
  type SaveState,
  type SavedTeamList,
  type Template,
} from "../src";
import { DEMO_PRODUCTS, chooseProduct, type DemoProduct } from "./products";
import type { EditorProps } from "./Editor";

interface DemoData {
  /** The garments of the chooser (G4), each with its product definition. */
  garments: GarmentChoice[];
  product: ProductDefinition;
  palette: Palette;
  fonts: FontCatalog;
  templates: Template[];
}

// Our match jersey (G3) by default; the stand-in football jersey (see samples/models/stand-in-jersey.LICENSE.txt), the
// stand-in T-shirt and the old script-generated placeholder by address: ?product=stand-in-jersey, ?product=stand-in-tshirt,
// ?product=placeholder-jersey.
// The developer page (the engine's plain controls, the design JSON, the texture) only with ?dev=1.
const PARAMS = new URLSearchParams(window.location.search);
const DEV = PARAMS.get("dev") === "1";
const DEMO_PRODUCT = chooseProduct(window.location.search);
// The export minimum the team list shows for a region (a placeholder of 10 pieces, 08-team-list.md 8.3): ?region=pk
// (Pakistan: none), uk (default), uae, us. The store passes the real one from its duty-paid quotes.
const REGIONS: Record<string, { name: string; minimum: number }> = { pk: { name: "Pakistan", minimum: 0 }, uk: { name: "the UK", minimum: 10 }, uae: { name: "the UAE", minimum: 10 }, us: { name: "the US", minimum: 10 } };
const REGION = REGIONS[PARAMS.get("region") ?? "uk"] ?? REGIONS.uk!;
// ?listRequired=1: the Done panel's main button follows the list (what the store sets once team orders exist, 08-team-list.md 11.2).
// ?signed=20%20Nov%202026: the proof is signed, so the list is read-only (11.3).
const LIST_REQUIRED = PARAMS.get("listRequired") === "1";
const SIGNED_ON = PARAMS.get("signed");
const productUrl = (id: string) => `/products/${id}.json`;
// Placeholder colours, as data, NOT print-tested: the founders' print-tested palette replaces the file.
const PALETTE_URL = "/palettes/placeholder-palette.json";
const FONTS_URL = "/fonts/placeholder-fonts.json";
// The product's sample templates (samples/templates/<product>/index.json lists them); none for the placeholder.
const templatesUrl = (id: string) => `/templates/${id}`;

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
  const TEMPLATES_URL = templatesUrl(product.id);
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

/** The garments of the chooser: the match jersey with its two necks, the T-shirt and the stand-in jersey, each with its product definition (data the store has too). */
async function loadGarments(): Promise<GarmentChoice[]> {
  const GROUPS: Record<string, { group: string; groupName: string; variant?: string; picture?: string }> = {
    "match-jersey-vneck": { group: "match-jersey", groupName: "Jersey", variant: "V-neck", picture: "/pictures/match-jersey-vneck.png" },
    "match-jersey-round": { group: "match-jersey", groupName: "Jersey", variant: "Round neck", picture: "/pictures/match-jersey-round.png" },
  };
  const shown = DEMO_PRODUCTS.filter((p) => p.id !== "placeholder-jersey");
  return Promise.all(
    shown.map(async (p) => {
      const checked = validateProductDefinition(await fetchJson(productUrl(p.id)));
      if (!checked.ok) throw new Error(`product ${p.id}: ${checked.errors.map((e) => e.message).join("; ")}`);
      const own = GROUPS[p.id];
      return { id: p.id, name: own ? `${own.groupName}, ${own.variant}` : p.shortName === "T-shirt" ? "T-shirt" : "Football jersey", ...(own ?? {}), product: checked.value };
    }),
  );
}

/** The product definition, the colours, the fonts and the templates: data, fetched as JSON and validated, not imported as code. */
async function loadData(productId: string): Promise<DemoData> {
  const [productJson, paletteJson, fontsJson, garments] = await Promise.all([fetchJson(productUrl(productId)), fetchJson(PALETTE_URL), fetchJson(FONTS_URL), loadGarments()]);
  const product = validateProductDefinition(productJson);
  if (!product.ok) throw new Error(product.errors.map((e) => e.message).join("; "));
  const fonts = validateFontCatalog(fontsJson);
  if (!fonts.ok) throw new Error(fonts.errors.map((e) => e.message).join("; "));
  const palette = readPalette(paletteJson, product.value);
  const templates = await loadTemplates(product.value, fonts.value);
  return { product: product.value, palette, fonts: fonts.value, templates, garments };
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

/** The credit's short form for a phone's narrow stage: the author, the licence (linked) and that we changed it; the full credit opens beside it. */
function ModelCreditShort({ demoProduct }: { demoProduct: DemoProduct }) {
  const credit = demoProduct.credit;
  if (!credit) return null;
  return (
    <>
      3D model by {credit.author},{" "}
      <a href={credit.licenceUrl} target="_blank" rel="noreferrer">
        {credit.licence}
      </a>
      {credit.changed && ", changed"}
    </>
  );
}

/** What a change of garment hands to the next editor (G4): the carried design and list, and which design to open. */
interface Handoff {
  change: GarmentChange;
}

interface Session {
  key: number;
  /** The sentence the editor opens with after a change of garment. */
  notice?: string;
  design: DesignDocument;
  /** The team list saved with the design on this device, or nothing. */
  teamList: SavedTeamList | null;
  startCard: boolean;
  resume: boolean;
}

/** The editor as a coach sees it: the interface of task E3a-2, saving on this device. */
function EditorPage({ data, demoProduct, handoff, onChooseGarment }: { data: DemoData; demoProduct: DemoProduct; handoff: Handoff | null; onChooseGarment: (change: GarmentChange) => void }) {
  const { product } = data;
  const [store, setStore] = useState<{ designs: DeviceDesignStore; assets: DeviceAssetStore; persistent: boolean; missing: string[] } | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [saveState, setSaveState] = useState<SaveState | null>(null);
  const [done, setDone] = useState(false);
  const [otherTab, setOtherTab] = useState(false);
  const started = useRef(true);
  /** The latest design and team list: one record on the device saves both. */
  const latest = useRef<{ design: DesignDocument | null; teamList: SavedTeamList | null }>({ design: null, teamList: null });
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
        // G4, a change of garment: the necks of one jersey share their pattern, so the carried design wins; another
        // garment keeps its own saved design when it has one (choosing a garment again brings its design back).
        const own = handoff && !handoff.change.samePattern && saved ? saved.design : null;
        const shown = handoff ? (own ?? handoff.change.design) : (saved?.design ?? null);
        // A design brought back: its files (the missing ones are told to the editor, S2); the files it does not use go (S7).
        const missing = shown ? await assets.restore(designAssetIds(shown)) : [];
        if (shown && !handoff) await designs.pruneAssets().catch(() => undefined);
        setStore({ designs, assets, persistent, missing });
        if (handoff) {
          const { change } = handoff;
          const design = shown!;
          const teamList = change.teamList ?? saved?.teamList ?? null;
          const notice = own ? EDITOR_WORDING.garment.noticeBack.replaceAll("{name}", demoProduct.shortName) : change.notice;
          latest.current = { design, teamList };
          if (persistent) await designs.saveDesign(product.id, design, { started: true, teamList }).catch(() => undefined);
          setSession({ key: 1, design, teamList, startCard: false, resume: false, notice });
          if (!persistent) setSaveState("failed");
          return;
        }
        latest.current = { design: saved?.design ?? null, teamList: saved?.teamList ?? null };
        setSession(saved ? { key: 1, design: saved.design, teamList: saved.teamList ?? null, startCard: false, resume: true } : { key: 1, design: newDesign(data), teamList: null, startCard: true, resume: false });
        if (!persistent) setSaveState("failed");
      });
    return () => {
      alive = false;
    };
  }, [data, product, handoff, demoProduct.shortName]);

  useEffect(() => {
    if (!store) return;
    autosave.current = createAutosave({
      save: async (design) => {
        if (!store.persistent) throw new Error("no storage");
        const record = await store.designs.saveDesign(product.id, design, { started: started.current, teamList: latest.current.teamList });
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
    latest.current.design = design;
    // For the review scripts: the current design (never shown on the page).
    (window as unknown as { __editorDesign: DesignDocument }).__editorDesign = design;
    autosave.current?.schedule(design);
  }, []);

  // The team list changed (the editor hands it over): the same record on the device is saved again, with the design.
  const onTeamListChange = useCallback((list: SavedTeamList) => {
    latest.current.teamList = list;
    (window as unknown as { __teamList: SavedTeamList }).__teamList = list;
    if (latest.current.design) autosave.current?.schedule(latest.current.design);
  }, []);
  // What the demo gives the list (the store will give its own): this product's sizes, noun and a sample minimum.
  const teamListHost = useMemo(
    () => ({
      initial: session?.teamList ?? null,
      noun: { one: demoProduct.shortName.toLowerCase(), many: `${demoProduct.shortName.toLowerCase()}s` },
      minimum: REGION.minimum > 0 ? { pieces: REGION.minimum, region: REGION.name } : null,
      ...(LIST_REQUIRED ? { listRequiredToContinue: true } : {}),
      ...(SIGNED_ON ? { locked: { signedOn: SIGNED_ON, onChangeList: () => window.alert("In the store this starts a new proof.") } } : {}),
      onChange: onTeamListChange,
      // The device save has its own second of waiting: the list is handed over at once.
      debounceMs: 0,
    }),
    [session?.teamList, onTeamListChange, demoProduct.shortName],
  );

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
    () =>
      store
        ? { upload: store.assets.upload, url: store.assets.url, fileName: store.assets.fileName, missing: store.missing, notes: store.assets.notes, saveNote: store.assets.saveNote, release: store.assets.release }
        : null,
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
        teamList={teamListHost}
        showStartCard={session.startCard}
        productName={demoProduct.shortName}
        garments={data.garments}
        garmentId={product.id}
        onChooseGarment={(change) => {
          // The old garment is saved first: its design stays on the device, so choosing it again brings it back.
          if (latest.current.design) autosave.current?.schedule(latest.current.design);
          void (autosave.current?.flush() ?? Promise.resolve()).catch(() => undefined).finally(() => onChooseGarment(change));
        }}
        {...(session.notice ? { startNotice: session.notice } : {})}
        assets={assets}
        onDesignChange={onDesignChange}
        saveState={saveState}
        onDone={onDone}
        // Leaving: the demo has no product page, so it starts the page again (the saved design is offered back).
        onClose={() => {
          void autosave.current?.flush().catch(() => undefined).finally(() => window.location.reload());
        }}
        slots={{
          brand: "FitMyOutfit",
          credit: demoProduct.credit ? <ModelCredit demoProduct={demoProduct} /> : undefined,
          creditShort: demoProduct.credit ? <ModelCreditShort demoProduct={demoProduct} /> : undefined,
        }}
        onTiming={onTiming}
        onGestureTiming={(t) => {
          const w = window as unknown as { __gestureTimings?: unknown[] };
          (w.__gestureTimings ??= []).push(t);
        }}
        draftQuality={new URLSearchParams(window.location.search).get("draft") === "never" ? "never" : "auto"}
        logTimings
      />
      <ResumePrompt
        open={session.resume}
        onContinue={() => {
          setSession((s) => s && { ...s, resume: false });
          // It is the design saved on this device.
          setSaveState("saved");
        }}
        onStartAgain={() => {
          autosave.current?.dispose();
          void store.designs.clearDesign(product.id).finally(() => {
            setSaveState(null);
            latest.current = { design: null, teamList: null };
            setSession((s) => ({ key: (s?.key ?? 0) + 1, design: newDesign(data), teamList: null, startCard: true, resume: false }));
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
  // G4: the garment being designed. The chooser changes it; the address follows (?product=), so a reload stays on it.
  const [productId, setProductId] = useState(DEMO_PRODUCT.id);
  const [handoff, setHandoff] = useState<Handoff | null>(null);
  useEffect(() => {
    loadData(productId)
      .then(setData)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, [productId]);
  const onChooseGarment = useCallback((change: GarmentChange) => {
    setHandoff({ change });
    setData(null);
    setProductId(change.garmentId);
    const url = new URL(window.location.href);
    url.searchParams.set("product", change.garmentId);
    window.history.replaceState(window.history.state, "", url);
  }, []);
  if (error) {
    console.error("The demo data could not be loaded:", error);
    return DEV ? <p role="alert">Could not load the demo data: {error}</p> : <p role="alert">{EDITOR_WORDING.states.failed}</p>;
  }
  if (!data) return null;
  const demoProduct = DEMO_PRODUCTS.find((p) => p.id === productId) ?? DEMO_PRODUCT;
  return DEV ? <DevPage data={data} /> : <EditorPage key={productId} data={data} demoProduct={demoProduct} handoff={handoff} onChooseGarment={onChooseGarment} />;
}

const container = document.getElementById("root");
if (container && PARAMS.get("pictures") === "1") {
  // The product pictures page (G5): its own module, loaded only for this address, so the editor page does not carry it.
  void import("./pictures").then((m) => m.mountPicturesPage(container));
} else if (container) {
  createRoot(container).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
