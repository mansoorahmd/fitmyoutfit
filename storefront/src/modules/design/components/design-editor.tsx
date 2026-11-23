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
  planGarmentChange,
  designAssetIds,
  openIndexedDbStore,
  readSavedListWithNotes,
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
  type GarmentChange,
  type GarmentChoice,
  type KeyValueStore,
  type Palette,
  type ProductDefinition,
  type SaveState,
  type SavedListReadNote,
  type SavedTeamList,
  type Template,
  type TeamListHost,
  type WordingOverrides,
} from "@fitmyoutfit/editor"

import { designContent } from "@content/design"
import { proofContent } from "@content/proof"
import { teamOrderContent } from "@content/team-order"
import * as teamOrderCalls from "@lib/data/team-orders"
import { guarded } from "@lib/team-order/guarded"
import { designStartPath, teamOrderPath } from "@lib/editor/designer-context"
import { editorAssetUrl } from "@lib/editor/asset-path"
import { deleteOrderDraft, readOrderDraft, readRawOrderDraft, writeOrderDraft } from "@lib/editor/order-draft"
import { designPath, productReturnPath } from "@lib/editor/paths"
import { garmentIds, garmentMove, openingGarment, readDeviceRecords } from "@lib/editor/garment-choice"
import { rememberGarmentNotice, takeGarmentNotice } from "@lib/editor/garment-handoff"
import { designProductId, earlierModelIds, garmentList, isEarlierModelDesign, type EditorGarment, type EditorProduct } from "@lib/editor/products"
import { readNotesMessage, type ReadNotesMessage } from "@lib/editor/read-notes"
import { stableFamilies } from "@lib/editor/stable-fonts"
import { setSavedDesignFlag } from "@lib/editor/saved-design"
import { lockedListPlan } from "@lib/editor/locked-list"
import { listLimits, listMinimum } from "@lib/editor/team-list-host"
import { authHref } from "@lib/util/account-auth"
import { createListSaver, type ListSaveState, type ListSaver } from "@lib/team-order/list-saver"
import { savedListFromView } from "@lib/team-order/map"
import { designerReturnPath, leaveLinks } from "@lib/editor/leave-links"
import { STORE_NAME } from "@lib/store-config"
import DesignerMenu from "./designer-menu"
import { topBarState } from "@lib/team-order/save-words"
import { runStart, type StartProgress, type StartStep } from "@lib/team-order/start"
import type { Failure, TeamOrderView } from "@lib/team-order/types"
import { failureSentence, isDraft, statusWords } from "@lib/team-order/words"
import { dayOfMoment } from "@lib/team-order/proof"
import { stepFailure } from "@lib/team-order/signing"
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

type Data = {
  product: ProductDefinition
  palette: Palette
  fonts: FontCatalog
  templates: Template[]
  /** The chooser's garments with their definitions; empty when the designer offers no garment change here. */
  garments: GarmentChoice[]
}

async function fetchJson(relative: string): Promise<unknown> {
  const response = await fetch(editorAssetUrl(relative))
  if (!response.ok) throw new Error(`${relative}: HTTP ${response.status}`)
  return response.json() as Promise<unknown>
}

function problems(errors: { message: string }[]): string {
  return errors.map((e) => e.message).join("; ")
}

/** The garments the chooser offers, each with its product definition (data the store holds too), or none when nothing is to be chosen. */
async function loadGarments(entry: EditorProduct, inOrder: boolean): Promise<GarmentChoice[]> {
  const list = garmentList(entry, { inOrder })
  if (list.length < 2) return []
  return Promise.all(
    list.map(async ({ handle: _handle, picture, ...choice }) => {
      const checked = validateProductDefinition(await fetchJson(`products/${choice.id}.json`))
      if (!checked.ok) throw new Error(`${choice.id}: ${problems(checked.errors)}`)
      return { ...choice, ...(picture ? { picture: editorAssetUrl(picture) } : {}), product: checked.value }
    }),
  )
}

/** The product definition, colours, fonts and templates: data, fetched and validated. The model's address is the storefront's. */
async function loadData(entry: EditorProduct, garment: EditorGarment, fontFamilies: Record<string, string>, inOrder: boolean): Promise<Data> {
  const base = `templates/${garment.definition}`
  const [productJson, paletteJson, fontsJson, garments] = await Promise.all([
    fetchJson(`products/${garment.definition}.json`),
    fetchJson(PALETTE_FILE),
    fetchJson(FONTS_FILE),
    loadGarments(entry, inOrder),
  ])
  const checkedProduct = validateProductDefinition(productJson)
  if (!checkedProduct.ok) throw new Error(problems(checkedProduct.errors))
  const product: ProductDefinition = {
    ...checkedProduct.value,
    model: { ...checkedProduct.value.model, url: editorAssetUrl(`models/${garment.modelFile}`) },
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
  return { product, palette: checkedPalette.value, fonts, templates, garments }
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

/**
 * Whether the editor cannot open the order's list at all (it is not a list of this product): then the list is read-only
 * here, as it was. A list the editor can open in part is opened (it keeps every line it can) and the organizer is told
 * what was cut or left out (`teamList.onReadNotes`).
 */
function listUnusable(list: SavedTeamList, productId: string, limits: Parameters<typeof readSavedListWithNotes>[1]["limits"]): boolean {
  return readSavedListWithNotes(list, { productId, ...(limits ? { limits } : {}) }).notes.some((n) => n.code === "not-usable")
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
  /** What the editor opens saying (after a change of garment): its own sentence about the change. */
  notice?: string
}
/** The device's store, open before anything is chosen: which neck a saved design belongs to is read from it. */
type Device = { kv: KeyValueStore; designs: DeviceDesignStore; assets: DeviceAssetStore; persistent: boolean }
type Store = { kv: KeyValueStore; designs: DeviceDesignStore; assets: DeviceAssetStore; persistent: boolean; missing: string[] }
type Leaving =
  | { kind: "idle" }
  | { kind: "saving"; proof?: boolean }
  | { kind: "failed"; list: boolean }
  | { kind: "proof-failed"; text: string; signedOut: boolean }
type ChangeList = { kind: "closed" } | { kind: "asking" } | { kind: "working" } | { kind: "failed"; text: string }

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
const makeProof = guarded(teamOrderCalls.makeProof)
const reopenTeamOrder = guarded(teamOrderCalls.reopenTeamOrder)
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
  const [device, setDevice] = useState<Device | null>(null)
  /** The garment (the neck) being designed: chosen once the device has been read, changed by the chooser. */
  const [garment, setGarment] = useState<EditorGarment | null>(null)
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
  const [changeList, setChangeList] = useState<ChangeList>({ kind: "closed" })
  // The order as the server last said it: a proof made here, or a list reopened here, changes its status.
  const [liveView, setLiveView] = useState<TeamOrderView | null>(orderContext?.view ?? null)
  // Whether the list is locked, for the handlers below: while it is, nothing is sent to the server, whatever the editor says.
  const lockedRef = useRef(false)
  const [conflictBusy, setConflictBusy] = useState(false)
  const [earlierDismissed, setEarlierDismissed] = useState(false)
  const [chartOpen, setChartOpen] = useState(false)
  const [chartSize, setChartSize] = useState<string | undefined>(undefined)

  const started = useRef(true)
  /** The garment chosen in the editor's chooser, until the new editor has opened with it. */
  const handoff = useRef<GarmentChange | null>(null)
  const keyCount = useRef(1)
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

  // ---- the device store, and which garment (which neck) the designer opens on ------
  useEffect(() => {
    let alive = true
    openIndexedDbStore()
      .then((kv) => ({ kv, persistent: true }))
      .catch(() => ({ kv: createMemoryKeyValueStore(), persistent: false }))
      .then(({ kv, persistent }) => {
        if (!alive) return
        const designs = new DeviceDesignStore(kv)
        setDevice({ kv, designs, assets: createDeviceAssetStore(designs), persistent })
      })
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    if (!device || garment) return
    let alive = true
    ;(async () => {
      let opening: EditorGarment
      if (orderContext) {
        // the neck the order's design was saved with; a draft on this device the server has not seen yet is newer
        const raw = device.persistent ? await readRawOrderDraft(device.kv, orderContext.view.id) : null
        opening = openingGarment(entry, { order: { design: orderContext.design, draft: raw } })
      } else {
        const records = device.persistent ? await readDeviceRecords(device.kv, garmentIds(entry)) : []
        opening = openingGarment(entry, { device: records, requested: context.requestedGarment })
      }
      if (alive) setGarment(opening)
    })().catch(() => alive && setGarment(entry.garments[0]!))
    return () => {
      alive = false
    }
  }, [device, garment, entry, orderContext, context.requestedGarment])

  // ---- the editor's data ---------------------------------------------------
  // The lettering faces under stable names (a saved design opens with its fonts after a new build).
  const families = useMemo(() => stableFamilies(fontFamilies), [fontFamilies])

  useEffect(() => {
    if (!garment) return
    let alive = true
    setError(false)
    loadData(entry, garment, families, !!orderContext).then(
      (loaded) => alive && setData(loaded),
      (e: unknown) => {
        console.error("The designer's data could not be loaded:", e)
        if (alive) setError(true)
      },
    )
    return () => {
      alive = false
    }
  }, [entry, garment, families, attempt, orderContext])

  // ---- what the editor opens with --------------------------------------------
  useEffect(() => {
    if (!data || !device) return
    let alive = true
    const { kv, persistent, designs, assets } = device
    ;(async () => {
      // the other neck was chosen in the editor: its carried design, the list as it stood, the editor's own sentence
      const change = handoff.current
      handoff.current = null

      if (orderContext) {
        // A team order: the server's design and list, or this device's unsent draft of them.
        const view = orderContext.view
        if (change && orderRef.current) {
          // Another neck, chosen here: the design is the carried one and counts as changed (the next save point makes a
          // design version for it), the list is the one the editor handed over, with the new neck's id.
          const design = change.design
          const teamList = change.teamList
          const missing = await assets.restore(designAssetIds(design))
          if (!alive) return
          latest.current = { design, teamList }
          setDesignUnsent(designJson(design) !== orderRef.current.baseJson)
          setStore({ kv, designs, assets, persistent, missing })
          setSession({ key: ++keyCount.current, design, teamList, startCard: false, resume: false, locked: false, earlierModel: "none", notice: change.notice })
          return
        }
        // A design made for an earlier model of the garment does not fit this one: the designer opens fresh on the
        // current model, the list as the server has it, and says so. The earlier design stays with the order's versions.
        const earlier = isEarlierModelDesign(orderContext.design, entry)
        // the order's design was saved with another neck than the one chosen (a draft on this device is for that one)
        const otherNeck = !earlier && designProductId(orderContext.design) !== data.product.id
        const server = earlier || otherNeck ? { ok: true as const, value: newDesign(data) } : upgradeDesign(orderContext.design, { product: data.product })
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
        // for an earlier model (or another neck) the base is the order's own design, so the opened one counts as a change and is saved as a new version
        orderRef.current = {
          view,
          baseJson: earlier || otherNeck ? designJson(orderContext.design as DesignDocument) : designJson(server.value),
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
          locked: !isDraft(view.status) || listUnusable(teamList, data.product.id, view.limits),
          earlierModel: earlier ? "order" : "none",
        })
        if (draft?.listDirty && draft.teamList) setTouched(true)
        return
      }

      if (change) {
        // Another neck of the same product, chosen here: the carried design is what is saved for it from now on.
        const design = change.design
        const teamList = change.teamList
        const missing = await assets.restore(designAssetIds(design))
        if (persistent) await designs.saveDesign(data.product.id, design, { started: true, teamList }).catch(() => undefined)
        if (!alive) return
        setSavedDesignFlag(handle, true, data.product.id)
        latest.current = { design, teamList }
        setStore({ kv, designs, assets, persistent, missing })
        setSession({ key: ++keyCount.current, design, teamList, startCard: false, resume: false, locked: false, earlierModel: "none", notice: change.notice })
        if (!persistent) setDeviceState("failed")
        return
      }

      const saved = persistent ? await designs.loadDesign(data.product).catch(() => null) : null
      if (!alive) return

      // A chooser card opened a garment this device holds no design for, while it holds one for another neck of the
      // product (the latest): the customer's colours come along, the way the editor's own garment chooser carries them.
      // The garment's own saved design, when there is one, is opened above instead.
      if (!saved && persistent && context.requestedGarment === data.product.id) {
        const others = (await readDeviceRecords(kv, garmentIds(entry).filter((id) => id !== data.product.id))).sort((a, b) => b.savedAt - a.savedAt)
        const from = data.garments.find((g) => g.id === others[0]?.id)
        const to = data.garments.find((g) => g.id === data.product.id)
        const other = from?.product ? await designs.loadDesign(from.product).catch(() => null) : null
        if (from?.product && to && other) {
          const plan = planGarmentChange(EDITOR_WORDING, other.design, { ...from, product: from.product }, to)
          if (plan.carry) {
            const design = plan.carry.design
            const teamList = other.teamList ? { ...other.teamList, productId: data.product.id } : null
            const missing = await assets.restore(designAssetIds(design))
            await designs.saveDesign(data.product.id, design, { started: true, teamList }).catch(() => undefined)
            if (!alive) return
            setSavedDesignFlag(handle, true, data.product.id)
            latest.current = { design, teamList }
            setStore({ kv, designs, assets, persistent, missing })
            setSession({ key: ++keyCount.current, design, teamList, startCard: false, resume: false, locked: false, earlierModel: "none", notice: plan.notice })
            return
          }
        }
      }
      const missing = saved ? await assets.restore(designAssetIds(saved.design)) : []
      if (saved) await designs.pruneAssets().catch(() => undefined)
      // The product page's button reads this flag; the real store is the truth.
      setSavedDesignFlag(handle, !!saved, data.product.id)
      // a design this device holds for an earlier model of the garment is left where it is, and the visitor is told
      const earlierOnDevice = saved ? false : await hasEarlierDeviceDesign(kv, handle)
      // arriving from another garment's designer: its sentence, once, and no "Continue your last design?"
      const arrival = saved ? takeGarmentNotice(handle) : null
      latest.current = { design: saved?.design ?? null, teamList: saved?.teamList ?? null }
      setStore({ kv, designs, assets, persistent, missing })
      setSession(
        saved
          ? {
              key: 1,
              design: saved.design,
              teamList: saved.teamList ?? null,
              startCard: false,
              // coming back from signing in to finish starting an order, or from another garment: no "Continue your last design?"
              resume: !context.resumeStart && !arrival,
              locked: false,
              earlierModel: "none",
              ...(arrival ? { notice: arrival } : {}),
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
    })().catch((e: unknown) => {
      console.error("The designer could not open:", e)
      if (alive) setError(true)
    })
    return () => {
      alive = false
    }
  }, [data, device, handle, entry, orderContext, context.resumeStart, context.requestedGarment])

  useEffect(() => {
    lockedRef.current = session?.locked ?? false
  }, [session?.locked])

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
        if (started.current) setSavedDesignFlag(handle, true, productId)
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
      // a locked order is never written over (the editor's undo can still change a locked list on screen)
      if (lockedRef.current) return
      started.current = info.started
      latest.current.design = design
      setTouched(true)
      if (orderRef.current) setDesignUnsent(designJson(design) !== orderRef.current.baseJson)
      autosave.current?.schedule(design)
    },
    [],
  )

  const onTeamListChange = useCallback((list: SavedTeamList) => {
    if (lockedRef.current) return
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
   * version, a new design version is made and the order is pointed at it. True when everything is saved.
   */
  const savePoint = useCallback(
    async (design: DesignDocument, notice: Leaving = { kind: "saving" }): Promise<boolean> => {
      const current = orderRef.current
      if (!orderContext || !current || !data || !store) return false
      latest.current.design = design
      setLeaving(notice)
      const listResult = (await saver.current?.flush()) ?? { kind: "saved" as const }
      if (listResult.kind !== "saved") {
        setLeaving({ kind: "failed", list: true })
        return false
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
            return false
          }
          versionId = made.value.versionId
          current.pending = { json, versionId }
        }
        const pointed = await setTeamOrderDesignVersion(orderContext.view.id, versionId)
        if (!pointed.ok) {
          setLeaving({ kind: "failed", list: false })
          return false
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
      return true
    },
    [orderContext, data, store, context.productId]
  )

  /** A save point, then the order's page (or the store link that was pressed). */
  const saveAndOpenOrder = useCallback(
    async (design: DesignDocument, to: string | null = orderPage) => {
      if (!to) return
      leaveTarget.current = to
      if (await savePoint(design)) router.push(to)
    },
    [savePoint, orderPage, router]
  )

  /**
   * The Done panel's main action when the list is ready: a save point, then the proof is made (the backend says
   * whether the list is ready; its refusal is shown in one sentence), then the proof page. The order's page says
   * what is missing when the backend does not think the list is ready.
   */
  const continueToProof = useCallback(
    async (design: DesignDocument) => {
      const current = orderRef.current
      if (!orderContext || !current || !orderPage) return
      leaveTarget.current = orderPage
      if (!(await savePoint(design, { kind: "saving", proof: true }))) return
      if (!orderRef.current?.view.summary.readyForProof) {
        router.push(orderPage)
        return
      }
      const made = await makeProof(orderContext.view.id)
      if (!made.ok) {
        const step = stepFailure("make", made.failure)
        setLeaving({ kind: "proof-failed", text: step.text, signedOut: step.signedOut })
        return
      }
      if (orderRef.current) orderRef.current.view = made.value
      setLiveView(made.value)
      router.push(`${orderPage}/proof`)
    },
    [orderContext, orderPage, savePoint, router]
  )

  const signInHref = authHref("signin", { next: orderContext ? `/design/${handle}?order=${orderContext.view.id}` : designStartPath(handle) })

  /**
   * "Save and finish later" and the Done panel's closing action: an order's save point and its page; a locked
   * order's page at once; for a design with no order yet, the one short step that starts it.
   */
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

  /** The Done panel's main button: "Continue to the proof" for a draft order, the proof for a locked one, the start step for a new design. */
  const primary = useCallback(
    async (design: DesignDocument) => {
      if (orderContext) {
        if (session?.locked) {
          const proofNow = liveView?.currentProof
          router.push(proofNow && orderPage ? `${orderPage}/proof` : (orderPage ?? "/"))
          return
        }
        await continueToProof(design)
        return
      }
      await proceed(design)
    },
    [orderContext, session?.locked, liveView, orderPage, router, continueToProof, proceed],
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
      // the design is the order's now: whichever neck it was saved under on this device goes
      for (const id of garmentIds(entry)) await store.designs.clearDesign(id).catch(() => undefined)
      setSavedDesignFlag(handle, false)
      router.push(`/${countryCode}${teamOrderPath(result.order.id)}`)
    },
    [data, store, entry, context.productId, context.region.id, handle, router, countryCode],
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
        // the menu's "Change garment" opens the editor's own chooser where the editor offers one
        garments: (data?.garments.length ?? 0) >= 2 && !session?.locked ? "editor" : "page",
      }),
    [countryCode, handle, context.signedIn, orderContext, data?.garments.length, session?.locked],
  )

  /** The menu's "Change garment": the press the editor's own garment button would get (it has no way to be opened from outside). */
  const openGarmentChooser = useCallback((): boolean => {
    const button = document.querySelector<HTMLButtonElement>('[data-testid="garment-button"], [data-testid="start-garment-change"]')
    if (!button) return false
    button.click()
    return true
  }, [])

  /**
   * The customer chose a garment in the editor's chooser. The old garment's design and list are saved first (the design
   * stays saved, so choosing the garment again brings it back). The other neck of the same product: this page starts the
   * editor again on it, with the carried design. Another product: its designer opens with the design saved for it (the one
   * the editor carried, or the garment's own when this device holds one), and the sizes, price and minimum follow. Inside
   * a team order only the necks are offered; another product's garment is refused here too.
   */
  const onChooseGarment = useCallback(
    (change: GarmentChange) => {
      if (!data || !device || lockedRef.current) return
      const move = garmentMove(entry, data.product.id, change.garmentId, { inOrder: !!orderContext })
      if (move.kind === "none") return
      void (async () => {
        if (latest.current.design) autosave.current?.schedule(latest.current.design)
        await (autosave.current?.flush() ?? Promise.resolve()).catch(() => undefined)
        if (orderContext) {
          // the list reaches the order before the editor starts again; if it cannot, it is sent when the new editor opens
          const sent = (await saver.current?.flush()) ?? { kind: "saved" as const }
          if (orderRef.current && sent.kind !== "saved") orderRef.current.resendList = true
        }
        if (move.kind === "neck") {
          handoff.current = change
          setSession(null)
          setStore(null)
          setData(null)
          setGarment(move.garment)
          return
        }
        const target = data.garments.find((g) => g.id === change.garmentId)?.product
        const own = target ? await device.designs.loadDesign(target).catch(() => null) : null
        const design = own?.design ?? change.design
        const teamList = change.teamList ?? own?.teamList ?? null
        if (device.persistent) await device.designs.saveDesign(change.garmentId, design, { started: true, teamList }).catch(() => undefined)
        setSavedDesignFlag(move.entry.handle, true, change.garmentId)
        rememberGarmentNotice(move.entry.handle, own ? EDITOR_WORDING.garment.noticeBack.replaceAll("{name}", move.garment.name) : change.notice)
        router.push(`/${countryCode}${designPath(move.entry.handle)}`)
      })()
    },
    [data, device, entry, orderContext, router, countryCode],
  )

  /** What the editor said about the saved list it opened, until the organizer closes it. */
  const [readNotes, setReadNotes] = useState<ReadNotesMessage | null>(null)
  const onReadNotes = useCallback(
    (notes: readonly SavedListReadNote[]) => setReadNotes(readNotesMessage(notes, orderContext ? "order" : "device")),
    [orderContext],
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

  /** The order is a draft again: the list is editable (the editor opens afresh, with the list as the server has it). */
  const unlock = useCallback(
    (view: TeamOrderView) => {
      if (!data) return
      if (orderRef.current) orderRef.current.view = view
      setLiveView(view)
      const list = savedListFromView(view, data.product.id)
      latest.current.teamList = list
      lockedRef.current = false
      setChangeList({ kind: "closed" })
      setSession((s) => s && { ...s, key: s.key + 1, design: latest.current.design ?? s.design, teamList: list, locked: listUnusable(list, data.product.id, view.limits) })
    },
    [data]
  )

  /** "Change the list": the backend takes the order back to a draft (the proof is withdrawn or replaced), then the list is editable again. */
  const reopenList = useCallback(async () => {
    if (!orderContext) return
    setChangeList({ kind: "working" })
    const result = await reopenTeamOrder(orderContext.view.id)
    if (!result.ok) {
      // an order that is a draft already is as good as reopened: read it and carry on
      if (result.failure.kind === "refused" && result.failure.code === "team_order_already_draft") {
        const again = await retrieveTeamOrder(orderContext.view.id)
        if (again.ok) {
          unlock(again.value)
          return
        }
      }
      setChangeList({ kind: "failed", text: stepFailure("reopen", result.failure).text })
      return
    }
    unlock(result.value)
  }, [orderContext, unlock])

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

  const view = liveView
  const locked = session?.locked ?? false

  // What the locked list says and offers: "Signed on ...", "Change the list" while a proof is out or signed.
  const lockedPlan = useMemo(
    () => (locked && view ? lockedListPlan(view, { unreadable: isDraft(view.status) }) : null),
    [locked, view]
  )

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
      onReadNotes,
      // The save has its own waiting (the device copy one second, the order's list one second): the list is handed over at once.
      debounceMs: 0,
      listRequiredToContinue: true,
      ...(locked && view
        ? {
            locked: {
              signedOn: lockedPlan?.signedOn ?? "",
              ...(lockedPlan?.canChange ? { onChangeList: () => setChangeList({ kind: "asking" }) } : {}),
            },
          }
        : {}),
    }),
    [session?.teamList, context.sizes, context.noun, context.region.minimum, context.region.phrase, context.sizeChart, view, locked, lockedPlan, onTeamListChange, onReadNotes],
  )

  const bar = topBarState({ list: listState, device: deviceState, designUnsent, touched })
  const wording = useMemo<WordingOverrides | undefined>(() => {
    const overrides: WordingOverrides = {}
    // The list is on the server: the top bar says only "Saved", unless the design has changes only this device has.
    if (orderContext && bar.savedWords === "server") overrides.frame = { saved: words.saved }
    // The editor's note for a signed list names a signature: only a signed proof has one. Otherwise the note says
    // where the order is (the proof is out, or its status), in the order's own words.
    // Inside a team order the chooser offers only the necks of the order's garment, and says how to design another.
    if (orderContext && (data?.garments.length ?? 0) >= 2) overrides.garment = { body: designContent.garments.inOrder } as WordingOverrides["garment"]
    if (locked && lockedPlan?.note === "plain") overrides.teamList = { locked: { note: "{date}" } } as WordingOverrides["teamList"]
    return Object.keys(overrides).length > 0 ? overrides : undefined
  }, [orderContext, bar.savedWords, locked, lockedPlan, words.saved, data?.garments.length])

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

  const primaryLabel = orderContext
    ? locked
      ? view?.currentProof
        ? proofContent.designer.openProof
        : words.openOrder
      : proofContent.make.designerButton
    : words.continue

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
        garments={locked ? undefined : data.garments}
        garmentId={data.product.id}
        onChooseGarment={locked ? undefined : onChooseGarment}
        {...(session.notice ? { startNotice: session.notice } : {})}
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
          account: <DesignerMenu links={leaveLinkList} onLeave={leaveTo} onGarments={openGarmentChooser} />,
          // our own match jersey has no credit line; a model under CC BY (the T-shirt) must
          ...(entry.credit
            ? { credit: <Credit credit={entry.credit} short={false} />, creditShort: <Credit credit={entry.credit} short /> }
            : {}),
          primaryAction: (design) => (
            <button type="button" className="fmo-primary" data-done-focus onClick={() => void primary(design)} data-testid="done-continue">
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
            void Promise.all(garmentIds(entry).map((id) => store.designs.clearDesign(id).catch(() => undefined))).finally(() => {
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
      {readNotes && (
        <div
          role="status"
          className="fixed inset-x-3 top-16 z-10 mx-auto flex max-w-xl items-start gap-3 rounded-card border border-brand-border bg-brand-surface-alt p-3 type-small text-brand-ink"
          data-testid="design-read-notes"
        >
          <div className="flex flex-1 flex-col gap-1">
            <p className="font-semibold">{readNotes.title}</p>
            {readNotes.sentences.map((sentence) => (
              <p key={sentence}>{sentence}</p>
            ))}
          </div>
          <button type="button" className="min-h-11 px-3 font-semibold" onClick={() => setReadNotes(null)} data-testid="design-read-notes-dismiss">
            {words.readNotes.close}
          </button>
        </div>
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
          // On a desktop (the editor's wide layout: a rail and a panel on the left) the top of the stage holds the player
          // chip, so the note sits at the stage's lower left, above the view buttons and clear of the zoom column.
          className="fixed inset-x-3 top-16 z-10 mx-auto max-w-xl rounded-card border border-brand-border bg-brand-surface-alt p-3 type-small text-brand-ink min-[1024px]:inset-x-auto min-[1024px]:bottom-[76px] min-[1024px]:left-[584px] min-[1024px]:top-auto min-[1024px]:mx-0 min-[1024px]:w-[min(380px,calc(100vw-584px-88px))]"
          data-testid="design-locked-note"
        >
          {view && isDraft(view.status)
            ? words.listUnreadable.text
            : view && (view.status === "proof_sent" || view.status === "approved")
              ? proofContent.designer.designFixed
              : words.locked.designNote}
        </div>
      )}
      {changeList.kind !== "closed" && (
        <div
          role="alertdialog"
          aria-labelledby="design-change-list-title"
          className="fixed inset-x-3 bottom-4 z-30 mx-auto flex max-w-xl flex-col gap-3 rounded-card border border-brand-border bg-white p-4 type-body text-brand-ink shadow-lg"
          data-testid="design-change-list"
        >
          <h2 id="design-change-list-title" className="type-h3">
            {proofContent.reopen.title}
          </h2>
          <p>{view?.status === "approved" ? proofContent.reopen.textSigned : proofContent.reopen.textSent}</p>
          {changeList.kind === "failed" && (
            <p role="alert" className="text-brand-error" data-testid="design-change-list-error">
              {changeList.text}
            </p>
          )}
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              className="min-h-11 rounded-control border-2 border-brand-ink px-4 font-semibold"
              disabled={changeList.kind === "working"}
              onClick={() => void reopenList()}
              data-testid="design-change-list-confirm"
            >
              {changeList.kind === "working" ? proofContent.reopen.working : proofContent.reopen.confirm}
            </button>
            <button
              type="button"
              className="min-h-11 px-3 font-semibold underline"
              disabled={changeList.kind === "working"}
              onClick={() => setChangeList({ kind: "closed" })}
              data-testid="design-change-list-cancel"
            >
              {proofContent.reopen.cancel}
            </button>
          </div>
        </div>
      )}
      {leaving.kind !== "idle" && (
        <div
          role={leaving.kind === "failed" ? "alert" : "status"}
          className="fixed inset-x-3 bottom-4 z-30 mx-auto flex max-w-xl flex-col gap-3 rounded-card border border-brand-border bg-white p-4 type-body text-brand-ink shadow-lg"
          data-testid="design-leaving"
        >
          {leaving.kind === "saving" ? (
            <p>{leaving.proof ? proofContent.designer.makingProof : words.leaving.saving}</p>
          ) : leaving.kind === "proof-failed" ? (
            <>
              <p data-testid="design-proof-failure">{leaving.text}</p>
              <div className="flex flex-wrap gap-3">
                {leaving.signedOut ? (
                  <a className="min-h-11 rounded-control border-2 border-brand-ink px-4 py-2.5 font-semibold" href={signInHref}>
                    {teamOrderContent.refusals.signedOut}
                  </a>
                ) : (
                  <button
                    type="button"
                    className="min-h-11 rounded-control border-2 border-brand-ink px-4 font-semibold"
                    onClick={() => latest.current.design && void continueToProof(latest.current.design)}
                    data-testid="design-proof-retry"
                  >
                    {proofContent.designer.tryAgain}
                  </button>
                )}
                <button type="button" className="min-h-11 px-3 font-semibold underline" onClick={() => orderPage && router.push(orderPage)} data-testid="design-proof-open-order">
                  {proofContent.designer.openOrder}
                </button>
                <button type="button" className="min-h-11 px-3 font-semibold underline" onClick={() => setLeaving({ kind: "idle" })}>
                  {proofContent.designer.keepDesigning}
                </button>
              </div>
            </>
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
