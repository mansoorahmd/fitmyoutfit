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
import { updateLayer } from "../design/edit.js";
import { layerSide } from "../design/roles.js";
import type { EditLabel } from "../state/history.js";
import { useDesignHistory } from "../react/useDesignHistory.js";
import type { CameraInfo, DesignCanvasHandle, LayerDragEvent, TextureDrawInfo, ZoneTap } from "../react/DesignCanvas.js";
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
  /** Done (the red button): the host takes the design (E3a: save and confirm; E3b: the Done panel). */
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

export function EditorShell(props: EditorShellProps) {
  const { product, palette, fonts, templates, assets } = props;
  const wording = useMemo(() => mergeWording(props.wording), [props.wording]);
  const root = useRef<HTMLDivElement>(null);
  const size = useElementSize(root);
  const layout = chooseLayout(size.width || 390, size.height || 844);
  const reducedMotion = useReducedMotion();
  const history = useDesignHistory(props.initialDesign);
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

  // ---- Edits: one undo step each; an edit that throws is not applied (10.7).
  const commit = useCallback(
    (edit: (d: DesignDocument) => DesignDocument, label: EditLabel): boolean => {
      try {
        setHover(null);
        history.commit(edit(designRef.current), label);
        return true;
      } catch (error) {
        console.error("[editor] edit refused:", error);
        announce(wording.states.changeFailed);
        return false;
      }
    },
    [history, announce, wording],
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
    if (startCard) setStartCard(false);
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
        if (selectedId) setSelectedId(null);
        else if (panelOpen && layout !== "wide") closePanel();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo, selectedId, setSelectedId, panelOpen, layout, closePanel]);

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
  const onTextureDrawn = useCallback(
    (info: TextureDrawInfo) => {
      setTextFits(info.textFits);
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

  // ---- The one hint, once per design (7.4; E3b): after the start card, in its own band above the garment,
  // gone at the first press on the stage (a drag or a tap).
  const [hintSeen, setHintSeen] = useState(() => !(props.showHint ?? props.showStartCard ?? false));
  const touchDevice = typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches;
  const hint = load.ready && !hintSeen && !startCard && mode === "3d" ? (touchDevice ? wording.selection.hint : wording.selection.hintPointer) : null;
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
  const insets = stageInsets(layout, { open: panelOpen || startCard, height: panelSize.height, width: panelSize.width });

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
    design,
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
    markTiming: (name) => {
      timing.current = { name, start: performance.now() };
    },
  };

  const selectOnModel = useCallback(
    (layerId: string | null) => {
      setSelectedId(layerId);
      const layer = layerId ? designRef.current.layers.find((l) => l.id === layerId) : undefined;
      if (!layer || startCard) return;
      const next = toolForLayer(layer);
      if (next !== activeTool && tools.includes(next)) openTool(next, detent === "expanded" ? "normal" : detent, { turn: false });
    },
    [setSelectedId, startCard, activeTool, tools, openTool, detent],
  );

  const onLayerDrag = useCallback(
    (event: LayerDragEvent) => {
      if (event.phase === "start") history.begin("move");
      else if (event.phase === "move") history.preview((d) => updateLayer(d, event.layerId, { position: event.position }, { product }));
      else if (event.phase === "end") history.end();
      else history.cancel();
    },
    [history, product],
  );

  const onStageKey = (event: ReactKeyboardEvent<HTMLDivElement>) => {
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
  const panel =
    panelOpen && activeTool ? (
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
        {toolBody(activeTool)}
        {fontsNote && (activeTool === "team" || activeTool === "players") && <p className="fmo-muted">{fontsNote}</p>}
      </ToolPanel>
    ) : null;
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
          onDone={() => props.onDone?.(designRef.current)}
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
            viewControls={layout === "compact" && typing ? "none" : layout === "compact" && panelOpen && detent === "expanded" ? "reset-only" : "full"}
          />
          {layout !== "wide" && (start ?? panel)}
        </div>
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
