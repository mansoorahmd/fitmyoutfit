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
  upgradeDesign,
  validateFontCatalog,
  validatePalette,
  validateProductDefinition,
  validateTemplate,
  watchOtherTabs,
  type Autosave,
  type DesignDocument,
  type DeviceAssetStore,
  type FontCatalog,
  type KeyValueStore,
  type Palette,
  type ProductDefinition,
  type SaveState,
  type SavedTeamList,
  type Template,
  type TeamListHost,
  type WordingOverrides,
} from "@fitmyoutfit/editor"

import { designContent } from "@content/design"
import { teamOrderContent } from "@content/team-order"
import * as teamOrderCalls from "@lib/data/team-orders"
import { guarded } from "@lib/team-order/guarded"
import { designStartPath, teamOrderPath } from "@lib/editor/designer-context"
import { editorAssetUrl } from "@lib/editor/asset-path"
import { deleteOrderDraft, readOrderDraft, writeOrderDraft } from "@lib/editor/order-draft"
import { productReturnPath } from "@lib/editor/paths"
import { earlierModelIds, isEarlierModelDesign, type EditorProduct } from "@lib/editor/products"
import { setSavedDesignFlag } from "@lib/editor/saved-design"
import { listLimits, listMinimum } from "@lib/editor/team-list-host"
import { authHref } from "@lib/util/account-auth"
import { createListSaver, type ListSaveState, type ListSaver } from "@lib/team-order/list-saver"
import { editorAcceptsList, savedListFromView } from "@lib/team-order/map"
import { designerReturnPath, leaveLinks } from "@lib/editor/leave-links"
import { STORE_NAME } from "@lib/store-config"
import DesignerMenu from "./designer-menu"
import { topBarState } from "@lib/team-order/save-words"
import { runStart, type StartProgress, type StartStep } from "@lib/team-order/start"
import type { Failure, TeamOrderView } from "@lib/team-order/types"
import { failureSentence, isDraft, statusWords } from "@lib/team-order/words"
import { SizeChartSheet } from "@modules/products/components/size-chart"

import DesignMessage from "./design-message"
import DesignLoading from "./design-loading"
import type { DesignLoaderProps } from "./design-loader"
import ListSaveBanner from "./list-save-banner"
import TeamOrderDialog, { type StartStatus } from "./team-order-dialog"

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
    // the body under the garment, when the product has one: its file is the storefront's too
    ...(checkedProduct.value.body && entry.bodyFile
      ? { body: { ...checkedProduct.value.body, url: editorAssetUrl(`models/${entry.bodyFile}`) } }
      : {}),
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
function Credit({ credit, short }: { credit: NonNullable<EditorProduct["credit"]>; short: boolean }) {
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

/** Whether this device still holds a design under an earlier editor product of this garment (the store opens another model now). */
async function hasEarlierDeviceDesign(kv: KeyValueStore, handle: string): Promise<boolean> {
  try {
    for (const id of earlierModelIds(handle)) {
      const raw = (await kv.get("designs", `last:${id}`)) as { version?: number; productId?: string } | undefined
      if (raw && raw.version === 1 && raw.productId === id) return true
    }
  } catch {
    // storage refused: nothing to tell
  }
  return false
}

type Session = {
  key: number
  design: DesignDocument
  /** The team list the editor opens with: the device's copy, or the order's. */
  teamList: SavedTeamList | null
  startCard: boolean
  resume: boolean
  /** The order is no longer a draft: the list is read-only here and nothing is saved. */
  locked: boolean
  /** A design for an earlier model of this garment exists (on this device, or as the order's design): it is not opened here. */
  earlierModel: "none" | "device" | "order"
}
type Store = { kv: KeyValueStore; designs: DeviceDesignStore; assets: DeviceAssetStore; persistent: boolean; missing: string[] }
type Leaving = { kind: "idle" } | { kind: "saving" } | { kind: "failed"; list: boolean }

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

// The server actions as the designer calls them: a call that throws (the phone lost its signal) is a failure, not a hang.
const addSavedDesignVersion = guarded(teamOrderCalls.addSavedDesignVersion)
const createSavedDesign = guarded(teamOrderCalls.createSavedDesign)
const createTeamOrder = guarded(teamOrderCalls.createTeamOrder)
const retrieveTeamOrder = guarded(teamOrderCalls.retrieveTeamOrder)
const saveTeamOrderList = guarded(teamOrderCalls.saveTeamOrderList)
const setTeamOrderDesignVersion = guarded(teamOrderCalls.setTeamOrderDesignVersion)

const designJson = (design: DesignDocument): string => JSON.stringify(design)

/** The one sentence for a failed step of starting a team order: the refusal's own when we have words for it, else the step's. */
function startFailureText(step: StartStep, failure: Failure): string {
  const words = teamOrderContent.designer.startFailed
  if (failure.kind === "signed_out") return words.signedOut
  if (failure.kind === "refused" && teamOrderContent.refusals[failure.code]) return failureSentence(failure)
  return words[step]
}

/**
 * The 3D designer as the store hosts it: the editor package's EditorShell on a full-screen page.
 *
 * Without a team order (`/design/jersey`) the design and the team list are saved on this device (IndexedDB,
 * with the editor's own device store), as before. The Done panel's main action starts a team order: signed
 * out, the visitor signs in and comes back (the design stays on this device); signed in, one short step asks
 * for the team name and an optional need-by date, then the design is saved as a design, the team order is
 * made and the list is saved to it (lib/team-order/start.ts), and the organizer lands on the order's page.
 *
 * With a team order (`/design/jersey?order=teamord_...`) the design and the list come from the order, and
 * the list is saved to it as the organizer goes (lib/team-order/list-saver.ts). The design stays on this
 * device as an unsent draft between save points; a new design version is made only at a save point (the
 * Done panel's actions and the close button) and only when the design changed since the order's version.
 */
export default function DesignEditor({ product: entry, countryCode, fontFamilies, context }: DesignLoaderProps) {
  const router = useRouter()
  useLockedPage()

  const orderContext = context.order
  const words = teamOrderContent.designer

  const [data, setData] = useState<Data | null>(null)
  const [error, setError] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [store, setStore] = useState<Store | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [deviceState, setDeviceState] = useState<SaveState | null>(null)
  const [listState, setListState] = useState<ListSaveState>({ kind: "saved" })
  const [designUnsent, setDesignUnsent] = useState(false)
  const [touched, setTouched] = useState(false)
  const [otherTab, setOtherTab] = useState(false)
  const [startStep, setStartStep] = useState<"none" | "sign-in" | "start">("none")
  const [startStatus, setStartStatus] = useState<StartStatus>({ kind: "idle" })
  const [defaultTeamName, setDefaultTeamName] = useState("")
  const [leaving, setLeaving] = useState<Leaving>({ kind: "idle" })
  const [conflictBusy, setConflictBusy] = useState(false)
  const [earlierDismissed, setEarlierDismissed] = useState(false)
  const [chartOpen, setChartOpen] = useState(false)
  const [chartSize, setChartSize] = useState<string | undefined>(undefined)

  const started = useRef(true)
  const autosave = useRef<Autosave | null>(null)
  const tabs = useRef<ReturnType<typeof watchOtherTabs>>(null)
  const saver = useRef<ListSaver<SavedTeamList> | null>(null)
  /** The newest design and list the editor handed over. */
  const latest = useRef<{ design: DesignDocument | null; teamList: SavedTeamList | null }>({ design: null, teamList: null })
  /** The order as the server last said, the design JSON it holds, and a version made but not yet pointed at. */
  const orderRef = useRef<{ view: TeamOrderView; baseJson: string; pending: { json: string; versionId: string } | null; resendList: boolean } | null>(null)
  const progress = useRef<StartProgress>({})
  /** Where the page goes once the order's save point is done (the order's page, or the store link that was pressed). */
  const leaveTarget = useRef<string | null>(null)
  const handle = entry.handle

  // ---- the editor's data ---------------------------------------------------
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

  // ---- the device store, and what the editor opens with --------------------
  useEffect(() => {
    if (!data) return
    let alive = true
    openIndexedDbStore()
      .then((kv) => ({ kv, persistent: true }))
      .catch(() => ({ kv: createMemoryKeyValueStore(), persistent: false }))
      .then(async ({ kv, persistent }) => {
        const designs = new DeviceDesignStore(kv)
        const assets = createDeviceAssetStore(designs)

        if (orderContext) {
          // A team order: the server's design and list, or this device's unsent draft of them.
          const view = orderContext.view
          // A design made for an earlier model of the garment does not fit this one: the designer opens fresh on the
          // current model, the list as the server has it, and says so. The earlier design stays with the order's versions.
          const earlier = isEarlierModelDesign(orderContext.design, entry)
          const server = earlier ? { ok: true as const, value: newDesign(data) } : upgradeDesign(orderContext.design, { product: data.product })
          if (!server.ok) {
            console.error("The order's design could not be read:", server.errors.map((e) => e.message).join("; "))
            if (alive) setError(true)
            return
          }
          const draft = persistent && !earlier ? await readOrderDraft(kv, view.id, data.product).catch(() => null) : null
          const draftDesign = draft?.designDirty ? draft.design : null
          const design = draftDesign ?? server.value
          const teamList = draft?.listDirty && draft.teamList ? draft.teamList : savedListFromView(view, data.product.id)
          if (!alive) return
          const missing = await assets.restore(designAssetIds(design))
          await designs.pruneAssets().catch(() => undefined)
          // for an earlier model the base is the earlier design, so the fresh one counts as a change and is saved as a new version
          orderRef.current = {
            view,
            baseJson: earlier ? designJson(orderContext.design as DesignDocument) : designJson(server.value),
            pending: null,
            resendList: draft?.listDirty === true && !!draft.teamList,
          }
          latest.current = { design, teamList }
          setDesignUnsent(designJson(design) !== orderRef.current.baseJson)
          setStore({ kv, designs, assets, persistent, missing })
          setSession({
            key: 1,
            design,
            teamList,
            startCard: false,
            resume: false,
            locked: !isDraft(view.status) || !editorAcceptsList(view),
            earlierModel: earlier ? "order" : "none",
          })
          if (draft?.listDirty && draft.teamList) setTouched(true)
          return
        }

        const saved = persistent ? await designs.loadDesign(data.product).catch(() => null) : null
        if (!alive) return
        const missing = saved ? await assets.restore(designAssetIds(saved.design)) : []
        if (saved) await designs.pruneAssets().catch(() => undefined)
        // The product page's button reads this flag; the real store is the truth.
        setSavedDesignFlag(handle, !!saved)
        // a design this device holds for an earlier model of the garment is left where it is, and the visitor is told
        const earlierOnDevice = saved ? false : await hasEarlierDeviceDesign(kv, handle)
        latest.current = { design: saved?.design ?? null, teamList: saved?.teamList ?? null }
        setStore({ kv, designs, assets, persistent, missing })
        setSession(
          saved
            ? {
                key: 1,
                design: saved.design,
                teamList: saved.teamList ?? null,
                startCard: false,
                // coming back from signing in to finish starting an order: no "Continue your last design?"
                resume: !context.resumeStart,
                locked: false,
                earlierModel: "none",
              }
            : {
                key: 1,
                design: newDesign(data),
                teamList: null,
                startCard: true,
                resume: false,
                locked: false,
                earlierModel: earlierOnDevice ? "device" : "none",
              },
        )
        if (!persistent) setDeviceState("failed")
      })
    return () => {
      alive = false
    }
  }, [data, handle, orderContext, context.resumeStart])

  // ---- the device copy: the design (and the list), written after a second of quiet ----
  useEffect(() => {
    if (!store || !data || !session || session.locked) return
    const productId = data.product.id
    autosave.current = createAutosave({
      save: async (design) => {
        if (!store.persistent) throw new Error("no storage")
        if (orderContext) {
          const base = orderRef.current
          await writeOrderDraft(store.kv, {
            version: 1,
            orderId: orderContext.view.id,
            productId,
            savedAt: Date.now(),
            design,
            designDirty: base ? designJson(design) !== base.baseJson : true,
            ...(latest.current.teamList ? { teamList: latest.current.teamList } : {}),
            listDirty: saver.current?.unsent ?? false,
          })
          return
        }
        const record = await store.designs.saveDesign(productId, design, {
          started: started.current,
          teamList: latest.current.teamList,
        })
        if (started.current) setSavedDesignFlag(handle, true)
        tabs.current?.announce(record.savedAt)
      },
      onState: setDeviceState,
    })
    if (!orderContext) tabs.current = watchOtherTabs(productId, () => setOtherTab(true))
    return () => {
      autosave.current?.dispose()
      tabs.current?.close()
    }
  }, [store, data, session?.locked, handle, orderContext]) // eslint-disable-line react-hooks/exhaustive-deps

  // ---- the list, saved to the order as the organizer goes ------------------
  useEffect(() => {
    if (!orderContext || !store || !session || session.locked) return
    const instance = createListSaver<SavedTeamList, TeamOrderView>({
      version: orderRef.current?.view.listVersion ?? orderContext.view.listVersion,
      delayMs: 1000,
      save: (version, list) => saveTeamOrderList(orderContext.view.id, version, list),
      onState: (state) => {
        setListState(state)
        // the device copy says whether the server has the list
        if (state.kind === "saved" && latest.current.design) autosave.current?.schedule(latest.current.design)
      },
      onSaved: (view) => {
        if (orderRef.current) orderRef.current.view = view
      },
    })
    saver.current = instance
    // A list typed in an earlier visit that the server never got: it goes now.
    if (orderRef.current?.resendList && session.teamList) {
      orderRef.current.resendList = false
      instance.push(session.teamList)
    }
    const online = () => instance.retry()
    window.addEventListener("online", online)
    return () => {
      window.removeEventListener("online", online)
      instance.dispose()
      saver.current = null
    }
  }, [orderContext, store, session?.key, session?.locked]) // eslint-disable-line react-hooks/exhaustive-deps

  // ---- what the editor reports ---------------------------------------------
  const onDesignChange = useCallback(
    (design: DesignDocument, info: { started: boolean }) => {
      started.current = info.started
      latest.current.design = design
      setTouched(true)
      if (orderRef.current) setDesignUnsent(designJson(design) !== orderRef.current.baseJson)
      autosave.current?.schedule(design)
    },
    [],
  )

  const onTeamListChange = useCallback((list: SavedTeamList) => {
    latest.current.teamList = list
    setTouched(true)
    if (orderRef.current) saver.current?.push(list)
    // the device copy holds the list too: with the design for a visitor, and as the unsent draft for an order
    if (latest.current.design) autosave.current?.schedule(latest.current.design)
  }, [])

  const flushDevice = useCallback(async (design: DesignDocument) => {
    latest.current.design = design
    autosave.current?.schedule(design)
    await (autosave.current?.flush() ?? Promise.resolve()).catch(() => undefined)
  }, [])

  // ---- leaving, and the save points ----------------------------------------
  const orderPage = orderContext ? `/${countryCode}${teamOrderPath(orderContext.view.id)}` : null

  const leaveToProduct = useCallback(
    (saved: boolean) => router.push(productReturnPath(countryCode, handle, { saved })),
    [router, countryCode, handle],
  )

  /**
   * A save point of an order: the list is on the server, then, if the design changed since the order's
   * version, a new design version is made and the order is pointed at it; then the order's page.
   */
  const saveAndOpenOrder = useCallback(
    async (design: DesignDocument, to: string | null = orderPage) => {
      const current = orderRef.current
      if (!orderContext || !current || !orderPage || !data || !store || !to) return
      leaveTarget.current = to
      latest.current.design = design
      setLeaving({ kind: "saving" })
      const listResult = (await saver.current?.flush()) ?? { kind: "saved" as const }
      if (listResult.kind !== "saved") {
        setLeaving({ kind: "failed", list: true })
        return
      }
      const json = designJson(design)
      if (json !== current.baseJson) {
        // a version made by an earlier try that could not be pointed at is reused, never made twice
        let versionId = current.pending?.json === json ? current.pending.versionId : null
        if (!versionId) {
          const made = await addSavedDesignVersion({
            designId: orderContext.view.designId,
            productId: context.productId,
            design,
          })
          if (!made.ok) {
            setLeaving({ kind: "failed", list: false })
            return
          }
          versionId = made.value.versionId
          current.pending = { json, versionId }
        }
        const pointed = await setTeamOrderDesignVersion(orderContext.view.id, versionId)
        if (!pointed.ok) {
          setLeaving({ kind: "failed", list: false })
          return
        }
        current.view = pointed.value
        current.baseJson = json
        current.pending = null
        setDesignUnsent(false)
      }
      // what is on this device is now what the server has
      await writeOrderDraft(store.kv, {
        version: 1,
        orderId: orderContext.view.id,
        productId: data.product.id,
        savedAt: Date.now(),
        design,
        designDirty: false,
        ...(latest.current.teamList ? { teamList: latest.current.teamList } : {}),
        listDirty: false,
      }).catch(() => undefined)
      router.push(to)
    },
    [orderContext, orderPage, data, store, context.productId, router],
  )

  const signInHref = authHref("signin", { next: orderContext ? `/design/${handle}?order=${orderContext.view.id}` : designStartPath(handle) })

  /** The Done panel's actions ("Continue", "Save and finish later"). */
  const proceed = useCallback(
    async (design: DesignDocument) => {
      if (orderContext) {
        if (session?.locked && orderPage) {
          router.push(orderPage)
          return
        }
        await saveAndOpenOrder(design)
        return
      }
      await flushDevice(design)
      setDefaultTeamName(design.teamName ?? "")
      setStartStatus({ kind: "idle" })
      setStartStep(context.signedIn ? "start" : "sign-in")
    },
    [orderContext, session?.locked, orderPage, router, saveAndOpenOrder, flushDevice, context.signedIn],
  )

  // back from signing in: the one short step opens by itself
  const resumed = useRef(false)
  useEffect(() => {
    if (!context.resumeStart || !context.signedIn || orderContext || !session || resumed.current) return
    resumed.current = true
    setDefaultTeamName(latest.current.design?.teamName ?? session.design.teamName ?? "")
    setStartStep("start")
  }, [context.resumeStart, context.signedIn, orderContext, session])

  const closeStart = useCallback(() => {
    setStartStep("none")
    setStartStatus({ kind: "idle" })
    // the address no longer says "finish starting the order"
    if (context.resumeStart) router.replace(`/${countryCode}/design/${handle}`)
  }, [context.resumeStart, router, countryCode, handle])

  const submitStart = useCallback(
    async ({ teamName, needByDate }: { teamName: string; needByDate: string | null }) => {
      if (!data || !store || !latest.current.design) return
      const design = latest.current.design
      const list = latest.current.teamList
      setStartStatus({ kind: "working" })
      const result = await runStart(
        { teamName, needByDate, productId: context.productId, regionId: context.region.id, design, list },
        { createDesign: createSavedDesign, createOrder: createTeamOrder, saveList: (id, version, l) => saveTeamOrderList(id, version, l) },
        progress.current,
      )
      progress.current = result.progress
      if (!result.ok) {
        const order = result.progress.order
        setStartStatus({
          kind: "failed",
          text: startFailureText(result.step, result.failure),
          orderPath: order ? teamOrderPath(order.id) : null,
          signedOut: result.failure.kind === "signed_out",
        })
        return
      }
      // The design and the list are on the server now. This device keeps the logo files and a clean copy under the
      // order's own key; the product page's "Continue your design" record goes (its design is the order's now).
      await writeOrderDraft(store.kv, {
        version: 1,
        orderId: result.order.id,
        productId: data.product.id,
        savedAt: Date.now(),
        design,
        designDirty: false,
        ...(list ? { teamList: list } : {}),
        listDirty: false,
      }).catch(() => undefined)
      autosave.current?.dispose()
      await store.designs.clearDesign(data.product.id).catch(() => undefined)
      setSavedDesignFlag(handle, false)
      router.push(`/${countryCode}${teamOrderPath(result.order.id)}`)
    },
    [data, store, context.productId, context.region.id, handle, router, countryCode],
  )

  const onClose = useCallback(() => {
    if (orderContext) {
      if (session?.locked && orderPage) {
        router.push(orderPage)
        return
      }
      if (latest.current.design) void saveAndOpenOrder(latest.current.design)
      else if (orderPage) router.push(orderPage)
      return
    }
    void (autosave.current?.flush() ?? Promise.resolve()).catch(() => undefined).finally(() => leaveToProduct(false))
  }, [orderContext, session?.locked, orderPage, router, saveAndOpenOrder, leaveToProduct])

  /**
   * A store link pressed in the designer (its menu or its wordmark). Nothing is lost on the way: an order's
   * design and list go through the order's save point first, a visitor's design is written to this device
   * first (the product page and the chooser then offer to continue it). If the save fails, the leaving
   * notice stays with its choices (try again, stay, leave anyway).
   */
  const leaveTo = useCallback(
    (href: string) => {
      leaveTarget.current = href
      if (orderContext) {
        if (session?.locked || !latest.current.design) {
          router.push(href)
          return
        }
        void saveAndOpenOrder(latest.current.design, href)
        return
      }
      void (autosave.current?.flush() ?? Promise.resolve()).catch(() => undefined).finally(() => router.push(href))
    },
    [orderContext, session?.locked, saveAndOpenOrder, router],
  )

  const leaveLinkList = useMemo(
    () =>
      leaveLinks({
        countryCode,
        handle,
        signedIn: context.signedIn,
        orderId: orderContext?.view.id ?? null,
        returnTo: designerReturnPath(handle, orderContext?.view.id ?? null),
      }),
    [countryCode, handle, context.signedIn, orderContext],
  )

  // ---- the same order changed somewhere else -------------------------------
  const adoptSavedList = useCallback(async () => {
    if (!orderContext || !saver.current) return
    setConflictBusy(true)
    const read = await retrieveTeamOrder(orderContext.view.id)
    setConflictBusy(false)
    if (!read.ok) return // the banner stays: nothing was thrown away
    const view = read.value
    if (orderRef.current) orderRef.current.view = view
    saver.current.adopt(view.listVersion)
    const list = savedListFromView(view, data?.product.id ?? "")
    latest.current.teamList = list
    setSession((s) => s && { ...s, key: s.key + 1, design: latest.current.design ?? s.design, teamList: list })
  }, [orderContext, data])

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

  const view = orderContext?.view ?? null
  const locked = session?.locked ?? false

  // The team list's host props: the product's sizes and noun, the region's minimum, the server's limits once an order exists.
  const teamListHost = useMemo<TeamListHost>(
    () => ({
      initial: session?.teamList ?? null,
      ...(context.sizes ? { sizes: context.sizes } : {}),
      noun: context.noun,
      minimum: listMinimum(context.region.minimum, context.region.phrase),
      limits: listLimits(view?.limits),
      ...(context.sizeChart
        ? {
            openSizeChart: (size: string | null) => {
              setChartSize(size ?? undefined)
              setChartOpen(true)
            },
          }
        : {}),
      onChange: onTeamListChange,
      // The save has its own waiting (the device copy one second, the order's list one second): the list is handed over at once.
      debounceMs: 0,
      listRequiredToContinue: true,
      ...(locked && view
        ? { locked: { signedOn: isDraft(view.status) ? words.listUnreadable.note : statusWords(view.status).text } }
        : {}),
    }),
    [session?.teamList, context.sizes, context.noun, context.region.minimum, context.region.phrase, context.sizeChart, view, locked, onTeamListChange],
  )

  const bar = topBarState({ list: listState, device: deviceState, designUnsent, touched })
  const wording = useMemo<WordingOverrides | undefined>(() => {
    const overrides: WordingOverrides = {}
    // The list is on the server: the top bar says only "Saved", unless the design has changes only this device has.
    if (orderContext && bar.savedWords === "server") overrides.frame = { saved: words.saved }
    // The editor's note for a signed list names a signature; an order that can't change says its own status.
    if (locked) overrides.teamList = { locked: { note: "{date}", change: "" } } as WordingOverrides["teamList"]
    return Object.keys(overrides).length > 0 ? overrides : undefined
  }, [orderContext, bar.savedWords, locked, words.saved])

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

  const primaryLabel = orderContext ? (locked ? words.openOrder : words.saveAndOpen) : words.continue

  return (
    <div
      className="fmo-host fixed inset-0 bg-white"
      style={{
        height: "100dvh",
        overscrollBehavior: "none",
        paddingTop: "env(safe-area-inset-top, 0px)",
        paddingLeft: "env(safe-area-inset-left, 0px)",
        paddingRight: "env(safe-area-inset-right, 0px)",
      }}
      data-testid="design-editor"
      data-mode={orderContext ? "order" : "new"}
      data-list-state={listState.kind}
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
        teamList={teamListHost}
        wording={wording}
        onDesignChange={onDesignChange}
        saveState={orderContext ? bar.state : deviceState}
        onDone={(design) => void proceed(design)}
        onClose={onClose}
        style={{ height: "100%" }}
        slots={{
          brand: (
            <a
              href={`/${countryCode}`}
              onClick={(e) => {
                if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
                e.preventDefault()
                leaveTo(`/${countryCode}`)
              }}
              className="font-heading text-lg font-extrabold text-brand-on-inverse"
              data-testid="designer-brand-link"
            >
              {STORE_NAME}
            </a>
          ),
          account: <DesignerMenu links={leaveLinkList} onLeave={leaveTo} />,
          // our own match jersey has no credit line; a model under CC BY (the T-shirt) must
          ...(entry.credit
            ? { credit: <Credit credit={entry.credit} short={false} />, creditShort: <Credit credit={entry.credit} short /> }
            : {}),
          primaryAction: (design) => (
            <button type="button" className="fmo-primary" data-done-focus onClick={() => void proceed(design)} data-testid="done-continue">
              {primaryLabel}
            </button>
          ),
        }}
      />
      {!orderContext && (
        <ResumePrompt
          open={session.resume}
          onContinue={() => {
            setSession((s) => s && { ...s, resume: false })
            setDeviceState("saved")
          }}
          onStartAgain={() => {
            autosave.current?.dispose()
            void store.designs.clearDesign(data.product.id).finally(() => {
              setSavedDesignFlag(handle, false)
              setDeviceState(null)
              latest.current = { design: null, teamList: null }
              setSession((s) => ({
                key: (s?.key ?? 0) + 1,
                design: newDesign(data),
                teamList: null,
                startCard: true,
                resume: false,
                locked: false,
                earlierModel: "none",
              }))
            })
          }}
        />
      )}
      {orderContext && (
        <ListSaveBanner
          state={listState}
          signInHref={signInHref}
          busy={conflictBusy}
          onRetry={() => saver.current?.retry()}
          onKeepMine={() => saver.current?.keepMine()}
          onUseSaved={() => void adoptSavedList()}
        />
      )}
      {session.earlierModel !== "none" && !earlierDismissed && (
        <div
          role="status"
          className="fixed inset-x-3 top-16 z-10 mx-auto flex max-w-xl items-start gap-3 rounded-card border border-brand-border bg-brand-surface-alt p-3 type-small text-brand-ink"
          data-testid="design-earlier-model"
        >
          <p className="flex-1">{session.earlierModel === "order" ? words.earlierModel.order : words.earlierModel.device}</p>
          <button type="button" className="min-h-11 px-3 font-semibold" onClick={() => setEarlierDismissed(true)} data-testid="design-earlier-model-dismiss">
            {words.earlierModel.dismiss}
          </button>
        </div>
      )}
      {orderContext && locked && (
        <div
          role="status"
          className="fixed inset-x-3 top-16 z-10 mx-auto max-w-xl rounded-card border border-brand-border bg-brand-surface-alt p-3 type-small text-brand-ink"
          data-testid="design-locked-note"
        >
          {view && isDraft(view.status) ? words.listUnreadable.text : words.locked.designNote}
        </div>
      )}
      {leaving.kind !== "idle" && (
        <div
          role={leaving.kind === "failed" ? "alert" : "status"}
          className="fixed inset-x-3 bottom-4 z-30 mx-auto flex max-w-xl flex-col gap-3 rounded-card border border-brand-border bg-white p-4 type-body text-brand-ink shadow-lg"
          data-testid="design-leaving"
        >
          {leaving.kind === "saving" ? (
            <p>{words.leaving.saving}</p>
          ) : (
            <>
              <p>{leaving.list ? words.leaving.listFailed : words.leaving.failed}</p>
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  className="min-h-11 rounded-control border-2 border-brand-ink px-4 font-semibold"
                  onClick={() => latest.current.design && void saveAndOpenOrder(latest.current.design, leaveTarget.current ?? orderPage)}
                  data-testid="design-leaving-retry"
                >
                  {words.leaving.retry}
                </button>
                <button type="button" className="min-h-11 px-3 font-semibold underline" onClick={() => setLeaving({ kind: "idle" })}>
                  {words.leaving.stay}
                </button>
                <button
                  type="button"
                  className="min-h-11 px-3 font-semibold underline"
                  onClick={() => (leaveTarget.current ?? orderPage) && router.push((leaveTarget.current ?? orderPage) as string)}
                  data-testid="design-leaving-anyway"
                >
                  {words.leaving.leaveAnyway}
                </button>
              </div>
            </>
          )}
        </div>
      )}
      {otherTab && !orderContext && (
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
      <TeamOrderDialog
        step={startStep}
        defaultTeamName={defaultTeamName}
        signInHref={signInHref}
        status={startStatus}
        onSubmit={(input) => void submitStart(input)}
        onCancel={closeStart}
      />
      {context.sizeChart && (
        <SizeChartSheet
          open={chartOpen}
          onClose={() => setChartOpen(false)}
          chart={context.sizeChart}
          productTitle={context.productTitle}
          chosenSize={chartSize}
          showFitKitLink={false}
        />
      )}
    </div>
  )
}
