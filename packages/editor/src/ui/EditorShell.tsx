/**
 * The editor's interface (06-editor.md, task E3a-2): the shell a coach uses,
 * phone first. It chooses one of three layouts from its own size (compact,
 * short, wide), holds the design with undo and redo, and lays out the top
 * bar, the six tools, the panel, the stage and the start card.
 *
 * Loosely coupled: everything comes in as props (the product, palette, fonts,
 * templates, the host's asset storage, callbacks, wording overrides, slots);
 * nothing here reads the samples, the store or Medusa. Saving is the host's:
 * `onDesignChange` reports every change (the demo saves on the device with
 * `createAutosave`), and `saveState` says how that went.
 */
import { useCallback, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import type { FontCatalog } from "../design/font-catalog.js";
import type { Palette } from "../design/palette.js";
import type { DesignDocument, ProductDefinition } from "../design/schema.js";
import type { Template } from "../design/template.js";
import { collectFitNotices, fitDesignToAreas } from "../design/print-area.js";
import { makeReadable } from "../design/readability.js";
import { assetsNoLongerUsed, designAssetIds } from "../storage/device-store.js";
import { createItemGestures, forwardGestures, type GestureEndReason, type GesturePhase, type ItemGestures } from "./item-gestures.js";
import { layerSide } from "../design/roles.js";
import { sameJson, type EditLabel } from "../state/history.js";
import { useEditorHistory } from "../react/useEditorHistory.js";
import { useTrailing } from "../react/useTrailing.js";
import { buildSizeTable, resolveLimits } from "@fitmyoutfit/team-rules";
import { analyseList, designWithPlayer, nextToFix, playerForShirt, toSavedList, type SeenMap } from "../team-list/checks.js";
import { addLine, cleanField, convertAllDigits, moveLine, newLine, removeLine, setCount as setLineCount, setField as setLineField, setFlag as setLineFlag, setSizeCountLines, sortLines, type SortBy } from "../team-list/lines.js";
import { createHandOver } from "../team-list/hand-over.js";
import { readSavedList } from "../team-list/saved.js";
import { DEFAULT_TEAM_NOUN, DEFAULT_TEAM_SIZES, type EditorLine, type SavedTeamList, type TeamListHost, type TeamListReport } from "../team-list/types.js";
import { applyPaste, type PasteMode } from "../team-list/paste.js";
import { PlayerChip, WholeShirtToggle } from "./PlayerChip.js";
import { TeamListContext, type TeamListApi } from "./team-list-context.js";
import { PlayersTool } from "./PlayersTool.js";
import type { CameraInfo, CanvasHover, DesignCanvasHandle, LayerDragEvent, PieceGuide, TextureDrawInfo, ZoneTap } from "../react/DesignCanvas.js";
import type { GestureTiming } from "../react/draft-quality.js";
import { mayMoveCamera } from "../react/camera.js";
import { extractGarmentMeshes } from "../react/garment-geometry.js";
import { loadModel, type LoadedModel, type ModelLoadProgress } from "../react/model-loader.js";
import type { FontSetLike, FontStatus } from "../texture/fonts.js";
import { renderGarmentView, type GarmentMesh, type GarmentView } from "../texture/garment-view.js";
import type { TextFit } from "../texture/layers.js";
import type { ZoneHighlight } from "../texture/zone-highlight.js";
import type { SaveState } from "../storage/device-store.js";
import { ColoursTool, partName } from "./ColoursTool.js";
import { PartPopover } from "./PartPopover.js";
import { changeWords, fill, mergeWording, type WordingOverrides } from "./content.js";
import { EditorContext, type ColourTarget, type EditorApi, type EditorAssets, type ToolId } from "./context.js";
import { CARD_HEIGHT, CARD_WIDTH, DesignTool } from "./DesignTool.js";
import { TeamTool } from "./LetteringTools.js";
import { LogosTool, TextTool } from "./LogosTool.js";
import { LAYOUT_SIZES, START_CARD_STAGE_MIN, chooseLayout, panelGrowRoom, panelHeights, saveStateWords, sheetUnderDone, stageInsets, viewControlsFor, type PanelDetent } from "./layout.js";
import { ConfirmDialog } from "./parts.js";
import { Stage, type StageLoad } from "./Stage.js";
import { StartCard } from "./StartCard.js";
import { bodyColour, describeStage, nextStageTone, type StageTone } from "./stage-logic.js";
import { EDITOR_CSS } from "./styles.js";
import { TOOL_ORDER, ToolPanel, ToolTabs } from "./ToolPanel.js";
import { TopBar } from "./TopBar.js";
import { hasWebGL2, readLocal, writeLocal } from "./webgl.js";
import { markBody, markRow, refreshFinish } from "./finish.js";
import { HINT_MS, hintEnds, hintShows, modelTapAction, partTapAction, toolForLayer } from "./selection.js";
import { namedLabel } from "./items.js";
import { KitButton, OnThisKit } from "./OnThisKit.js";
import { DonePanel } from "./DonePanel.js";
import { warningNames, type LogoNote } from "./checks.js";
import { ClippedNote, ContextBar, FineTune, SelectedWarnings, keyEdit } from "./SelectedItem.js";
import { nudgeLayer, rotateLayerBy, scaleLayerBy, stoppedByArea } from "../design/item-edits.js";
import { printAreaLines } from "../design/snapping.js";
import { shouldReportChange } from "./report.js";
import { removeLayer } from "../design/edit.js";

/** Places the host fills with its own components (06-editor.md 13.1, 9.1). */
export interface EditorSlots {
  /** The store's wordmark, top left on wide screens. */
  brand?: ReactNode;
  /** The price line, before Done on wide screens (host: the product's regional price). */
  price?: ReactNode;
  /** Share (later, with the backend). Hidden until given. */
  share?: ReactNode;
  /** Sign-in or the account, later. */
  account?: ReactNode;
  /**
   * The Done panel's main action (9.2): "Add to team order" once team orders exist, the store's own
   * button (it is the panel's one red button). Without it the panel offers "Save and go back", which
   * calls `onDone`. A function gets the design.
   */
  primaryAction?: ReactNode | ((design: DesignDocument) => ReactNode);
  /** The model's credit line, shown on the stage (a licence duty for a CC BY model). Shown whole on one line where it fits. */
  credit?: ReactNode;
  /**
   * A short form of the credit for a phone's narrow stage (for example "3D model by Wearable3D, CC BY 4.0,
   * changed"): one line, with a button beside it that opens the full `credit`. Without it, the full credit is
   * shown on one line, cut at the end, with the same button.
   */
  creditShort?: ReactNode;
}

/** One timing for the performance log (06-editor.md 11.3): a tap to the model's change. */
export interface EditorTiming {
  name: string;
  /** Tap to the texture redrawn, ms. */
  drawnMs: number;
  /** Tap to the next frame after it (the upload and the render), ms. */
  frameMs: number;
}

export interface EditorShellProps {
  product: ProductDefinition;
  palette: Palette;
  fonts: FontCatalog;
  /** The product's templates (none: the Design tab is hidden and the editor starts from the plain product). */
  templates: readonly Template[];
  /** The design to start from: a new one (with the first template applied) or one brought back. */
  initialDesign: DesignDocument;
  /** Show the start card (a new design only; 7.2). */
  showStartCard?: boolean;
  /**
   * Show the one-time hint ("Drag to turn. Tap something to change it.", 7.4) for this design. Default: on a
   * new design (`showStartCard`). It shows after the start card, never over the garment, and goes at the first
   * press on the stage.
   */
  showHint?: boolean;
  /** The garment's short name ("Jersey"), for the top bar and the stage's description. */
  productName: string;
  /** The host's asset storage: where logos are uploaded and drawn from. */
  assets: EditorAssets;
  /** Every change to the design (not hover previews), and whether the coach got past the start card. */
  onDesignChange?: (design: DesignDocument, info: { started: boolean }) => void;
  /** How the host's last save went (the top bar's save state). Null: nothing to say yet. */
  saveState?: SaveState | null;
  /** "Save and go back" in the Done panel (9.3): the host saves the design and returns to the product page. */
  onDone?: (design: DesignDocument) => void;
  /** Close (X): leave the editor. Asked first only when the last save failed (10.6). */
  onClose?: () => void;
  /** Replaces any of the wording (translations, the founders' confirmed sentences). */
  wording?: WordingOverrides;
  slots?: EditorSlots;
  /**
   * The team list in the Players tab (docs/design/08-team-list.md section 12): everything the host gives it and
   * gets back. All optional: without it the list starts empty, with the store's usual sizes, and its changes go nowhere.
   */
  teamList?: TeamListHost;
  /** The font set text is loaded with. Default: `document.fonts`. */
  fontSet?: FontSetLike | null;
  /** The 3D texture's size (default 2048). */
  textureSize?: number;
  /** Force the flat view (no 3D). Default: the flat view only when WebGL 2 is missing or fails. */
  flatView?: boolean;
  /** Put the editor's stylesheet in the page. Default true; a host serving `EDITOR_CSS` itself passes false. */
  injectStyles?: boolean;
  /** Called with each tap-to-change timing; with `logTimings` they also go to the console (development). */
  onTiming?: (timing: EditorTiming) => void;
  /** Called after each drag, resize or turn with its frame times, whether draft quality was used, and the time to full quality (5.3). */
  onGestureTiming?: (timing: GestureTiming & { name: string }) => void;
  /** Draft quality during gestures (5.3): "auto" (default) switches below 30 frames a second. */
  draftQuality?: "auto" | "always" | "never";
  logTimings?: boolean;
  className?: string;
  style?: CSSProperties;
}

/** The editor's own size, from the element (the host decides where the editor sits). */
function useElementSize(ref: React.RefObject<HTMLElement | null>) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setSize({ width: el.clientWidth, height: el.clientHeight });
    measure();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", measure);
      return () => window.removeEventListener("resize", measure);
    }
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
  return size;
}

function useReducedMotion(): boolean {
  const query = typeof window !== "undefined" && typeof window.matchMedia === "function" ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
  const [reduced, setReduced] = useState(() => query?.matches ?? false);
  useEffect(() => {
    if (!query) return;
    const change = () => setReduced(query.matches);
    query.addEventListener("change", change);
    return () => query.removeEventListener("change", change);
  }, [query]);
  return reduced;
}

const RECENT_KEY = "fmo-editor-recent";
/** The landscape phone's side panel in list view (08-team-list.md 3.3: widened from 320 so a name has room; the stage keeps 380 px). */
const LIST_PANEL_SHORT = 400;

/** Whether the selected item stays selected when a tool opens: only in its own tool (E3c minor). */
export function keepsSelection(design: Pick<DesignDocument, "layers">, selectedId: string, tool: ToolId): boolean {
  const layer = design.layers.find((l) => l.id === selectedId);
  return layer ? toolForLayer(layer) === tool : false;
}

/** The edits that apply a design (B4): names and numbers that would be hard to read get a readable colour. */
const APPLIES_DESIGN: ReadonlySet<EditLabel> = new Set<EditLabel>(["template", "team-colour", "swap-team-colours"]);

/** The text and number items whose letters' or outline's colour differs between two designs. */
export function colourChanges(before: DesignDocument, after: DesignDocument): string[] {
  const was = new Map(before.layers.map((l) => [l.id, l]));
  return after.layers.flatMap((l) => {
    if (l.kind !== "text" && l.kind !== "number") return [];
    const old = was.get(l.id);
    if (!old || (old.kind !== "text" && old.kind !== "number")) return [];
    return old.fill.hex !== l.fill.hex || old.outline?.color.hex !== l.outline?.color.hex ? [l.id] : [];
  });
}

/** The editor API's functions (E3d, speed): stable for the shell's life, each calling the latest one. */
const HANDLER_KEYS = ["latestDesign", "commit", "begin", "preview", "end", "hoverPreview", "showSide", "focusOn", "announce", "chooseColourTarget", "markPart", "useColour", "setTyping", "openTool", "select", "setLogoNote", "setSnapping", "markTiming", "setDetent", "nudge"] as const;
type HandlerKey = (typeof HANDLER_KEYS)[number];
type ApiHandlers = Required<Pick<EditorApi, HandlerKey>>;
/** Stable functions that call the latest implementations given to `set` (set after every render of the shell). */
export function createHandlers(): { handlers: ApiHandlers; set: (next: ApiHandlers) => void } {
  let current: ApiHandlers | null = null;
  const out: Record<string, unknown> = {};
  for (const key of HANDLER_KEYS) out[key] = (...args: unknown[]) => (current?.[key] as ((...a: unknown[]) => unknown) | undefined)?.(...args);
  return {
    handlers: out as unknown as ApiHandlers,
    set: (next) => {
      current = next;
    },
  };
}

export function EditorShell(props: EditorShellProps) {
  const { product, palette, fonts, templates, assets } = props;
  const wording = useMemo(() => mergeWording(props.wording), [props.wording]);
  const root = useRef<HTMLDivElement>(null);
  const size = useElementSize(root);
  const layout = chooseLayout(size.width || 390, size.height || 844);
  // E3d (R3, R4): the panel body's gutter and the sideways rows' end fade, after every render and on scroll.
  useEffect(() => {
    if (root.current) refreshFinish(root.current);
  });
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const onScroll = (event: Event) => {
      const target = event.target as HTMLElement | null;
      if (target?.classList?.contains("fmo-scroll-row")) markRow(target);
      else if (target?.classList?.contains("fmo-panel-body")) markBody(target);
    };
    const onResize = () => refreshFinish(el);
    el.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);
    return () => {
      el.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
    };
  }, []);
  const reducedMotion = useReducedMotion();
  // A design brought back (or upgraded) gets the print-area rule once: every item inside its area.
  const history = useEditorHistory(() => ({
    design: fitDesignToAreas(props.product, props.initialDesign),
    lines: readSavedList(props.teamList?.initial, { productId: props.product.id, ...(props.teamList?.limits ? { limits: props.teamList.limits } : {}) }),
  }));
  const design = history.design;
  const designRef = useRef(design);
  useEffect(() => {
    designRef.current = design;
  });
  const canvas = useRef<DesignCanvasHandle>(null);

  const tools = useMemo(() => TOOL_ORDER.filter((t) => t !== "design" || templates.length > 0), [templates.length]);
  const [tool, setTool] = useState<ToolId | null>(null);
  const [detent, setDetent] = useState<PanelDetent>("normal");
  const [startCard, setStartCard] = useState(Boolean(props.showStartCard));
  const activeTool: ToolId | null = layout === "wide" ? (tool ?? tools[0] ?? null) : tool;
  const panelOpen = !startCard && activeTool !== null;
  const [panelSize, setPanelSize] = useState({ width: 0, height: 0 });
  const [typing, setTypingState] = useState(false);
  const [status, setStatus] = useState<{ text: string; undo: boolean } | null>(null);
  const statusTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [camera, setCamera] = useState<CameraInfo>({ side: "front", canZoomIn: true, canZoomOut: true, panned: false });
  const pointer = useRef<{ down: boolean; lastUserTurnAt: number | null }>({ down: false, lastUserTurnAt: null });
  // No WebGL 2: the flat view, with its banner (10.3). Checked once, when the editor first renders.
  const [mode, setMode] = useState<"3d" | "flat">(() => (props.flatView || (typeof document !== "undefined" && !hasWebGL2()) ? "flat" : "3d"));
  const [banner, setBanner] = useState<string | null>(() => (!props.flatView && mode === "flat" ? wording.states.noWebgl : null));
  const [load, setLoad] = useState<StageLoad>({ fraction: null, ready: false, slow: false, failed: false });
  const lastProgress = useRef({ at: 0, loaded: -1 });
  const [canvasKey, setCanvasKey] = useState(0);
  const contextLosses = useRef(0);
  const [fontsReadyOnce, setFontsReadyOnce] = useState(false);
  const [fontStatus, setFontStatus] = useState<FontStatus | null>(null);
  const [textFits, setTextFits] = useState<TextFit[]>([]);
  const [garmentView, setGarmentView] = useState<GarmentView | null>(null);
  const [garmentMeshes, setGarmentMeshes] = useState<GarmentMesh[] | null>(null);
  const bodyZone = product.pieces.find((p) => p.id === product.views.front)?.zone ?? product.zones[0]!.id;
  const [colourTarget, setColourTarget] = useState<ColourTarget>({ kind: "zone", id: bodyZone });
  const [highlight, setHighlight] = useState<ZoneHighlight | null>(null);
  // E3f: the part tapped on the model (its row in the Colours tool is marked, and so is the part on the model), what
  // the mouse is over, and the popover with a part's colours (desktop).
  const [markedPart, setMarkedPart] = useState<ColourTarget | null>(null);
  const [hovered, setHovered] = useState<CanvasHover | null>(null);
  const [partMenu, setPartMenu] = useState<{ target: ColourTarget; x: number; y: number } | null>(null);
  const markedHighlight = useMemo<ZoneHighlight | null>(() => (markedPart ? { ...(markedPart.kind === "zone" ? { zoneId: markedPart.id } : { shapeGroup: markedPart.id }), alpha: 0.5 } : null), [markedPart]);
  const flashTimers = useRef<Array<ReturnType<typeof setTimeout>>>([]);
  const [recentColours, setRecentColours] = useState<string[]>(() => {
    try {
      const parsed = JSON.parse(readLocal(RECENT_KEY) ?? "[]") as unknown;
      return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string").slice(0, 8) : [];
    } catch {
      return [];
    }
  });
  const [hover, setHover] = useState<DesignDocument | null>(null);
  const [selectedId, setSelectedIdState] = useState<string | null>(null);
  // While placing (a drag, a handle): the print area's edges and the lines snapped to, drawn over the model (5.2).
  const [guides, setGuidesState] = useState<PieceGuide[]>([]);
  const setGuides = useCallback((next: PieceGuide[]) => setGuidesState((now) => (JSON.stringify(now) === JSON.stringify(next) ? now : next)), []);
  // Snapping can be held off: Alt with a mouse, or this setting (fine-tune) on touch and for everyone (5.2).
  const [snapOn, setSnapOn] = useState(true);
  // "On this kit" is open (4.8): on phones in the panel's place, on desktop as a popover.
  const [kitOpen, setKitOpen] = useState(false);
  // The Done panel (9.2).
  const [doneOpen, setDoneOpen] = useState(false);
  /** R38: the tool panel open when the Done panel opened on a phone (it comes back when the Done panel closes). */
  const beforeDone = useRef<{ tool: ToolId; detent: PanelDetent } | null>(null);
  /** R37: the Done panel's height on a phone (its content's), for the stage's framing. */
  const [doneHeight, setDoneHeight] = useState(0);
  // What the upload checks found about each file this session (a logo without a transparent background), by asset id.
  // Kept with the files by the host when it can (S3), so "prints as a box" survives a reload.
  const [logoNotes, setLogoNotes] = useState<Record<string, LogoNote>>(() => ({ ...(props.assets.notes?.() ?? {}) }));
  // Files the design brought back refers to that are not on this device (S2).
  const [missingAssets] = useState<ReadonlySet<string>>(() => new Set(props.assets.missing ?? []));
  // A drag, resize or turn is going on (draft quality, 5.3), and which.
  const [placing, setPlacingState] = useState<string | null>(null);
  const [frozenDesign, setFrozenDesign] = useState<DesignDocument | null>(null);
  const setPlacing = useCallback((kind: string | null) => {
    setPlacingState(kind);
    setFrozenDesign(kind ? designRef.current : null);
  }, []);
  const setSelectedId = useCallback((id: string | null) => setSelectedIdState(id), []);
  const [saveInfo, setSaveInfo] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const timing = useRef<{ name: string; start: number } | null>(null);
  const hoverDesign = hover ?? design;

  // The stage's tone follows the body's colour, with a gap so it does not flicker (12.2).
  const [tone, setTone] = useState<StageTone>(() => nextStageTone("normal", bodyColour(product, design)?.hex ?? null));
  const nextTone = nextStageTone(tone, bodyColour(product, hoverDesign)?.hex ?? null);
  if (nextTone !== tone) setTone(nextTone);


  // ---- The status line (10.5): polite, timed.
  const announce = useCallback((text: string, options: { undo?: boolean; ms?: number } = {}) => {
    if (statusTimer.current) clearTimeout(statusTimer.current);
    setStatus({ text, undo: Boolean(options.undo) });
    statusTimer.current = setTimeout(() => setStatus(null), options.ms ?? 3000);
  }, []);
  useEffect(() => () => {
    if (statusTimer.current) clearTimeout(statusTimer.current);
    flashTimers.current.forEach(clearTimeout);
  }, []);

  // The items whose colours the coach chose this session (B4: never recoloured when a design is applied).
  const [coachColoured] = useState(() => new Set<string>());
  const readable = useCallback((d: DesignDocument) => makeReadable(product, d, palette, { keep: coachColoured }), [product, palette, coachColoured]);
  // ---- Edits: one undo step each; an edit that throws is not applied (10.7).
  const commit = useCallback(
    (edit: (d: DesignDocument) => DesignDocument, label: EditLabel): boolean => {
      try {
        setHover(null);
        // The print-area rule may have made an item smaller to fit: never silently (B2).
        const before = designRef.current;
        const { value: edited, notices } = collectFitNotices(() => edit(before));
        // A design applied (a template, the team's colours): every name and number readable (B4), except
        // colours the coach chose; and the coach's own colour choices are remembered.
        const value = APPLIES_DESIGN.has(label) ? makeReadable(product, edited, palette, { keep: coachColoured }) : edited;
        if (label === "colour" || label === "outline") for (const id of colourChanges(before, value)) coachColoured.add(id);
        // The step says what changed, in the coach's words (10.5: "Body colour", "Logo position").
        history.commit(value, namedLabel(wording, product, label, before, value) as EditLabel);
        if (notices.length > 0) announce(wording.selection.madeSmaller);
        return true;
      } catch (error) {
        console.error("[editor] edit refused:", error);
        announce(wording.states.changeFailed);
        return false;
      }
    },
    [history, announce, wording, product, palette, coachColoured],
  );
  // E3e: a step (arrow key, fine-tune) that the print area stops shows the area's lines for a moment, as a drag does.
  const limitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (limitTimer.current) clearTimeout(limitTimer.current);
    },
    [],
  );
  const nudge = useCallback(
    (layerId: string, dx: number, dy: number) => {
      const layer = designRef.current.layers.find((l) => l.id === layerId);
      if (!layer) return;
      const edit = (d: DesignDocument) => nudgeLayer(d, layerId, dx, dy, { product });
      const moved = edit(designRef.current).layers.find((l) => l.id === layerId);
      const stopped = Boolean(moved) && stoppedByArea(layer, moved!, dx, dy);
      commit(edit, "move");
      if (!stopped) return;
      setGuides(printAreaLines(product, layer.pieceId).map((l) => ({ ...l, kind: "area" as const })));
      if (limitTimer.current) clearTimeout(limitTimer.current);
      limitTimer.current = setTimeout(() => setGuides([]), 1200);
    },
    [commit, product, setGuides],
  );
  const preview = useCallback(
    (edit: (d: DesignDocument) => DesignDocument) => {
      try {
        history.preview(edit(designRef.current));
      } catch (error) {
        console.error("[editor] edit refused:", error);
      }
    },
    [history],
  );

  // ---- The team list (docs/design/08-team-list.md): its lines live in the editor's one undo history, beside the
  // design; the chosen line (the shirt on the stage) and what has been left (when a check shows) are view state.
  const teamHost = props.teamList;
  const listSizes = teamHost?.sizes ?? DEFAULT_TEAM_SIZES;
  const sizeTable = useMemo(() => buildSizeTable(listSizes), [listSizes]);
  const listLimits = useMemo(() => resolveLimits(teamHost?.limits), [teamHost?.limits]);
  const printsName = design.layers.some((l) => l.role === "player-name");
  const printsNumber = design.layers.some((l) => l.role === "player-number");
  const prints = useMemo(() => ({ name: printsName, number: printsNumber }), [printsName, printsNumber]);
  const lines = history.lines as readonly EditorLine[];
  const linesRef = useRef(lines);
  useEffect(() => {
    linesRef.current = lines;
  });
  const hostLimits = teamHost?.limits;
  const hostMinimum = teamHost?.minimum?.pieces ?? null;
  const listSettings = useMemo(() => ({ prints, sizes: listSizes, ...(hostLimits ? { limits: hostLimits } : {}), minimum: hostMinimum }), [prints, listSizes, hostLimits, hostMinimum]);
  const analysis = useMemo(() => analyseList(lines, listSettings), [lines, listSettings]);
  const [chosen, setChosen] = useState<string | null>(null);
  // Only an empty list has no chosen line: the first line when the editor opens, the next one after a removal (7.3).
  const chosenId = chosen !== null && lines.some((l) => l.id === chosen) ? chosen : (lines[0]?.id ?? null);
  const [seen, setSeen] = useState<SeenMap>({});
  const [revealAll, setRevealAll] = useState(false);
  const [playersView, setPlayersView] = useState<"list" | "style" | "paste">("list");
  const [pasteText, setPasteText] = useState("");
  const [listMemory] = useState(() => {
    let scrollTop = 0;
    return { get: () => scrollTop, set: (value: number) => void (scrollTop = value) };
  });
  const entered = useRef<string[]>([]);
  useEffect(() => {
    for (const l of lines) if (!entered.current.includes(l.id)) entered.current.push(l.id);
  }, [lines]);
  // The shirt shows the chosen line (7.1): its name and number as they would print, never written into the design.
  const [previewedLine, setPreviewedLine] = useState<EditorLine | null>(null);
  const chosenLine = previewedLine ?? (lines.length > 0 ? lines.find((l) => l.id === chosenId) : undefined);
  const shirt = chosenLine ? playerForShirt(chosenLine, prints) : null;
  // Typing never waits for the shirt (13.5): the shirt follows the keys a moment after they pause; choosing another line shows its shirt at once.
  const shirtKey = shirt ? `${shirt.name}\u0000${shirt.number}` : null;
  const shirtShown = useTrailing(shirtKey, 120, previewedLine?.id ?? chosenId);
  const shirtName = shirtShown === null ? null : shirtShown.split("\u0000")[0]!;
  const shirtNumber = shirtShown === null ? null : (shirtShown.split("\u0000")[1] ?? "");
  const withPlayer = useCallback((d: DesignDocument): DesignDocument => (shirtName === null || shirtNumber === null ? d : designWithPlayer(d, { name: shirtName, number: shirtNumber })), [shirtName, shirtNumber]);
  const withPlayerRef = useRef(withPlayer);
  useEffect(() => {
    withPlayerRef.current = withPlayer;
  });
  const displayDesign = useMemo(() => withPlayer(hoverDesign), [withPlayer, hoverDesign]);
  const describedDesign = useMemo(() => withPlayer(design), [withPlayer, design]);
  const nameOfLine = useCallback(
    (id: string) => {
      const at = linesRef.current.findIndex((l) => l.id === id);
      const line = linesRef.current[at];
      return line && line.name !== "" ? line.name : fill(wording.teamList.unnamedPlayer, { i: at + 1 });
    },
    [wording],
  );
  const markSeen = useCallback((id: string, part: "left" | "name" | "number" | "size") => setSeen((s) => (s[id]?.[part] ? s : { ...s, [id]: { ...s[id], [part]: true } })), []);
  const maxLines = listLimits.maxLines;
  const maxCount = listLimits.maxCount;
  const minCount = listLimits.minCount;
  // A field's undo gesture opens on its FIRST change, not when it gets focus, and a field that was only looked at ends
  // nothing: choosing a line (focus in, focus out) is not an edit, so it changes no history and renders the editor once
  // (TL4: a line chosen within 100 ms; each history change is a render of the whole editor).
  const fieldLabel = useRef<string | null>(null);
  const gestureOpen = useRef(false);
  const beginField = useCallback(
    (id: string, field: "name" | "number" | "size") => {
      fieldLabel.current = `list-${field}|${nameOfLine(id)}`;
    },
    [nameOfLine],
  );
  const typeField = useCallback(
    (id: string, field: "name" | "number" | "size", value: string) => {
      if (teamHost?.locked) return;
      if (!gestureOpen.current && fieldLabel.current !== null) {
        history.beginLines(fieldLabel.current);
        gestureOpen.current = true;
      }
      history.previewLines((ls) => setLineField(ls as EditorLine[], id, field, value));
    },
    [history, teamHost?.locked],
  );
  const leaveField = useCallback(
    (id: string, field: "name" | "number" | "size") => {
      markSeen(id, field);
      // The clean-up on leaving (4.1) is an edit only when it changes the value.
      const needsCleaning = cleanField(linesRef.current as EditorLine[], id, field, sizeTable) !== linesRef.current;
      if (gestureOpen.current || needsCleaning) {
        if (!gestureOpen.current && fieldLabel.current !== null) history.beginLines(fieldLabel.current);
        history.previewLines((ls) => cleanField(ls as EditorLine[], id, field, sizeTable));
        history.endLines();
        gestureOpen.current = false;
      }
      fieldLabel.current = null;
    },
    [history, markSeen, sizeTable],
  );
  const leaveLine = useCallback((id: string) => markSeen(id, "left"), [markSeen]);
  const endTyping = useCallback(() => {
    if (!gestureOpen.current) return;
    gestureOpen.current = false;
    history.endLines();
  }, [history]);
  const addPlayer = useCallback(() => {
    if (teamHost?.locked || linesRef.current.length >= maxLines) return null;
    const line = newLine();
    history.beginLines("list-add");
    gestureOpen.current = true;
    history.previewLines((ls) => addLine(ls as EditorLine[], line));
    setChosen(line.id);
    return line.id;
  }, [history, maxLines, teamHost?.locked]);
  const removePlayer = useCallback(
    (id: string, options?: { silent?: boolean }) => {
      const current = linesRef.current;
      const at = current.findIndex((l) => l.id === id);
      if (at < 0 || teamHost?.locked) return;
      const name = nameOfLine(id);
      const after = current[at + 1] ?? current[at - 1];
      if (options?.silent) {
        history.beginLines("list-remove");
        history.previewLines((ls) => removeLine(ls as EditorLine[], id));
        history.endLines();
        gestureOpen.current = false;
      } else {
        history.commitLines((ls) => removeLine(ls as EditorLine[], id), `list-remove|${name}`);
        announce(fill(wording.teamList.removed, { name }), { undo: true, ms: 6000 });
      }
      setChosen(after?.id ?? null);
    },
    [history, nameOfLine, announce, wording, teamHost?.locked],
  );
  const movePlayer = useCallback((id: string, delta: -1 | 1) => !teamHost?.locked && history.commitLines((ls) => moveLine(ls as EditorLine[], id, delta), `list-move|${nameOfLine(id)}`), [history, nameOfLine, teamHost?.locked]);
  const sortPlayers = useCallback((by: SortBy) => !teamHost?.locked && history.commitLines((ls) => sortLines(ls as EditorLine[], by, { sizes: listSizes, entered: entered.current }), "list-sort"), [history, listSizes, teamHost?.locked]);
  const setPlayerCount = useCallback((id: string, count: number) => !teamHost?.locked && history.commitLines((ls) => setLineCount(ls as EditorLine[], id, count), `list-count|${nameOfLine(id)}`), [history, nameOfLine, teamHost?.locked]);
  const setPlayerFlag = useCallback((id: string, flag: "noName" | "noNumber", on: boolean) => !teamHost?.locked && history.commitLines((ls) => setLineFlag(ls as EditorLine[], id, flag, on), `list-flag|${nameOfLine(id)}`), [history, nameOfLine, teamHost?.locked]);
  const convertDigits = useCallback((to: "western" | "arabic-indic") => !teamHost?.locked && history.commitLines((ls) => convertAllDigits(ls as EditorLine[], to), "list-digits"), [history, teamHost?.locked]);
  const setSizeCount = useCallback((code: string, count: number) => !teamHost?.locked && history.commitLines((ls) => setSizeCountLines(ls as EditorLine[], code, count, { table: sizeTable, maxCount }), `list-count|${code}`), [history, sizeTable, maxCount, teamHost?.locked]);
  // The player chip (7.2): previous and next in list order; its words are said politely (a hidden live region), never in the status line, which would take the chip's place.
  const [stepNote, setStepNote] = useState("");
  const [revealTick, setRevealTick] = useState(0);
  const chosenIdRef = useRef(chosenId);
  useEffect(() => {
    chosenIdRef.current = chosenId;
  });
  const step = useCallback(
    (direction: -1 | 1) => {
      const current = linesRef.current;
      const at = Math.max(0, current.findIndex((l) => l.id === chosenIdRef.current));
      const next = current[at + direction];
      if (!next) return;
      setChosen(next.id);
      setStepNote(fill(wording.teamList.chip.stepped, { i: at + direction + 1, n: current.length, name: next.name || fill(wording.teamList.chip.unnamed, { i: at + direction + 1 }) }));
      setRevealTick((n) => n + 1);
    },
    [wording],
  );
  const reveal = useCallback(() => setRevealTick((n) => n + 1), []);
  const revealOnOpen = useRef(false);
  const consumeReveal = useCallback(() => {
    const was = revealOnOpen.current;
    revealOnOpen.current = false;
    return was;
  }, []);
  // The phone's list view frames the close-up of the name and number; the toggle goes back to the whole shirt and again (3.2).
  const [wholeShirt, setWholeShirt] = useState(false);

  // Pasting (5.2): the lines are added in ONE undo step, the first added line is chosen, and the checks show on them like on typed lines.
  const addPasted = useCallback(
    (added: readonly EditorLine[], mode: PasteMode) => {
      if (added.length === 0 || teamHost?.locked) return;
      const n = added.length;
      const words = n === 1 ? wording.teamList.onePlayer : fill(wording.teamList.players, { n });
      history.commitLines((ls) => applyPaste(ls as EditorLine[], added, mode, maxLines), `list-paste|${words}`);
      setSeen((s) => ({ ...s, ...Object.fromEntries(added.map((l) => [l.id, { left: true, name: true, number: true, size: true }])) }));
      setChosen(added[0]!.id);
      setPasteText("");
      setPlayersView("list");
      announce(n === 1 ? wording.teamList.paste.addedOne : fill(wording.teamList.paste.added, { n }));
    },
    [history, maxLines, announce, wording, teamHost?.locked],
  );
  const openPaste = useCallback(
    (text?: string) => {
      if (teamHost?.locked) return;
      if (text !== undefined) setPasteText(text);
      setPlayersView("paste");
    },
    [teamHost?.locked],
  );
  const revealAllProblems = useCallback(() => setRevealAll(true), []);
  const compactLayout = layout === "compact";
  const setKeyboard = useCallback(
    (on: boolean) => {
      if (compactLayout) setTypingState(on);
    },
    [compactLayout],
  );
  const nameShrunk = textFits.some((f) => f.role === "player-name" && f.shrunk);
  const closeUpLayerId = design.layers.find((l) => l.role === "player-name")?.id ?? design.layers.find((l) => l.role === "player-number")?.id ?? null;
  const teamNoun = teamHost?.noun ?? DEFAULT_TEAM_NOUN;
  const teamMinimum = teamHost?.minimum ?? null;
  const openSizeChart = teamHost?.openSizeChart ?? null;
  const lockedList = teamHost?.locked ?? null;
  const keyboard = typing && compactLayout;
  const listLimitsView = useMemo(() => ({ maxLines, minCount, maxCount }), [maxLines, minCount, maxCount]);
  const teamApi: TeamListApi = useMemo(
    () => ({
      lines,
      analysis,
      prints,
      sizes: listSizes,
      sizeTable,
      noun: teamNoun,
      minimum: teamMinimum,
      limits: listLimitsView,
      openSizeChart,
      locked: lockedList,
      chosenId,
      choose: setChosen,
      step,
      stepNote,
      reveal,
      revealTick,
      seen,
      revealAll,
      view: playersView,
      setView: setPlayersView,
      consumeReveal,
      previewPlayer: setPreviewedLine,
      pasteText,
      setPasteText,
      openPaste,
      addPasted,
      memory: listMemory,
      keyboard,
      beginField,
      typeField,
      leaveField,
      leaveLine,
      endTyping,
      add: addPlayer,
      remove: removePlayer,
      move: movePlayer,
      sort: sortPlayers,
      setCount: setPlayerCount,
      setFlag: setPlayerFlag,
      convertDigits,
      setSizeCount,
      revealAllProblems,
      setKeyboard,
      nameShrunk,
      closeUpLayerId,
    }),
    [lines, analysis, prints, listSizes, sizeTable, teamNoun, teamMinimum, listLimitsView, openSizeChart, lockedList, chosenId, step, stepNote, reveal, revealTick, seen, revealAll, playersView, consumeReveal, setPreviewedLine, pasteText, openPaste, addPasted, listMemory, keyboard, beginField, typeField, leaveField, leaveLine, endTyping, addPlayer, removePlayer, movePlayer, sortPlayers, setPlayerCount, setPlayerFlag, convertDigits, setSizeCount, revealAllProblems, setKeyboard, nameShrunk, closeUpLayerId],
  );
  // What the editor hands to its host (12.2, 11.1): the list and its report, after a second without changes.
  const [hostBridge] = useState(() => {
    let current: TeamListHost | undefined;
    return { get: () => current, set: (next: TeamListHost | undefined) => void (current = next) };
  });
  useLayoutEffect(() => hostBridge.set(teamHost));
  const lastHanded = useRef<string | null>(null);
  const [handOver] = useState(() => createHandOver<{ saved: SavedTeamList; report: TeamListReport }>({ delayMs: () => hostBridge.get()?.debounceMs ?? 1000, emit: ({ saved, report }) => hostBridge.get()?.onChange?.(saved, report) }));
  useEffect(() => {
    if (!hostBridge.get()?.onChange) return;
    const saved = toSavedList(lines, product.id, { prints, sizes: listSizes });
    const key = JSON.stringify([saved.lines, saved.prints]);
    // The list as it opened is not a change.
    if (lastHanded.current === null) {
      lastHanded.current = key;
      return;
    }
    if (key === lastHanded.current) return;
    lastHanded.current = key;
    handOver.schedule({ saved, report: analysis.report });
  }, [lines, prints, listSizes, product.id, analysis.report, handOver, hostBridge]);
  const flushList = useCallback(() => handOver.flush(), [handOver]);
  useEffect(() => () => handOver.flush(), [handOver]);
  // A name or number item selected on the model opens the Players tab on its style, not on the list (the item's own controls).
  const selectedRole = selectedId ? design.layers.find((l) => l.id === selectedId)?.role : undefined;
  const [styleFor, setStyleFor] = useState<string | null>(null);
  if (styleFor !== selectedId) {
    setStyleFor(selectedId);
    if (selectedRole === "player-name" || selectedRole === "player-number") setPlayersView("style");
  }

  // ---- The camera: only in answer to the coach's own action, never while they hold the garment (6.3).
  const cameraFree = () => mayMoveCamera({ now: performance.now(), pointerDown: pointer.current.down, lastUserTurnAt: pointer.current.lastUserTurnAt });
  const showSide = useCallback((side: "front" | "back" | "left" | "right") => {
    if (cameraFree()) canvas.current?.showSide(side);
  }, []);
  const focusOn = useCallback(
    (layerId: string | null, options?: { zoom?: boolean }) => {
      if (layerId === null || cameraFree()) canvas.current?.focusOn(layerId, options);
    },
    [],
  );

  // ---- Undo and redo, with what changed said in words, and the camera turned to it (10.5).
  const turnToChange = useCallback(
    (from: DesignDocument, to: DesignDocument | undefined) => {
      if (!to) return;
      const before = new Map(from.layers.map((l) => [l.id, JSON.stringify(l)]));
      const changed = to.layers.find((l) => before.get(l.id) !== JSON.stringify(l)) ?? from.layers.find((l) => !to.layers.some((x) => x.id === l.id));
      if (!changed) return;
      const side = layerSide(product, changed);
      if (side && side !== canvas.current?.getSide()) showSide(side);
    },
    [product, showSide],
  );
  // B1: a signed list is read-only, and one history holds the design and the list. While it is locked nothing is undone or
  // redone at all (the buttons are off too): a step in either direction could carry the list back to an earlier state.
  const listLocked = Boolean(teamHost?.locked);
  const undo = useCallback(() => {
    if (!history.canUndo || listLocked) return;
    const target = (history.history.gestureStart ? history.history.gestureStart.value : history.history.past[history.history.past.length - 1])?.design;
    announce(fill(wording.states.undone, { change: changeWords(wording, history.undoLabel) }));
    turnToChange(design, target);
    history.undo();
  }, [history, announce, wording, turnToChange, design, listLocked]);
  const redo = useCallback(() => {
    if (!history.canRedo || listLocked) return;
    announce(fill(wording.states.redone, { change: changeWords(wording, history.redoLabel) }));
    turnToChange(design, history.history.future[0]?.design);
    history.redo();
  }, [history, announce, wording, turnToChange, design, listLocked]);

  // ---- Tools.
  const toolsReady = mode === "flat" || (load.ready && fontsReadyOnce);
  // The team list on a phone frames the back close-up: the name and number fill the free stage (3.2). The camera
  // moves only when the list opens (an action of the coach's), never while lines are chosen; it goes back when the list closes.
  const listView = activeTool === "players" && (playersView === "list" || playersView === "paste") && !startCard;
  const listTyping = typing && layout === "compact" && listView;
  const closeUpLayer = closeUpLayerId;
  const listCloseUp = layout === "compact" && listView && !doneOpen && toolsReady && closeUpLayer !== null && !wholeShirt;
  const wasCloseUp = useRef(false);
  // The close-up is aimed at the free stage, so it is aimed again once the panel's height has settled (the keyboard
  // opening or closing changes it).
  const [settledPanel, setSettledPanel] = useState(0);
  useEffect(() => {
    const timer = setTimeout(() => setSettledPanel(panelSize.height), 280);
    return () => clearTimeout(timer);
  }, [panelSize.height]);
  useEffect(() => {
    if (listCloseUp) {
      wasCloseUp.current = true;
      focusOn(closeUpLayer, { zoom: true });
    } else if (wasCloseUp.current) {
      wasCloseUp.current = false;
      canvas.current?.focusOn(null);
    }
  }, [listCloseUp, closeUpLayer, focusOn, settledPanel]);
  const fontsLoading = (fontStatus?.loading.length ?? 0) > 0;
  const fontsFailed = (fontStatus?.failed.length ?? 0) > 0 || (fontStatus?.missing.length ?? 0) > 0;
  const openTool = useCallback(
    (next: ToolId, nextDetent: PanelDetent = "normal", options: { turn?: boolean } = {}) => {
      setTool(next);
      setDetent(nextDetent);
      setStartCard(false);
      setKitOpen(false);
      if (next === "players") {
        setPlayersView("list");
        setWholeShirt(false);
      }
      // The camera turns to the side the tool works on (6.3), unless the coach tapped an item on the model
      // (they are already looking at it).
      if (options.turn === false) return;
      if (next === "players") showSide("back");
      else if (next === "team") {
        const name = designRef.current.layers.find((l) => l.role === "team-name");
        showSide(name ? (layerSide(product, name) ?? "front") : "front");
      } else if (next === "logos") showSide("front");
    },
    [showSide, product],
  );
  // The Done panel's team section (11.2): "Show", "Add players" and the fix and add buttons close the panel and open the list, at the first line to fix.
  const showTeamList = useCallback(
    (target: "fix" | "players" | "add") => {
      setDoneOpen(false);
      beforeDone.current = null;
      revealOnOpen.current = true;
      openTool("players", layout === "compact" ? "expanded" : "normal", { turn: true });
      if (target === "fix") {
        setRevealAll(true);
        const first = nextToFix(linesRef.current, analysis.toFix, null, 1);
        if (first) setChosen(first);
      } else if (target === "add") addPlayer();
    },
    [analysis.toFix, openTool, layout, addPlayer],
  );
  const onTab = (next: ToolId) => {
    if (!toolsReady) {
      announce(wording.tools.almostReady);
      return;
    }
    gestures.finish("tool-change");
    setMarkedPart(null);
    setPartMenu(null);
    // A tool the selected item does not belong to: the item is let go (E3c minor), so no handles or
    // "Turn to edit" stay over another tool's view.
    if (selectedId && keepsSelection(designRef.current, selectedId, next) === false) setSelectedId(null);
    if (startCard) setStartCard(false);
    if (kitOpen) {
      openTool(next, detent === "expanded" || (next === "players" && layout === "compact") ? "expanded" : "normal");
      return;
    }
    if (activeTool === next && layout !== "wide") {
      setTool(null);
      return;
    }
    // Changing tools keeps an expanded panel expanded (3.3); the team list opens at the expanded height (3.2).
    openTool(next, detent === "expanded" || (next === "players" && layout === "compact") ? "expanded" : "normal");
  };
  const closePanel = useCallback(() => {
    setMarkedPart(null);
    if (layout !== "wide") setTool(null);
    setDetent("normal");
  }, [layout]);

  // Back (the phone's, or the browser's) closes a panel on compact (NN/g; 06-editor.md 3.3).
  const closePanelRef = useRef(closePanel);
  useEffect(() => {
    closePanelRef.current = closePanel;
  });
  const compactPanel = layout === "compact" && (panelOpen || startCard);
  useEffect(() => {
    if (!compactPanel || typeof window === "undefined") return;
    let pushed = false;
    let popped = false;
    const timer = setTimeout(() => {
      window.history.pushState({ ...(window.history.state as object | null), fmoPanel: true }, "");
      pushed = true;
    }, 0);
    const onPop = () => {
      popped = true;
      setStartCard(false);
      closePanelRef.current();
    };
    window.addEventListener("popstate", onPop);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("popstate", onPop);
      if (pushed && !popped && (window.history.state as { fmoPanel?: boolean } | null)?.fmoPanel) window.history.back();
    };
  }, [compactPanel]);

  // Keyboard: undo and redo (Ctrl or Cmd + Z, Shift for redo, Ctrl + Y), Esc closes the panel or deselects.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typingInField = !!target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
      const mod = event.ctrlKey || event.metaKey;
      if (mod && !typingInField && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
      } else if (mod && !typingInField && event.key.toLowerCase() === "y") {
        event.preventDefault();
        redo();
      } else if (event.key === "Escape" && !typingInField) {
        if (partMenu) setPartMenu(null);
        else if (kitOpen) setKitOpen(false);
        else if (selectedId) setSelectedId(null);
        else if (panelOpen && layout !== "wide") closePanel();
      } else if (selectedId && !typingInField && !mod && (target === document.body || target?.closest?.(".fmo-stage, .fmo-context"))) {
        const step = keyEdit(event.key, event.shiftKey);
        if (!step) return;
        event.preventDefault();
        if (step.kind === "delete") {
          if (commit((d) => removeLayer(d, selectedId), "remove-item")) setSelectedId(null);
        } else if (step.kind === "nudge") nudge(selectedId, step.dx, step.dy);
        else if (step.kind === "scale") commit((d) => scaleLayerBy(d, selectedId, step.factor, { product }), "resize");
        else commit((d) => rotateLayerBy(d, selectedId, step.degrees, { product }), "rotate");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo, selectedId, setSelectedId, panelOpen, layout, closePanel, commit, nudge, product, kitOpen, partMenu]);

  // ---- The zone flash (4.3): white then ink, 600 ms, fading; a still outline for 1.5 s with reduced motion.
  const chooseColourTarget = useCallback(
    (target: ColourTarget, flash = true) => {
      setColourTarget(target);
      flashTimers.current.forEach(clearTimeout);
      flashTimers.current = [];
      if (!flash) return;
      const base = target.kind === "zone" ? { zoneId: target.id } : { shapeGroup: target.id };
      setHighlight({ ...base, alpha: 1 });
      if (reducedMotion) flashTimers.current.push(setTimeout(() => setHighlight(null), 1500));
      else {
        flashTimers.current.push(setTimeout(() => setHighlight({ ...base, alpha: 0.5 }), 300));
        flashTimers.current.push(setTimeout(() => setHighlight(null), 600));
      }
    },
    [reducedMotion],
  );
  // E3f: a tap or click on a part of the garment, from any tool. Desktop: its colour row opens by the click (a
  // popover). A phone: the Colours tool opens on that part's row, the part marked on the model. A tap on the stage lets go.
  const onPartTap = useCallback(
    (tap: ZoneTap | null) => {
      setPartMenu(null);
      setMarkedPart(null);
      const action = tap ? partTapAction({ zoneId: tap.zoneId, shapeGroup: tap.shapeGroup, layout, startCard, doneOpen, typing }) : null;
      if (!tap || !action) return;
      setColourTarget(action.target);
      if (action.open === "popover") setPartMenu({ target: action.target, x: tap.x ?? 0, y: tap.y ?? 0 });
      else {
        setMarkedPart(action.target);
        openTool("colours", detent === "expanded" ? "expanded" : "normal", { turn: false });
      }
    },
    [startCard, doneOpen, typing, layout, openTool, detent],
  );

  // ---- Typing (3.3): on a phone the dock hides, the panel shrinks to the field, the camera frames the item.
  const setTyping = useCallback(
    (layerId: string | null) => {
      setTypingState(layerId !== null);
      if (layerId) focusOn(layerId, { zoom: layout === "compact" });
      else canvas.current?.focusOn(null);
    },
    [focusOn, layout],
  );

  // ---- The model: progress, slow connection, failure (10.1, 10.2), the cards' view of the garment.
  const buildView = useCallback(
    (model: LoadedModel) => {
      const run = () => {
        try {
          const meshes = extractGarmentMeshes(model.scene, product);
          setGarmentMeshes(meshes);
          setGarmentView(renderGarmentView(meshes, { width: CARD_WIDTH, height: CARD_HEIGHT }));
        } catch (error) {
          console.error("[editor] template cards:", error);
        }
      };
      const idle = (globalThis as { requestIdleCallback?: (fn: () => void, options?: { timeout: number }) => void }).requestIdleCallback;
      if (idle) idle(run, { timeout: 800 });
      else setTimeout(run, 50);
    },
    [product],
  );
  const onLoadProgress = useCallback((p: ModelLoadProgress) => {
    if (p.loaded !== lastProgress.current.loaded) lastProgress.current = { at: performance.now(), loaded: p.loaded };
    setLoad((l) => ({ ...l, fraction: p.fraction }));
  }, []);
  const onModelReady = useCallback(
    (model: LoadedModel) => {
      setLoad((l) => ({ ...l, ready: true, slow: false, failed: false }));
      buildView(model);
    },
    [buildView],
  );
  useEffect(() => {
    if (mode !== "3d" || load.ready || load.failed) return;
    const started = performance.now();
    lastProgress.current = { at: started, loaded: -1 };
    const timer = setInterval(() => {
      const now = performance.now();
      if (now - started > 8000) setLoad((l) => (l.slow ? l : { ...l, slow: true }));
      if (now - lastProgress.current.at > 30000) setLoad((l) => ({ ...l, failed: true }));
    }, 1000);
    return () => clearInterval(timer);
  }, [mode, load.ready, load.failed, canvasKey]);
  // The flat view still needs the garment's geometry for the template cards (no WebGL needed to read it).
  useEffect(() => {
    if (mode !== "flat" || garmentView) return;
    let alive = true;
    loadModel(product.model.url).promise.then((model) => alive && buildView(model), () => undefined);
    return () => {
      alive = false;
    };
  }, [mode, garmentView, product, buildView]);
  // Fonts: tools wait for the design's fonts once (10.1), at most 6 s.
  useEffect(() => {
    if (fontsReadyOnce || mode === "flat") return;
    const timer = setTimeout(() => setFontsReadyOnce(true), 6000);
    return () => clearTimeout(timer);
  }, [fontsReadyOnce, mode]);
  const onFontStatus = useCallback((s: FontStatus) => {
    setFontStatus(s);
    if (s.loading.length === 0) setFontsReadyOnce(true);
  }, []);

  // The performance log: a tap to the texture drawn, and to the next frame (11.3; E5 measures on phones).
  const onTiming = useRef(props.onTiming);
  useEffect(() => {
    onTiming.current = props.onTiming;
  });
  const logTimings = props.logTimings;
  const onGestureTimingRef = useRef(props.onGestureTiming);
  useEffect(() => {
    onGestureTimingRef.current = props.onGestureTiming;
  });
  const lastPlacing = useRef<string | null>(null);
  useEffect(() => {
    if (placing) lastPlacing.current = placing;
  }, [placing]);
  const onTextureDrawn = useCallback(
    (info: TextureDrawInfo) => {
      // Only when it changed (S1: a new array every drawing re-rendered the whole editor after each tap).
      setTextFits((now) => (JSON.stringify(now) === JSON.stringify(info.textFits) ? now : info.textFits));
      const pending = timing.current;
      if (!pending) return;
      timing.current = null;
      const drawn = performance.now() - pending.start;
      requestAnimationFrame(() => {
        const result: EditorTiming = { name: pending.name, drawnMs: drawn, frameMs: performance.now() - pending.start };
        onTiming.current?.(result);
        if (logTimings) console.info(`[editor timing] ${result.name}: tap to texture drawn ${result.drawnMs.toFixed(1)} ms, to next frame ${result.frameMs.toFixed(1)} ms`);
      });
    },
    [logTimings],
  );

  // ---- Saving is the host's: report every real change.
  const onDesignChange = useRef(props.onDesignChange);
  useEffect(() => {
    onDesignChange.current = props.onDesignChange;
  });
  const reported = useRef<{ design: DesignDocument | null; started: boolean }>({ design: null, started: !startCard });
  const untouched = useRef(design);
  useEffect(() => {
    const started = !startCard;
    if (reported.current.design === design && reported.current.started === started) return;
    const first = reported.current.design === null;
    const same = reported.current.design === design;
    reported.current = { design, started };
    // E3e: the start card closing on a design nobody has changed (a tap on an item) is not a change to save: the
    // line "Saved on this device" waits for a real change.
    if (shouldReportChange({ first, sameDesign: same, isInitial: design === untouched.current, startedDiffers: started !== !props.showStartCard })) onDesignChange.current?.(design, { started });
  }, [design, startCard, props.showStartCard]);
  // Leaving after a failed save: the browser asks first (10.6).
  useEffect(() => {
    if (props.saveState !== "failed") return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [props.saveState]);

  // ---- Files (S7): a stored file no design state refers to any more (the present, every undo and redo step,
  // an open gesture's start) is let go: the host deletes it and revokes its URL. Files of this session only.
  const [knownAssets] = useState(() => new Set<string>());
  const releaseFile = assets.release;
  useEffect(() => {
    const h = history.history;
    for (const state of [h.present, ...h.past, ...h.future]) for (const id of designAssetIds(state.design)) knownAssets.add(id);
    if (!releaseFile) return;
    for (const id of assetsNoLongerUsed(knownAssets, [h.present.design, ...h.past.map((x) => x.design), ...h.future.map((x) => x.design), h.gestureStart?.value.design, gestureDraft.current?.start])) {
      knownAssets.delete(id);
      releaseFile(id);
    }
  }, [history.history, knownAssets, releaseFile]);

  // ---- A logo whose file is missing on this device (S2): said once, when the design opens.
  useEffect(() => {
    const missing = designAssetIds(designRef.current).filter((id) => missingAssets.has(id));
    if (missing.length > 0) announce(wording.logos.missingFile, { ms: 10000 });
  }, [missingAssets, announce, wording]);

  // ---- The one hint, once per design (7.4; E3b): after the start card, in its own band above the garment,
  // gone at the first press on the stage (a drag or a tap).
  // E3d (R26): it also goes at the first selection, the first tool change or after 8 s, and never shows with the
  // contextual bar or the status line (one row, 4.7).
  const [hintSeen, setHintSeen] = useState(() => !(props.showHint ?? props.showStartCard ?? false));
  const touchDevice = typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches;
  const hintPending = load.ready && !hintSeen && !startCard && !doneOpen && mode === "3d";
  const hint = hintShows({ pending: hintPending, selected: Boolean(selectedId), status: Boolean(status) }) ? (touchDevice ? wording.selection.hint : wording.selection.hintPointer) : null;
  const dismissHint = () => {
    if (!hintSeen) setHintSeen(true);
  };
  const hintTool = useRef<{ tool: ToolId | null } | null>(null);
  useEffect(() => {
    if (!hintPending) {
      hintTool.current = null;
      return;
    }
    hintTool.current ??= { tool: activeTool };
    if (hintEnds({ selected: Boolean(selectedId), toolAtShow: hintTool.current.tool, tool: activeTool })) {
      setHintSeen(true);
      return;
    }
    const timer = setTimeout(() => setHintSeen(true), HINT_MS);
    return () => clearTimeout(timer);
  }, [hintPending, selectedId, activeTool]);

  // ---- The stage's description in words, debounced (11.2).
  const [description, setDescription] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setDescription(describeStage(wording, product, describedDesign, { productName: props.productName, side: camera.side, palette })), description ? 1000 : 0);
    return () => clearTimeout(timer);
  }, [describedDesign, camera.side, wording, product, palette, props.productName, description]);

  // The team list on a phone: opened, the expanded height; with the keyboard open (a list field has focus) the stage
  // keeps clamp(120, 32% of the visible height, 200) and the rows fill the rest (3.3).
  const visibleHeight = size.height || 844;
  const stageClamp = Math.max(120, Math.min(200, Math.round(visibleHeight * 0.32)));
  const typingPanel = Math.max(160, visibleHeight - LAYOUT_SIZES.compact.topBar - stageClamp);
  const heights = listTyping ? { normal: typingPanel, expanded: typingPanel } : panelHeights(visibleHeight);
  const growRoom = panelGrowRoom(size.height || 844);
  const editorWidth = size.width || 390;
  const stageWidth = layout === "wide" ? editorWidth - LAYOUT_SIZES.wide.rail - LAYOUT_SIZES.wide.panel : layout === "short" ? editorWidth - LAYOUT_SIZES.short.rail - (panelOpen || startCard ? (listView && panelOpen ? LIST_PANEL_SHORT : LAYOUT_SIZES.short.panel) : 0) : editorWidth;
  const baseInsets = stageInsets(layout, { open: panelOpen || startCard || (kitOpen && layout !== "wide"), height: panelSize.height, width: panelSize.width });
  // The Done panel covers the stage's right side (desktop, landscape) or its lower part (phone): the garment is framed in the rest.
  const insets = doneOpen ? (layout === "compact" ? { ...baseInsets, bottom: doneHeight > 0 ? doneHeight - LAYOUT_SIZES.compact.dock : heights.expanded } : { ...baseInsets, right: layout === "wide" ? 400 : LAYOUT_SIZES.short.panel }) : baseInsets;

  // E3d (speed): the tools' shared state is a new object only when its data changes. Its functions are stable
  // wrappers that call the latest implementation (set after every render), so a render of the shell for anything
  // else (the camera, a status line, a hover, the panel's size) no longer re-renders every tool; with the tools
  // memoised, a tool re-renders when its own data changes.
  const impl: ApiHandlers = {
      setDetent,
      nudge,
      latestDesign: () => designRef.current,
      commit,
      begin: (label) => history.begin(label),
      preview,
      end: () => history.end(),
      hoverPreview: (edit) => {
        try {
          setHover(edit ? edit(designRef.current) : null);
        } catch {
          setHover(null);
        }
      },
      showSide,
      focusOn,
      announce,
      chooseColourTarget,
      markPart: setMarkedPart,
      useColour: (id) =>
        setRecentColours((list) => {
          const next = [id, ...list.filter((x) => x !== id)].slice(0, 8);
          writeLocal(RECENT_KEY, JSON.stringify(next));
          return next;
        }),
      setTyping,
      openTool,
      select: (layerId, options = {}) => {
        setSelectedId(layerId);
        const layer = layerId ? designRef.current.layers.find((l) => l.id === layerId) : undefined;
        if (!layer) return;
        if (options.openTool) {
          const next = toolForLayer(layer);
          if (tools.includes(next)) openTool(next, detent === "expanded" ? "normal" : detent, { turn: false });
        }
        if (options.turn) {
          const side = layerSide(product, layer);
          // Only when the item faces away: the camera never moves for what the coach already sees (6.3).
          if (side && side !== canvas.current?.getSide()) canvas.current?.focusOn(layer.id);
        }
      },
      setLogoNote: (assetId, note) => {
        setLogoNotes((all) => ({ ...all, [assetId]: { ...all[assetId], ...note } }));
        assets.saveNote?.(assetId, note);
      },
      setSnapping: setSnapOn,
      markTiming: (name) => {
        timing.current = { name, start: performance.now() };
      },
  };
  const [latest] = useState(createHandlers);
  useLayoutEffect(() => latest.set(impl));
  const handlers = latest.handlers;
  // While a drag, resize or turn goes on, the tools see the design as it was when it started (5.3: the stage is
  // what must stay quick; the panel catches up on release).
  const apiDesign = frozenDesign ?? design;
  const api: EditorApi = useMemo(
    () => ({
      ...handlers,
      product,
      palette,
      fonts,
      templates: templates as Template[],
      wording,
      assets,
      layout,
      detent,
      design: apiDesign,
      textFits,
      fontsLoading,
      fontsFailed,
      garmentView,
      colourTarget,
      markedPart,
      recentColours,
      reducedMotion,
      selectedId,
      logoNotes,
      missingAssets,
      snapping: snapOn,
      coachColoured,
      readable,
    }),
    [handlers, product, palette, fonts, templates, wording, assets, layout, detent, apiDesign, textFits, fontsLoading, fontsFailed, garmentView, colourTarget, markedPart, recentColours, reducedMotion, selectedId, logoNotes, missingAssets, snapOn, coachColoured, readable],
  );

  const selectOnModel = useCallback(
    (layerId: string | null) => {
      // Pressing the item that is already selected (to drag it) changes nothing: no tool opens, the camera keeps still.
      if (layerId === selectedId) return;
      setSelectedId(layerId);
      const layer = layerId ? designRef.current.layers.find((l) => l.id === layerId) : undefined;
      // R1: the first tap on an item while the start card is open closes it as "Skip" and opens the item's tool.
      const action = modelTapAction({ startCard, itemTool: layer ? toolForLayer(layer) : null, activeTool: startCard ? null : activeTool, tools });
      if (action.closeStartCard) setStartCard(false);
      if (action.openTool) openTool(action.openTool, detent === "expanded" ? "normal" : detent, { turn: false });
    },
    [selectedId, setSelectedId, startCard, activeTool, tools, openTool, detent],
  );

  // Placing an item (5.1, 5.2): a drag, a corner resize or a turn, through one controller, so every way a
  // gesture ends (release, cancel, lost capture, the handle gone, the tab hidden, a second finger, the window
  // blurred, another tool, item or the Done panel) commits or cancels it and clears the lines and "placing" (B1).
  const gestureDeps = useRef({ history, product, snapOn, reducedMotion, announce, wording });
  useEffect(() => {
    gestureDeps.current = { history, product, snapOn, reducedMotion, announce, wording };
  });
  // The gesture's design while it goes on (S1), outside React state: its start, its latest preview, its label.
  const gestureDraft = useRef<{ start: DesignDocument; current: DesignDocument; label: EditLabel } | null>(null);
  // The controller is made once, in an effect (its callbacks read refs); `gestures` forwards to it.
  const [gestureHolder] = useState<{ current: ItemGestures | null }>(() => ({ current: null }));
  const [gestures] = useState(() => forwardGestures(gestureHolder));
  useEffect(() => {
    gestureHolder.current ??= createItemGestures({
      product: () => gestureDeps.current.product,
      design: () => gestureDraft.current?.current ?? designRef.current,
      // Previews go straight to the canvas, outside React (S1: no re-render of the shell and the tools on
      // every pointer move); the result is committed as one undo step on release. Without a canvas, the history's gesture.
      history: {
        begin: (label) => {
          if (canvas.current) gestureDraft.current = { start: designRef.current, current: designRef.current, label };
          else gestureDeps.current.history.begin(label);
        },
        preview: (update) => {
          const g = gestureDraft.current;
          if (!g) return gestureDeps.current.history.preview(update);
          const next = update(g.current);
          if (next === g.current) return;
          g.current = next;
          canvas.current?.preview(withPlayerRef.current(next));
        },
        end: () => {
          const g = gestureDraft.current;
          if (!g) return gestureDeps.current.history.end();
          gestureDraft.current = null;
          canvas.current?.preview(null);
          const { wording: words, product: p } = gestureDeps.current;
          if (!sameJson(g.current, g.start)) gestureDeps.current.history.commit(g.current, namedLabel(words, p, g.label, g.start, g.current) as EditLabel);
        },
        cancel: () => {
          const g = gestureDraft.current;
          if (!g) return gestureDeps.current.history.cancel();
          gestureDraft.current = null;
          canvas.current?.preview(null, { redraw: true });
        },
      },
      setGuides: (g) => setGuides(g),
      setPlacing: (kind) => setPlacing(kind),
      snapping: () => gestureDeps.current.snapOn,
      onSnap: () => {
        // A short buzz on Android when a new line catches the item (7.5), never with reduced motion.
        if (!gestureDeps.current.reducedMotion && typeof navigator !== "undefined" && typeof navigator.vibrate === "function") navigator.vibrate(10);
      },
      onEnd: ({ shrunk }) => {
        if (shrunk) gestureDeps.current.announce(gestureDeps.current.wording.selection.madeSmaller);
      },
    });
  });
  const onResize = useCallback((phase: GesturePhase, factor: number) => selectedId && gestures.resize(selectedId, phase, factor), [selectedId, gestures]);
  const onRotate = useCallback((phase: GesturePhase, degrees: number, free: boolean) => selectedId && gestures.rotate(selectedId, phase, degrees, free), [selectedId, gestures]);
  const onLayerDrag = useCallback((event: LayerDragEvent) => gestures.drag(event), [gestures]);
  const onGestureInterrupt = useCallback((reason: GestureEndReason) => gestures.finish(reason), [gestures]);
  // The tab hidden or the window blurred: the gesture is cancelled (nothing is left half placed).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onHidden = () => {
      if (document.visibilityState === "hidden") gestures.finish("hidden");
    };
    const onBlur = () => gestures.finish("blur");
    document.addEventListener("visibilitychange", onHidden);
    window.addEventListener("blur", onBlur);
    return () => {
      document.removeEventListener("visibilitychange", onHidden);
      window.removeEventListener("blur", onBlur);
      gestures.finish("unmount");
    };
  }, [gestures]);
  // Another item selected (or none) while placing: what was placed is kept.
  useEffect(() => {
    const open = gestures.active();
    if (open && open.layerId !== selectedId) gestures.finish("selection-change");
  }, [selectedId, gestures]);

  const onStageKey = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    // With an item selected, the arrows move it (the window's key handler, 5.1); the garment does not turn.
    if (selectedId && event.key.startsWith("Arrow")) return;
    const turn = { ArrowLeft: -15, ArrowRight: 15 }[event.key as "ArrowLeft" | "ArrowRight"];
    if (turn !== undefined) {
      event.preventDefault();
      canvas.current?.turnBy(turn);
    } else if (event.key === "+" || event.key === "=") canvas.current?.zoomIn();
    else if (event.key === "-") canvas.current?.zoomOut();
    // Page Up and Page Down choose the previous and next player (7.2), with nothing selected.
    else if ((event.key === "PageUp" || event.key === "PageDown") && !selectedId) {
      event.preventDefault();
      step(event.key === "PageUp" ? -1 : 1);
    }
  };

  const toolBody = (t: ToolId) => {
    switch (t) {
      case "design":
        return <DesignTool />;
      case "colours":
        return <ColoursTool />;
      case "team":
        return <TeamTool />;
      case "players":
        return <PlayersTool />;
      case "logos":
        return <LogosTool />;
      case "text":
        return <TextTool />;
    }
  };

  const fontsNote = fontsLoading ? wording.lettering.fontsLoading : null;
  const selectedLayer = selectedId ? (design.layers.find((l) => l.id === selectedId) ?? null) : null;
  const toolDesign = frozenDesign ?? design;
  // R15, D2: every item with an open warning and its words (a badge on the model while the item is not selected).
  // Deferred (speed): the readability pass runs after a tap has painted, never in its way.
  const warningsDesign = useDeferredValue(toolDesign);
  const warnings = useMemo(() => warningNames(wording, product, warningsDesign, { notes: logoNotes, palette, missingAssets }), [wording, product, warningsDesign, logoNotes, palette, missingAssets]);
  const kitInPanel = kitOpen && layout !== "wide" && !startCard;
  const kitPanel = kitInPanel ? (
    <ToolPanel
      key={`kit-${layout}`}
      layout={layout}
      tool={activeTool ?? tools[0]!}
      title={wording.selection.onThisKit}
      wording={wording}
      detent={detent}
      heights={heights}
      growRoom={growRoom}
      typing={typing}
      onDetent={(d) => (d === "closed" ? setKitOpen(false) : setDetent(d))}
      onClose={() => setKitOpen(false)}
      onSize={setPanelSize}
    >
      <div className="fmo-back-row">
        <button type="button" onClick={() => setKitOpen(false)} data-testid="kit-back">
          {wording.tools.back}
        </button>
      </div>
      <OnThisKit onDone={() => setKitOpen(false)} />
    </ToolPanel>
  ) : null;
  const panel = kitPanel ??
    (panelOpen && activeTool ? (
      <ToolPanel
        key={layout}
        layout={layout}
        tool={activeTool}
        wording={wording}
        detent={listTyping ? "expanded" : detent}
        holdExpanded={listView}
        heights={heights}
        growRoom={growRoom}
        typing={typing}
        onDetent={(d) => (d === "closed" ? closePanel() : setDetent(d))}
        onClose={closePanel}
        onSize={setPanelSize}
      >
        {selectedLayer && layout === "wide" && <ContextBar variant="panel" />}
        {selectedLayer && toolForLayer(selectedLayer) === activeTool && (
          <div className="fmo-stack" data-testid="selected-item-section">
            <SelectedWarnings />
            <ClippedNote />
            <FineTune />
          </div>
        )}
        {toolBody(activeTool)}
        {fontsNote && (activeTool === "team" || activeTool === "players") && <p className="fmo-muted">{fontsNote}</p>}
      </ToolPanel>
    ) : null);
  const start = startCard ? (
    <div style={layout === "compact" ? { position: "absolute", inset: 0, pointerEvents: "none" } : layout === "short" ? { position: "absolute", inset: 0, pointerEvents: "none" } : { display: "contents" }}>
      <StartCardFrame layout={layout} maxHeight={(size.height || 844) - LAYOUT_SIZES.compact.topBar - START_CARD_STAGE_MIN} onSize={setPanelSize}>
        <StartCard
          onClose={(seeDesigns) => {
            setStartCard(false);
            if (seeDesigns && tools.includes("design")) openTool("design", "expanded");
          }}
        />
      </StartCardFrame>
    </div>
  ) : null;

  return (
    <EditorContext.Provider value={api}>
      <TeamListContext.Provider value={teamApi}>
      {props.injectStyles !== false && (
        <style href="fitmyoutfit-editor-css" precedence="default">
          {EDITOR_CSS}
        </style>
      )}
      <div
        ref={root}
        className={props.className ? `fmo-editor ${props.className}` : "fmo-editor"}
        style={props.style}
        data-layout={layout}
        data-typing={typing}
        data-detent={panelOpen ? detent : "closed"}
        data-list={panelOpen && listView ? "true" : undefined}
        data-start={startCard}
        data-reduced-motion={reducedMotion}
        data-selected={selectedId ?? ""}
        role="application"
        aria-label={wording.frame.editorName}
        data-testid="editor"
      >
        <TopBar
          layout={layout}
          wording={wording}
          productName={props.productName}
          canUndo={history.canUndo && !listLocked}
          canRedo={history.canRedo && !listLocked}
          undoTitle={`${wording.frame.undo}: ${changeWords(wording, history.undoLabel)} (Ctrl+Z)`}
          redoTitle={`${wording.frame.redo}: ${changeWords(wording, history.redoLabel)} (Ctrl+Shift+Z)`}
          onUndo={undo}
          onRedo={redo}
          saveState={props.saveState ?? null}
          saveWords={saveStateWords(layout, size.width || 390)}
          onSaveInfo={() => setSaveInfo(true)}
          onClose={() => (props.saveState === "failed" ? setLeaving(true) : props.onClose?.())}
          onDone={() => {
            gestures.finish("done-panel");
            setRevealAll(true);
            // The Done panel lets go of the selected item (E3c minor): no handles behind it.
            setSelectedId(null);
            setKitOpen(false);
            // R38, 4.10: one sheet at a time on a phone: the tool panel closes under the Done panel, and comes back
            // (with its height) when the Done panel closes.
            beforeDone.current = sheetUnderDone({ layout, panelOpen, tool: activeTool, detent });
            if (beforeDone.current) setTool(null);
            setDoneOpen(true);
          }}
          doneOpen={doneOpen}
          brand={props.slots?.brand}
          price={props.slots?.price}
          share={props.slots?.share}
          account={props.slots?.account}
        />
        {!(layout === "compact" && startCard) && (
          <ToolTabs layout={layout} tools={tools} active={startCard ? (layout === "wide" ? "design" : null) : activeTool} wording={wording} disabled={!toolsReady} onSelect={onTab} />
        )}
        {layout === "wide" && (start ?? panel)}
        <div
          className="fmo-work"
          onPointerDownCapture={() => {
            pointer.current.down = true;
          }}
          onPointerUpCapture={() => {
            pointer.current.down = false;
          }}
          onPointerCancelCapture={() => {
            pointer.current.down = false;
          }}
        >
          <Stage
            key={canvasKey}
            layout={layout}
            mode={mode}
            product={product}
            design={displayDesign}
            wording={wording}
            tone={tone}
            insets={insets}
            description={description}
            assetUrl={assets.url}
            canvasRef={canvas}
            canvasProps={{
              textureSize: props.textureSize,
              fonts: props.fontSet,
              reducedMotion,
              selectedLayerId: selectedId,
              // R22, 4.6: a selected item is zoomed in on until its box is this long on screen.
              selectionMinPx: layout === "wide" ? 160 : 120,
              onSelectLayer: selectOnModel,
              dragOnlySelected: true,
              outlineSelected: false,
              guides,
              gesture: placing !== null,
              draftQuality: props.draftQuality ?? "auto",
              onGestureTiming: (t: GestureTiming) => {
                const named = { ...t, name: lastPlacing.current ?? "move" };
                onGestureTimingRef.current?.(named);
                if (logTimings) console.info(`[editor timing] ${named.name}: ${t.frames} frames, frame p50 ${t.frameP50.toFixed(1)} ms, p95 ${t.frameP95.toFixed(1)} ms, max ${t.frameMax.toFixed(1)} ms; drawing p50 ${t.drawP50.toFixed(1)} ms; draft ${t.draft ? "on" : "off"}; full quality ${(t.fullQualityMs ?? 0).toFixed(1)} ms after release`);
              },
              onLayerDrag,
              onZoneTap: onPartTap,
              hover: true,
              onHover: setHovered,
              highlight: highlight ?? markedHighlight,
              onCameraChange: setCamera,
              onUserTurn: (phase, moved) => {
                if (phase === "end" && moved) pointer.current.lastUserTurnAt = performance.now();
              },
              onLoadProgress,
              onModelReady,
              onTextureDrawn,
              onFontStatus,
              onError: (error) => {
                console.error("[editor] the 3D view failed:", error);
                setLoad((l) => ({ ...l, failed: true }));
              },
              onContextLost: () => {
                contextLosses.current++;
                if (contextLosses.current >= 2) {
                  setMode("flat");
                  setBanner(wording.states.noWebgl);
                } else setBanner(wording.states.restarting);
              },
              onContextRestored: () => setBanner(null),
            }}
            load={load}
            onRetry={() => {
              setLoad({ fraction: null, ready: false, slow: false, failed: false });
              setCanvasKey((k) => k + 1);
            }}
            onUseFlat={() => {
              setMode("flat");
              setBanner(wording.states.noWebgl);
            }}
            status={status}
            onUndo={undo}
            hint={hint}
            banner={banner}
            camera={camera}
            onSide={(side) => canvas.current?.showSide(side)}
            onZoom={(d) => (d === "in" ? canvas.current?.zoomIn() : canvas.current?.zoomOut())}
            onReset={() => canvas.current?.resetView()}
            onStageKey={onStageKey}
            credit={props.slots?.credit}
            creditShort={props.slots?.creditShort}
            garment={garmentMeshes}
            stageWidth={stageWidth}
            onStagePointerDown={dismissHint}
            onResize={onResize}
            onRotate={onRotate}
            onGestureInterrupt={onGestureInterrupt}
            onTurnTo={() => selectedId && canvas.current?.focusOn(selectedId)}
            handlesHidden={typing || doneOpen}
            contextBar={Boolean(selectedLayer) && layout !== "wide" && !typing && mode === "3d" && !doneOpen}
            warnings={warnings}
            onSelectItem={(layerId) => api.select(layerId, { openTool: true })}
            hover={hovered}
            hoverName={hovered?.kind === "part" ? partName(wording, product, hovered.shapeGroup ? { kind: "shapes", id: hovered.shapeGroup } : { kind: "zone", id: hovered.zoneId ?? "" }) : null}
            partPopover={partMenu ? <PartPopover key={`${partMenu.target.kind}-${partMenu.target.id}-${partMenu.x}-${partMenu.y}`} target={partMenu.target} x={partMenu.x} y={partMenu.y} onClose={() => setPartMenu(null)} /> : null}
            kitButton={
              startCard || doneOpen || (Boolean(selectedLayer) && layout !== "wide" && !typing && mode === "3d") || (layout === "compact" && typing) ? null : (
                <KitButton count={design.layers.length} compact={stageWidth < 480} open={kitOpen} onClick={() => setKitOpen((o) => !o)} />
              )
            }
            kitPopover={
              kitOpen && layout === "wide" ? (
                <div className="fmo-kit-popover" role="dialog" aria-label={wording.selection.onThisKit} data-testid="kit-popover">
                  <h2 className="fmo-panel-title">{wording.selection.onThisKit}</h2>
                  <OnThisKit onDone={() => setKitOpen(false)} />
                </div>
              ) : null
            }
            chip={startCard || doneOpen || (layout === "compact" && typing) ? null : <PlayerChip inList={listView && panelOpen} />}
            wholeToggle={layout === "compact" && listView && panelOpen ? <WholeShirtToggle pressed={wholeShirt} onToggle={() => setWholeShirt((w) => !w)} /> : null}
            viewControls={viewControlsFor({ layout, typing, panelOpen, detent, startCard, listView, stageHeight: (size.height || 844) - LAYOUT_SIZES.compact.topBar - (startCard ? panelSize.height : 0) })}
          />
          {layout !== "wide" && (start ?? panel)}
        </div>
        <DonePanel
          open={doneOpen}
          layout={layout}
          productName={props.productName}
          price={props.slots?.price}
          primaryAction={props.slots?.primaryAction}
          share={props.slots?.share}
          onClose={() => {
            setDoneOpen(false);
            const back = beforeDone.current;
            beforeDone.current = null;
            if (back) {
              setTool(back.tool);
              setDetent(back.detent);
            }
          }}
          onSize={setDoneHeight}
          onSaveAndGoBack={() => {
            setDoneOpen(false);
            flushList();
            props.onDone?.(designRef.current);
          }}
          listRequired={Boolean(teamHost?.listRequiredToContinue)}
          onShowList={showTeamList}
          onShow={(check) => {
            setDoneOpen(false);
            api.select(check.layerId, { turn: true, openTool: true });
          }}
        />
        <ConfirmDialog
          open={saveInfo}
          title={wording.frame.notSaved}
          body={wording.frame.notSavedHelp}
          onCancel={() => setSaveInfo(false)}
          actions={
            <button type="button" className="fmo-btn" onClick={() => setSaveInfo(false)}>
              {wording.done.keepDesigning}
            </button>
          }
        />
        <ConfirmDialog
          open={leaving}
          title={wording.frame.leaveTitle}
          body={wording.frame.notSavedHelp}
          onCancel={() => setLeaving(false)}
          testId="leave-dialog"
          actions={
            <>
              <button type="button" className="fmo-btn" onClick={() => setLeaving(false)} data-dialog-focus>
                {wording.frame.stay}
              </button>
              <button
                type="button"
                className="fmo-btn fmo-btn-text fmo-btn-pad"
                onClick={() => {
                  setLeaving(false);
                  props.onClose?.();
                }}
              >
                {wording.frame.leave}
              </button>
            </>
          }
        />
      </div>
      </TeamListContext.Provider>
    </EditorContext.Provider>
  );
}

/** The start card's frame: it reports its size (for the camera) and is never taller than leaves the stage 160 px. */
function StartCardFrame({ layout, maxHeight, onSize, children }: { layout: string; maxHeight: number; onSize: (size: { width: number; height: number }) => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const report = useRef(onSize);
  useEffect(() => {
    report.current = onSize;
  });
  useEffect(() => {
    const el = ref.current?.querySelector<HTMLElement>(".fmo-start") ?? null;
    if (!el) return;
    const measure = () => report.current({ width: el.offsetWidth, height: el.offsetHeight });
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [layout]);
  return (
    <div ref={ref} style={{ display: "contents" }} data-max={maxHeight}>
      <style>{layout === "compact" ? `.fmo-start { max-height: ${Math.max(200, maxHeight)}px; pointer-events: auto; }` : `.fmo-start { pointer-events: auto; }`}</style>
      {children}
    </div>
  );
}
