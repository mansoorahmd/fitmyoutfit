"use client"

import { useRouter } from "next/navigation"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  DeviceDesignStore,
  EDITOR_WORDING,
  EditorShell,
  ResumePrompt,
  applyTemplate,
  createAutosave,
  createDesign,
  createDeviceAssetStore,
  createMemoryKeyValueStore,
  designAssetIds,
  openIndexedDbStore,
  validateFontCatalog,
  validatePalette,
  validateProductDefinition,
  validateTemplate,
  watchOtherTabs,
  type Autosave,
  type DesignDocument,
  type DeviceAssetStore,
  type FontCatalog,
  type Palette,
  type ProductDefinition,
  type SaveState,
  type Template,
} from "@fitmyoutfit/editor"

import { designContent } from "@content/design"
import { editorAssetUrl } from "@lib/editor/asset-path"
import { productReturnPath } from "@lib/editor/paths"
import type { EditorProduct } from "@lib/editor/products"
import { setSavedDesignFlag } from "@lib/editor/saved-design"

import DesignMessage from "./design-message"
import DesignLoading from "./design-loading"
import type { DesignLoaderProps } from "./design-loader"

// Placeholder: the colours and fonts the editor's sample products use, not
// print-tested. They are replaced with the founders' files (and these two
// names with product data) when those arrive; see lib/editor/products.ts.
const PALETTE_FILE = "palettes/placeholder-palette.json"
const FONTS_FILE = "fonts/placeholder-fonts.json"

type Data = { product: ProductDefinition; palette: Palette; fonts: FontCatalog; templates: Template[] }

async function fetchJson(relative: string): Promise<unknown> {
  const response = await fetch(editorAssetUrl(relative))
  if (!response.ok) throw new Error(`${relative}: HTTP ${response.status}`)
  return response.json() as Promise<unknown>
}

function problems(errors: { message: string }[]): string {
  return errors.map((e) => e.message).join("; ")
}

/** The product definition, colours, fonts and templates: data, fetched and validated. The model's address is the storefront's. */
async function loadData(entry: EditorProduct, fontFamilies: Record<string, string>): Promise<Data> {
  const base = `templates/${entry.definition}`
  const [productJson, paletteJson, fontsJson] = await Promise.all([
    fetchJson(`products/${entry.definition}.json`),
    fetchJson(PALETTE_FILE),
    fetchJson(FONTS_FILE),
  ])
  const checkedProduct = validateProductDefinition(productJson)
  if (!checkedProduct.ok) throw new Error(problems(checkedProduct.errors))
  const product: ProductDefinition = {
    ...checkedProduct.value,
    model: { ...checkedProduct.value.model, url: editorAssetUrl(`models/${entry.modelFile}`) },
  }

  // The catalogue's families renamed to the faces next/font generated.
  const rawFonts = fontsJson as { fonts?: { family: string }[] }
  const checkedFonts = validateFontCatalog({
    ...(fontsJson as object),
    fonts: (rawFonts.fonts ?? []).map((f) => ({ ...f, family: fontFamilies[f.family] ?? f.family })),
  })
  if (!checkedFonts.ok) throw new Error(problems(checkedFonts.errors))
  const fonts = checkedFonts.value

  const checkedPalette = validatePalette(paletteJson)
  if (!checkedPalette.ok) throw new Error(problems(checkedPalette.errors))
  if (checkedPalette.value.id !== product.palette.id) {
    throw new Error(`the palette file is "${checkedPalette.value.id}" but the product uses "${product.palette.id}"`)
  }

  const indexResponse = await fetch(editorAssetUrl(`${base}/index.json`))
  const templates: Template[] = indexResponse.ok
    ? await Promise.all(
        ((await indexResponse.json()) as { templates: string[] }).templates.map(async (id) => {
          const checked = validateTemplate(await fetchJson(`${base}/${id}.json`), { product, fonts })
          if (!checked.ok) throw new Error(`template ${id}: ${problems(checked.errors)}`)
          return checked.value
        }),
      )
    : []
  return { product, palette: checkedPalette.value, fonts, templates }
}

/** A new design: the product's first template applied (a helpful default), no team name yet, a sample player. */
function newDesign(data: Data): DesignDocument {
  const design = createDesign(data.product, {
    teamName: "",
    samplePlayer: { name: EDITOR_WORDING.lettering.sampleName, number: EDITOR_WORDING.lettering.sampleNumber },
  })
  return data.templates[0]
    ? applyTemplate(design, data.templates[0], { product: data.product, fonts: data.fonts })
    : design
}

/** The model's credit on one line at the top of the stage: a CC BY duty, wherever the model is shown. */
function Credit({ entry, short }: { entry: EditorProduct; short: boolean }) {
  const { credit } = entry
  const words = designContent.credit
  return (
    <>
      {short ? words.short.prefix : words.long.prefix}{" "}
      {!short && (
        <>
          <a href={credit.sourceUrl} target="_blank" rel="noreferrer">
            &ldquo;{credit.title}&rdquo;
          </a>{" "}
          {words.long.by}{" "}
        </>
      )}
      {credit.author},{" "}
      <a href={credit.licenceUrl} target="_blank" rel="noreferrer">
        {credit.licence}
      </a>
      {credit.changed && (short ? words.short.changed : words.long.changed)}
    </>
  )
}

type Session = { key: number; design: DesignDocument; startCard: boolean; resume: boolean }
type Store = { designs: DeviceDesignStore; assets: DeviceAssetStore; persistent: boolean; missing: string[] }

/** Keeps the page from scrolling or bouncing behind the editor (a phone's rubber band included). */
function useLockedPage() {
  useEffect(() => {
    const targets = [document.documentElement, document.body]
    const before = targets.map((el) => ({ overflow: el.style.overflow, overscroll: el.style.overscrollBehavior }))
    targets.forEach((el) => {
      el.style.overflow = "hidden"
      el.style.overscrollBehavior = "none"
    })
    return () => {
      targets.forEach((el, i) => {
        el.style.overflow = before[i]!.overflow
        el.style.overscrollBehavior = before[i]!.overscroll
      })
    }
  }, [])
}

/**
 * The 3D designer as the store hosts it: the editor package's EditorShell
 * on a full-screen page, saving the design on this device (IndexedDB, with
 * the editor's own device store). "Done" ("Save and go back") and the close
 * button return to the product page of the same country.
 */
export default function DesignEditor({ product: entry, countryCode, fontFamilies }: DesignLoaderProps) {
  const router = useRouter()
  useLockedPage()

  const [data, setData] = useState<Data | null>(null)
  const [error, setError] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [store, setStore] = useState<Store | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [saveState, setSaveState] = useState<SaveState | null>(null)
  const [otherTab, setOtherTab] = useState(false)
  const started = useRef(true)
  const autosave = useRef<Autosave | null>(null)
  const tabs = useRef<ReturnType<typeof watchOtherTabs>>(null)
  const handle = entry.handle

  useEffect(() => {
    let alive = true
    setError(false)
    loadData(entry, fontFamilies).then(
      (loaded) => alive && setData(loaded),
      (e: unknown) => {
        console.error("The designer's data could not be loaded:", e)
        if (alive) setError(true)
      },
    )
    return () => {
      alive = false
    }
  }, [entry, fontFamilies, attempt])

  // The device store (IndexedDB); when the browser refuses it, the editor still works and says "Not saved".
  useEffect(() => {
    if (!data) return
    let alive = true
    openIndexedDbStore()
      .then((kv) => ({ kv, persistent: true }))
      .catch(() => ({ kv: createMemoryKeyValueStore(), persistent: false }))
      .then(async ({ kv, persistent }) => {
        const designs = new DeviceDesignStore(kv)
        const assets = createDeviceAssetStore(designs)
        const saved = persistent ? await designs.loadDesign(data.product).catch(() => null) : null
        if (!alive) return
        const missing = saved ? await assets.restore(designAssetIds(saved.design)) : []
        if (saved) await designs.pruneAssets().catch(() => undefined)
        // The product page's button reads this flag; the real store is the truth.
        setSavedDesignFlag(handle, !!saved)
        setStore({ designs, assets, persistent, missing })
        setSession(
          saved
            ? { key: 1, design: saved.design, startCard: false, resume: true }
            : { key: 1, design: newDesign(data), startCard: true, resume: false },
        )
        if (!persistent) setSaveState("failed")
      })
    return () => {
      alive = false
    }
  }, [data, handle])

  useEffect(() => {
    if (!store || !data) return
    const productId = data.product.id
    autosave.current = createAutosave({
      save: async (design) => {
        if (!store.persistent) throw new Error("no storage")
        const record = await store.designs.saveDesign(productId, design, { started: started.current })
        if (started.current) setSavedDesignFlag(handle, true)
        tabs.current?.announce(record.savedAt)
      },
      onState: setSaveState,
    })
    tabs.current = watchOtherTabs(productId, () => setOtherTab(true))
    return () => {
      autosave.current?.dispose()
      tabs.current?.close()
    }
  }, [store, data, handle])

  const onDesignChange = useCallback((design: DesignDocument, info: { started: boolean }) => {
    started.current = info.started
    autosave.current?.schedule(design)
  }, [])

  const leave = useCallback(
    (saved: boolean) => {
      router.push(productReturnPath(countryCode, handle, { saved }))
    },
    [router, countryCode, handle],
  )

  const onDone = useCallback(
    (design: DesignDocument) => {
      autosave.current?.schedule(design)
      void (autosave.current?.flush() ?? Promise.resolve())
        .catch(() => undefined)
        .finally(() => leave(true))
    },
    [leave],
  )

  const onClose = useCallback(() => {
    void (autosave.current?.flush() ?? Promise.resolve())
      .catch(() => undefined)
      .finally(() => leave(false))
  }, [leave])

  const assets = useMemo(
    () =>
      store
        ? {
            upload: store.assets.upload,
            url: store.assets.url,
            fileName: store.assets.fileName,
            missing: store.missing,
            notes: store.assets.notes,
            saveNote: store.assets.saveNote,
            release: store.assets.release,
          }
        : null,
    [store],
  )

  if (error) {
    return (
      <DesignMessage
        title={designContent.failed.title}
        text={designContent.failed.text}
        backHref={`/products/${handle}`}
        backLabel={designContent.back}
        action={{ label: designContent.failed.retry, onClick: () => setAttempt((n) => n + 1) }}
      />
    )
  }
  if (!data || !session || !assets || !store) return <DesignLoading />

  return (
    <div
      className="fixed inset-0 bg-white"
      style={{
        height: "100dvh",
        overscrollBehavior: "none",
        paddingTop: "env(safe-area-inset-top, 0px)",
        paddingLeft: "env(safe-area-inset-left, 0px)",
        paddingRight: "env(safe-area-inset-right, 0px)",
      }}
      data-testid="design-editor"
    >
      <EditorShell
        key={session.key}
        product={data.product}
        palette={data.palette}
        fonts={data.fonts}
        templates={data.templates}
        initialDesign={session.design}
        showStartCard={session.startCard}
        productName={entry.shortName}
        assets={assets}
        onDesignChange={onDesignChange}
        saveState={saveState}
        onDone={onDone}
        onClose={onClose}
        style={{ height: "100%" }}
        slots={{
          brand: "FitMyOutfit",
          credit: <Credit entry={entry} short={false} />,
          creditShort: <Credit entry={entry} short />,
        }}
      />
      <ResumePrompt
        open={session.resume}
        onContinue={() => {
          setSession((s) => s && { ...s, resume: false })
          setSaveState("saved")
        }}
        onStartAgain={() => {
          autosave.current?.dispose()
          void store.designs.clearDesign(data.product.id).finally(() => {
            setSavedDesignFlag(handle, false)
            setSaveState(null)
            setSession((s) => ({ key: (s?.key ?? 0) + 1, design: newDesign(data), startCard: true, resume: false }))
          })
        }}
      />
      {otherTab && (
        <div
          role="alert"
          className="fixed inset-x-3 top-16 z-10 flex items-center gap-3 rounded-card border border-brand-border bg-brand-surface-alt p-3 type-small text-brand-ink"
        >
          <span className="flex-1">{EDITOR_WORDING.frame.otherTab}</span>
          <button type="button" className="min-h-11 px-3 font-semibold" onClick={() => window.location.reload()}>
            {EDITOR_WORDING.frame.reload}
          </button>
        </div>
      )}
    </div>
  )
}
