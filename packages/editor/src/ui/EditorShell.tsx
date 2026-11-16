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
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
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
import { useDesignHistory } from "../react/useDesignHistory.js";
import type { CameraInfo, DesignCanvasHandle, LayerDragEvent, PieceGuide, TextureDrawInfo, ZoneTap } from "../react/DesignCanvas.js";
import type { GestureTiming } from "../react/draft-quality.js";
import { mayMoveCamera } from "../react/camera.js";
import { extractGarmentMeshes } from "../react/garment-geometry.js";
import { loadModel, type LoadedModel, type ModelLoadProgress } from "../react/model-loader.js";
import type { FontSetLike, FontStatus } from "../texture/fonts.js";
import { renderGarmentView, type GarmentMesh, type GarmentView } from "../texture/garment-view.js";
import type { TextFit } from "../texture/layers.js";
import type { ZoneHighlight } from "../texture/zone-highlight.js";
import type { SaveState } from "../storage/device-store.js";
import { ColoursTool } from "./ColoursTool.js";
import { changeWords, fill, mergeWording, type WordingOverrides } from "./content.js";
import { EditorContext, type ColourTarget, type EditorApi, type EditorAssets, type ToolId } from "./context.js";
import { CARD_HEIGHT, CARD_WIDTH, DesignTool } from "./DesignTool.js";
import { PlayersTool, TeamTool } from "./LetteringTools.js";
import { LogosTool, TextTool } from "./LogosTool.js";
import { LAYOUT_SIZES, START_CARD_STAGE_MIN, chooseLayout, panelHeights, saveStateWords, stageInsets, type PanelDetent } from "./layout.js";
import { ConfirmDialog } from "./parts.js";
import { Stage, type StageLoad } from "./Stage.js";
import { StartCard } from "./StartCard.js";
import { bodyColour, describeStage, nextStageTone, type StageTone } from "./stage-logic.js";
import { EDITOR_CSS } from "./styles.js";
import { TOOL_ORDER, ToolPanel, ToolTabs } from "./ToolPanel.js";
import { TopBar } from "./TopBar.js";
import { hasWebGL2, readLocal, writeLocal } from "./webgl.js";
import { toolForLayer } from "./selection.js";
import { namedLabel } from "./items.js";
import { KitButton, OnThisKit } from "./OnThisKit.js";
import { DonePanel } from "./DonePanel.js";
import { itemChecks, type LogoNote } from "./checks.js";
import { ClippedNote, ContextBar, FineTune, keyEdit } from "./SelectedItem.js";
import { nudgeLayer, rotateLayerBy, scaleLayerBy } from "../design/item-edits.js";
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

export function EditorShell(props: EditorShellProps) {
  const { product, palette, fonts, templates, assets } = props;
  const wording = useMemo(() => mergeWording(props.wording), [props.wording]);
  const root = useRef<HTMLDivElement>(null);
  const size = useElementSize(root);
  const layout = chooseLayout(size.width || 390, size.height || 844);
  const reducedMotion = useReducedMotion();
  // A design brought back (or upgraded) gets the print-area rule once: every item inside its area.
  const history = useDesignHistory(() => fitDesignToAreas(props.product, props.initialDesign));
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
  const [camera, setCamera] = useState<CameraInfo>({ side: "front", canZoomIn: true, canZoomOut: true });
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
  const displayDesign = hover ?? design;

  // The stage's tone follows the body's colour, with a gap so it does not flicker (12.2).
  const [tone, setTone] = useState<StageTone>(() => nextStageTone("normal", bodyColour(product, design)?.hex ?? null));
  const nextTone = nextStageTone(tone, bodyColour(product, displayDesign)?.hex ?? null);
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
  const undo = useCallback(() => {
    if (!history.canUndo) return;
    const target = history.history.gestureStart ? history.history.gestureStart.value : history.history.past[history.history.past.length - 1];
    announce(fill(wording.states.undone, { change: changeWords(wording, history.undoLabel) }));
    turnToChange(design, target);
    history.undo();
  }, [history, announce, wording, turnToChange, design]);
  const redo = useCallback(() => {
    if (!history.canRedo) return;
    announce(fill(wording.states.redone, { change: changeWords(wording, history.redoLabel) }));
    turnToChange(design, history.history.future[0]);
    history.redo();
  }, [history, announce, wording, turnToChange, design]);

  // ---- Tools.
  const toolsReady = mode === "flat" || (load.ready && fontsReadyOnce);
  const fontsLoading = (fontStatus?.loading.length ?? 0) > 0;
  const fontsFailed = (fontStatus?.failed.length ?? 0) > 0 || (fontStatus?.missing.length ?? 0) > 0;
  const openTool = useCallback(
    (next: ToolId, nextDetent: PanelDetent = "normal", options: { turn?: boolean } = {}) => {
      setTool(next);
      setDetent(nextDetent);
      setStartCard(false);
      setKitOpen(false);
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
  const onTab = (next: ToolId) => {
    if (!toolsReady) {
      announce(wording.tools.almostReady);
      return;
    }
    gestures.finish("tool-change");
    // A tool the selected item does not belong to: the item is let go (E3c minor), so no handles or
    // "Turn to edit" stay over another tool's view.
    if (selectedId && keepsSelection(designRef.current, selectedId, next) === false) setSelectedId(null);
    if (startCard) setStartCard(false);
    if (kitOpen) {
      openTool(next, detent === "expanded" ? "expanded" : "normal");
      return;
    }
    if (activeTool === next && layout !== "wide") {
      setTool(null);
      return;
    }
    // Changing tools keeps an expanded panel expanded (3.3).
    openTool(next, detent === "expanded" ? "expanded" : "normal");
  };
  const closePanel = useCallback(() => {
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
        if (kitOpen) setKitOpen(false);
        else if (selectedId) setSelectedId(null);
        else if (panelOpen && layout !== "wide") closePanel();
      } else if (selectedId && !typingInField && !mod && (target === document.body || target?.closest?.(".fmo-stage, .fmo-context"))) {
        const step = keyEdit(event.key, event.shiftKey);
        if (!step) return;
        event.preventDefault();
        if (step.kind === "delete") {
          if (commit((d) => removeLayer(d, selectedId), "remove-item")) setSelectedId(null);
        } else if (step.kind === "nudge") commit((d) => nudgeLayer(d, selectedId, step.dx, step.dy, { product }), "move");
        else if (step.kind === "scale") commit((d) => scaleLayerBy(d, selectedId, step.factor, { product }), "resize");
        else commit((d) => rotateLayerBy(d, selectedId, step.degrees, { product }), "rotate");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo, selectedId, setSelectedId, panelOpen, layout, closePanel, commit, product, kitOpen]);

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
  const onZoneTap = useCallback(
    (tap: ZoneTap) => {
      if (tap.shapeGroup) chooseColourTarget({ kind: "shapes", id: tap.shapeGroup });
      else if (tap.zoneId) chooseColourTarget({ kind: "zone", id: tap.zoneId });
    },
    [chooseColourTarget],
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
  useEffect(() => {
    const started = !startCard;
    if (reported.current.design === design && reported.current.started === started) return;
    const first = reported.current.design === null;
    reported.current = { design, started };
    if (!first || started !== !props.showStartCard) onDesignChange.current?.(design, { started });
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
    for (const state of [h.present, ...h.past, ...h.future]) for (const id of designAssetIds(state)) knownAssets.add(id);
    if (!releaseFile) return;
    for (const id of assetsNoLongerUsed(knownAssets, [h.present, ...h.past, ...h.future, h.gestureStart?.value, gestureDraft.current?.start])) {
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
  const [hintSeen, setHintSeen] = useState(() => !(props.showHint ?? props.showStartCard ?? false));
  const touchDevice = typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches;
  const hint = load.ready && !hintSeen && !startCard && !doneOpen && mode === "3d" ? (touchDevice ? wording.selection.hint : wording.selection.hintPointer) : null;
  const dismissHint = () => {
    if (!hintSeen) setHintSeen(true);
  };

  // ---- The stage's description in words, debounced (11.2).
  const [description, setDescription] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setDescription(describeStage(wording, product, design, { productName: props.productName, side: camera.side, palette })), description ? 1000 : 0);
    return () => clearTimeout(timer);
  }, [design, camera.side, wording, product, palette, props.productName, description]);

  const heights = panelHeights(size.height || 844);
  const editorWidth = size.width || 390;
  const stageWidth = layout === "wide" ? editorWidth - LAYOUT_SIZES.wide.rail - LAYOUT_SIZES.wide.panel : layout === "short" ? editorWidth - LAYOUT_SIZES.short.rail - (panelOpen || startCard ? LAYOUT_SIZES.short.panel : 0) : editorWidth;
  const baseInsets = stageInsets(layout, { open: panelOpen || startCard || (kitOpen && layout !== "wide"), height: panelSize.height, width: panelSize.width });
  // The Done panel covers the stage's right side (desktop, landscape) or its lower part (phone): the garment is framed in the rest.
  const insets = doneOpen ? (layout === "compact" ? { ...baseInsets, bottom: heights.expanded } : { ...baseInsets, right: layout === "wide" ? 400 : LAYOUT_SIZES.short.panel }) : baseInsets;

  const api: EditorApi = {
    product,
    palette,
    fonts,
    templates: templates as Template[],
    wording,
    assets,
    layout,
    detent,
    setDetent,
    // While a drag, resize or turn goes on, the tools see the design as it was when it started (5.3: the
    // stage is what must stay quick; the panel catches up on release).
    design: frozenDesign ?? design,
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
    textFits,
    fontsLoading,
    fontsFailed,
    garmentView,
    showSide,
    focusOn,
    announce,
    colourTarget,
    chooseColourTarget,
    recentColours,
    useColour: (id) =>
      setRecentColours((list) => {
        const next = [id, ...list.filter((x) => x !== id)].slice(0, 8);
        writeLocal(RECENT_KEY, JSON.stringify(next));
        return next;
      }),
    setTyping,
    openTool,
    reducedMotion,
    selectedId,
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
    logoNotes,
    setLogoNote: (assetId, note) => {
      setLogoNotes((all) => ({ ...all, [assetId]: { ...all[assetId], ...note } }));
      assets.saveNote?.(assetId, note);
    },
    missingAssets,
    snapping: snapOn,
    setSnapping: setSnapOn,
    markTiming: (name) => {
      timing.current = { name, start: performance.now() };
    },
    coachColoured: coachColoured,
    readable,
  };

  const selectOnModel = useCallback(
    (layerId: string | null) => {
      // Pressing the item that is already selected (to drag it) changes nothing: no tool opens, the camera keeps still.
      if (layerId === selectedId) return;
      setSelectedId(layerId);
      const layer = layerId ? designRef.current.layers.find((l) => l.id === layerId) : undefined;
      if (!layer || startCard) return;
      const next = toolForLayer(layer);
      if (next !== activeTool && tools.includes(next)) openTool(next, detent === "expanded" ? "normal" : detent, { turn: false });
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
          canvas.current?.preview(next);
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
  const selectionWarn = useMemo(() => {
    const layer = selectedId ? toolDesign.layers.find((l) => l.id === selectedId) : undefined;
    return layer ? itemChecks(product, toolDesign, layer, { notes: logoNotes, missingAssets }).length > 0 : false;
  }, [selectedId, toolDesign, product, logoNotes, missingAssets]);
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
        detent={detent}
        heights={heights}
        typing={typing}
        onDetent={(d) => (d === "closed" ? closePanel() : setDetent(d))}
        onClose={closePanel}
        onSize={setPanelSize}
      >
        {selectedLayer && layout === "wide" && <ContextBar variant="panel" />}
        {selectedLayer && toolForLayer(selectedLayer) === activeTool && (
          <div className="fmo-stack" data-testid="selected-item-section">
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
          canUndo={history.canUndo}
          canRedo={history.canRedo}
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
            // The Done panel lets go of the selected item (E3c minor): no handles behind it.
            setSelectedId(null);
            setKitOpen(false);
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
              onSelectLayer: selectOnModel,
              dragOnlySelected: "touch",
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
              pickZones: activeTool === "colours" && !startCard,
              onZoneTap,
              highlight,
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
            selectionWarn={selectionWarn}
            kitButton={
              startCard || doneOpen || (Boolean(selectedLayer) && layout !== "wide" && !typing && mode === "3d") || (layout === "compact" && typing) ? null : (
                <KitButton count={design.layers.length} compact={(size.width || 390) < 480} open={kitOpen} onClick={() => setKitOpen((o) => !o)} />
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
            viewControls={layout === "compact" && typing ? "none" : layout === "compact" && panelOpen && detent === "expanded" ? "reset-only" : "full"}
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
          onClose={() => setDoneOpen(false)}
          onSaveAndGoBack={() => {
            setDoneOpen(false);
            props.onDone?.(designRef.current);
          }}
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
              <button type="button" className="fmo-btn" onClick={() => setLeaving(false)}>
                {wording.frame.stay}
              </button>
              <button
                type="button"
                className="fmo-btn fmo-btn-text"
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
