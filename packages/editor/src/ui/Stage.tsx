/**
 * The stage (06-editor.md 3, 6, 10): the 3D canvas (or the flat view) on a
 * light stage that deepens for white kits, the status line, the one-time
 * hint, the loading state with its progress, the view buttons (sides, zoom,
 * reset), and the model's credit line. The garment is framed in the free
 * area above (or beside) the panel by the canvas itself (`viewInsets`).
 */
import { useEffect, useMemo, useRef, useState, type ReactNode, type Ref } from "react";
import { DesignCanvas, type CameraInfo, type DesignCanvasHandle, type DesignCanvasProps, type ItemBox, type SelectionGeometry } from "../react/DesignCanvas.js";
import { createBus } from "./handles.js";
import { SelectionOverlay } from "./SelectionOverlay.js";
import type { GestureEndReason, GesturePhase } from "./item-gestures.js";
import { StageContextBar } from "./SelectedItem.js";
import { CONTEXT_BAR_HEIGHT } from "./selection.js";
import type { ViewInsets } from "../react/camera.js";
import type { DesignDocument, ProductDefinition } from "../design/schema.js";
import type { AssetUrlResolver } from "../react/asset-images.js";
import type { GarmentMesh } from "../texture/garment-view.js";
import { fill, type EditorWording } from "./content.js";
import { FlatView } from "./FlatView.js";
import { EditorIcon, ShirtSilhouette } from "./icons.js";
import type { EditorLayout } from "./layout.js";
import { creditForm, type StageTone } from "./stage-logic.js";

/**
 * Room kept at the top for the model's credit line (one quiet line, E3b), at the bottom for the view buttons,
 * and at the top for the one-time hint while it shows (CSS px). The garment is framed outside all of them, so
 * none of them ever covers it.
 */
export const CREDIT_ROOM = 24;
export const VIEW_ROW = 60;
export const HINT_ROOM = 44;

/** Whether the stage keeps the hint's room: while it shows, and after, until the frame changes for another reason. */
export function keepsHintRoom(hintShown: boolean, heldFor: string | null, frameKey: string): boolean {
  return hintShown || heldFor === frameKey;
}

export interface StageLoad {
  /** 0 to 1, or null when unknown. */
  fraction: number | null;
  ready: boolean;
  slow: boolean;
  failed: boolean;
}

export interface StageProps {
  layout: EditorLayout;
  mode: "3d" | "flat";
  product: ProductDefinition;
  design: DesignDocument;
  wording: EditorWording;
  tone: StageTone;
  insets: ViewInsets;
  description: string;
  assetUrl: AssetUrlResolver;
  canvasRef: Ref<DesignCanvasHandle>;
  canvasProps: Omit<DesignCanvasProps, "design" | "product" | "ref" | "viewInsets" | "assetUrl">;
  load: StageLoad;
  onRetry: () => void;
  onUseFlat: () => void;
  /** The status line: a message, and whether it offers Undo. */
  status: { text: string; undo: boolean } | null;
  onUndo: () => void;
  hint: string | null;
  banner: string | null;
  camera: CameraInfo;
  onSide: (side: "front" | "back" | "left" | "right") => void;
  onZoom: (direction: "in" | "out") => void;
  onReset: () => void;
  onStageKey: (event: React.KeyboardEvent<HTMLDivElement>) => void;
  credit?: ReactNode;
  /** The garment's meshes, for the flat view's front and back (null until the model is read). */
  garment?: readonly GarmentMesh[] | null;
  /** A short form of the credit for a narrow stage (one line); the full credit opens from a button beside it. */
  creditShort?: ReactNode;
  /** The stage's width in CSS px (the credit's form depends on it). */
  stageWidth: number;
  /** The first press on the stage (the hint goes). */
  onStagePointerDown?: () => void;
  /**
   * The view buttons over the stage: all of them; only Reset (a phone with an expanded panel: the stage is
   * short); or none (a phone while typing: the keyboard leaves room only for the item being typed).
   */
  viewControls: "full" | "reset-only" | "none";
  /** The selected item's handles (3D only): resize and turn gestures, and "Turn to edit". */
  onResize?: (phase: GesturePhase, factor: number) => void;
  onRotate?: (phase: GesturePhase, degrees: number, free: boolean) => void;
  onTurnTo?: () => void;
  /** A handle's gesture interrupted (capture lost, the handle gone, a second finger): it is ended (cancelled). */
  onGestureInterrupt?: (reason: GestureEndReason) => void;
  /** Handles hidden (a phone while typing). */
  handlesHidden?: boolean;
  /** The contextual bar on the stage (phones, with an item selected): the garment is framed below it. */
  contextBar?: boolean;
  /**
   * R15, D2: the items with an open warning and its words. Each unselected one gets a badge on the model that
   * selects it (`onSelectItem`); the selected item's warning leads its panel instead.
   */
  warnings?: ReadonlyMap<string, string>;
  onSelectItem?: (layerId: string) => void;
  /** "On this kit" (4.8): its button at the top right of the stage, and (desktop) its popover under it. */
  kitButton?: ReactNode;
  kitPopover?: ReactNode;
}

export function Stage({ canvasRef, ...props }: StageProps) {
  const { wording, insets, load, mode, camera, layout } = props;
  const v = wording.view;
  const percent = load.fraction === null ? null : Math.round(load.fraction * 100);
  const showLoading = mode === "3d" && !load.ready;
  const controlsBottom = insets.bottom + 12;
  // The garment is framed between the credit line and the view buttons, above (or beside) the panel.
  const hintShown = Boolean(props.hint) && props.viewControls !== "none";
  // The hint's room is kept after the hint goes, until the stage is re-framed for another reason (a panel, the
  // contextual bar), so showing or dismissing the hint never moves the garment (E3c, B3).
  const frameKey = `${layout}|${insets.top}|${insets.right}|${insets.bottom}|${insets.left}|${props.viewControls}|${Boolean(props.contextBar)}|${mode}`;
  const [hintRoomFor, setHintRoomFor] = useState<string | null>(null);
  if (hintShown && hintRoomFor !== frameKey) setHintRoomFor(frameKey);
  const hintRoom = keepsHintRoom(hintShown, hintRoomFor, frameKey);
  const barTop = (props.credit && mode === "3d" ? CREDIT_ROOM : 0) + (hintRoom && mode === "3d" ? HINT_ROOM : 0);
  const canvasInsets = { top: barTop + (props.contextBar ? CONTEXT_BAR_HEIGHT : 0), right: insets.right, bottom: insets.bottom + (mode === "3d" && props.viewControls === "full" ? VIEW_ROW : 0), left: insets.left };
  const sides = ["front", "back", "left", "right"] as const;
  // The selected item's box on the screen, from the canvas to the overlay (only the overlay re-renders per frame).
  const bus = useMemo(() => createBus<SelectionGeometry | null>(null), []);
  // Every item's box (E3d): the turn handle keeps off them (R33) and the badges sit on them (R15). Asked for only
  // while something is selected or has a warning (the model's UV lookup is built the first time it is needed).
  const items = useMemo(() => createBus<ItemBox[]>([]), []);
  const selected = props.canvasProps.selectedLayerId ?? null;
  const wantsBoxes = Boolean(selected) || (props.warnings?.size ?? 0) > 0;
  // R24, 4.5: the overlay is clipped to the free stage (below the credit line, above the view buttons).
  const clip = { top: props.credit && mode === "3d" ? CREDIT_ROOM : 0, right: insets.right, bottom: insets.bottom + (props.viewControls === "full" ? VIEW_ROW : 0), left: insets.left };
  // The width of "On this kit" (an icon on a narrow stage, words on a wider one): the top band leaves it room.
  const kitPlace = useRef<HTMLDivElement>(null);
  const [kitWidth, setKitWidth] = useState(44);
  const hasKit = Boolean(props.kitButton);
  // "On this kit" in stage coordinates: the turn handle keeps off it (4.5).
  const [kitBox, setKitBox] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  useEffect(() => {
    const el = kitPlace.current;
    if (!el) {
      setKitBox(null);
      return;
    }
    const measure = () => {
      setKitWidth(el.offsetWidth || 44);
      const button = el.firstElementChild as HTMLElement | null;
      const stage = el.parentElement;
      if (!button || !stage) return;
      const b = button.getBoundingClientRect();
      const s = stage.getBoundingClientRect();
      setKitBox((old) => {
        const next = { x: Math.round(b.left - s.left), y: Math.round(b.top - s.top), width: Math.round(b.width), height: Math.round(b.height) };
        return old && old.x === next.x && old.y === next.y && old.width === next.width && old.height === next.height ? old : next;
      });
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
    // Measured again when the button comes or goes, the layout changes or the side panel moves; a ResizeObserver
    // catches the rest (speed: the button is a new element on every render, it must not re-measure each time).
  }, [hasKit, layout, insets.right]);
  return (
    <div className="fmo-stage" data-tone={props.tone} data-testid="stage" style={props.credit && mode === "3d" ? ({ "--fmo-credit-room": `${CREDIT_ROOM}px` } as React.CSSProperties) : undefined} onPointerDownCapture={props.onStagePointerDown}>
      <div className="fmo-stage-deep" />
      {/* The soft contact shadow under the hem: the garment fills about 78% of the free area's height, centred (4.6). */}
      <div className="fmo-stage-shadow" hidden={mode !== "3d" || camera.panned} style={{ bottom: `calc(${canvasInsets.bottom}px + (100% - ${canvasInsets.bottom + canvasInsets.top}px) * 0.1)`, left: `calc((100% - ${insets.right}px) / 2)` }} aria-hidden="true" />
      {mode === "3d" ? (
        <div className="fmo-canvas" tabIndex={0} role="img" aria-label={props.description} onKeyDown={props.onStageKey} data-testid="stage-canvas" data-free={`${canvasInsets.top} ${canvasInsets.right} ${canvasInsets.bottom} ${canvasInsets.left}`}>
          <DesignCanvas {...props.canvasProps} ref={canvasRef} design={props.design} product={props.product} viewInsets={canvasInsets} assetUrl={props.assetUrl} style={{ background: "transparent", minHeight: 0 }} errorFallback={null} onSelectionGeometry={bus.emit} onItemBoxes={wantsBoxes ? items.emit : undefined} />
          <SelectionOverlay
            bus={bus}
            wording={wording}
            insets={insets}
            top={canvasInsets.top}
            onResize={props.onResize ?? (() => undefined)}
            onRotate={props.onRotate ?? (() => undefined)}
            onTurnTo={props.onTurnTo ?? (() => undefined)}
            onInterrupt={props.onGestureInterrupt}
            hidden={props.handlesHidden}
            items={items}
            warnings={props.warnings}
            onSelectItem={props.onSelectItem}
            clip={clip}
            controls={kitBox ? [kitBox] : undefined}
          />
          {props.contextBar && <StageContextBar bus={bus} top={barTop} bottomInset={canvasInsets.bottom} endInset={insets.right} />}
        </div>
      ) : (
        <div className="fmo-canvas fmo-flat-host" style={{ bottom: insets.bottom, right: insets.right }}>
          {props.banner && (
            // R28: the banner ends 8 px before "On this kit" (4.7), never under it.
            <div className="fmo-banner" role="status" data-testid="stage-banner" style={props.kitButton ? { marginInlineEnd: kitWidth + 4 } : undefined}>
              <EditorIcon name="info" size={20} />
              <span>{props.banner}</span>
            </div>
          )}
          <FlatView
            product={props.product}
            design={props.design}
            assetUrl={props.assetUrl}
            captionFront={wording.states.flatFront}
            captionBack={wording.states.flatBack}
            label={props.description}
            garment={props.garment}
            selectedLayerId={props.canvasProps.selectedLayerId}
            onSelectLayer={props.canvasProps.onSelectLayer}
          />
        </div>
      )}
      {showLoading && (
        <div className="fmo-loading" style={{ bottom: insets.bottom, right: insets.right }} data-testid="stage-loading">
          <ShirtSilhouette className="fmo-silhouette" />
          {!load.failed ? (
            <>
              <div className="fmo-progress" data-unknown={percent === null} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent ?? undefined} aria-label={wording.states.loadingNoPercent}>
                <span style={{ width: `${percent ?? 0}%` }} />
              </div>
              <p role="status">{percent === null ? wording.states.loadingNoPercent : fill(wording.states.loading, { percent })}</p>
              {load.slow && <p data-testid="stage-slow">{wording.states.slow}</p>}
            </>
          ) : (
            <div className="fmo-stack" role="alert" data-testid="stage-failed">
              <p>{wording.states.failed}</p>
              <div className="fmo-row" style={{ justifyContent: "center" }}>
                <button type="button" className="fmo-btn" onClick={props.onRetry} data-testid="stage-retry">
                  {wording.states.tryAgain}
                </button>
                <button type="button" className="fmo-btn fmo-btn-text fmo-btn-pad" onClick={props.onUseFlat} data-testid="stage-use-flat">
                  {wording.states.useFlat}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
      {/* The hint and the status line stay clear of "On this kit" at the top right (E3c: they overlapped in landscape). */}
      <div className="fmo-stage-top" style={{ right: insets.right, paddingInlineEnd: props.kitButton ? kitWidth + 16 : undefined }}>
        {hintShown && (
          <div className="fmo-hint" data-testid="stage-hint">
            {props.hint}
          </div>
        )}
        {props.banner && mode === "3d" && (
          <div className="fmo-banner" role="status" data-testid="stage-banner">
            <EditorIcon name="info" size={20} />
            <span>{props.banner}</span>
          </div>
        )}
        <div className={props.status?.undo ? "fmo-status" : "fmo-status fmo-status-quiet"} role="status" aria-live="polite" data-testid="status-line">
          {props.status && (
            <>
              <span>{props.status.text}</span>
              {props.status.undo && (
                <button type="button" onClick={props.onUndo} data-testid="status-undo">
                  {wording.frame.undo}
                </button>
              )}
            </>
          )}
        </div>
      </div>
      {props.kitButton && (
        <div ref={kitPlace} className="fmo-kit-place" style={{ insetInlineEnd: (layout === "short" ? insets.right : 0) + 8 }}>
          {props.kitButton}
          {props.kitPopover}
        </div>
      )}
      {props.credit && mode === "3d" && <Credit full={props.credit} short={props.creditShort} form={creditForm(props.stageWidth)} right={insets.right} label={v.creditMore} />}
      {mode === "3d" && props.viewControls !== "none" && (
        // R29: the view buttons follow the free stage (a side panel or the Done panel on the right).
        <div className="fmo-view" data-controls={props.viewControls} style={{ bottom: controlsBottom, right: insets.right }} data-testid="view-controls">
          <div className="fmo-sides" role="group" aria-label={v.sidesName}>
            {sides.map((side) => (
              <button key={side} type="button" aria-pressed={camera.side === side} onClick={() => props.onSide(side)} data-testid={`view-${side}`}>
                {v.sides[side]}
              </button>
            ))}
          </div>
          <div className="fmo-zoom">
            <button type="button" className="fmo-round" aria-label={v.zoomIn} title={v.zoomIn} aria-disabled={!camera.canZoomIn} onClick={() => camera.canZoomIn && props.onZoom("in")} data-testid="zoom-in">
              <EditorIcon name="plus" />
            </button>
            <button type="button" className="fmo-round" aria-label={v.zoomOut} title={v.zoomOut} aria-disabled={!camera.canZoomOut} onClick={() => camera.canZoomOut && props.onZoom("out")} data-testid="zoom-out">
              <EditorIcon name="minus" />
            </button>
            <button type="button" className="fmo-round" aria-label={v.reset} title={v.reset} onClick={props.onReset} data-testid="zoom-reset">
              <EditorIcon name="reset" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * The model's credit (a licence duty: title, author, licence and that we changed it, wherever the model is
 * shown): one quiet line at the top edge of the stage, in the band the garment is never framed into. On a
 * narrow stage the host's short form shows, with a button that opens the full credit (title and links)
 * under the line; Esc or the button closes it.
 */
function Credit({ full, short, form, right, label }: { full: ReactNode; short?: ReactNode; form: "full" | "short"; right: number; label: string }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
  const showShort = form === "short";
  return (
    <div className="fmo-credit" style={{ maxWidth: `calc(100% - ${right + 12}px)` }} data-testid="model-credit" data-form={form}>
      <span className="fmo-credit-line">{showShort ? (short ?? full) : full}</span>
      {showShort && (
        <button type="button" className="fmo-credit-more" aria-expanded={open} aria-label={label} title={label} onClick={() => setOpen((o) => !o)} data-testid="model-credit-more">
          <EditorIcon name="info" size={16} />
        </button>
      )}
      {showShort && open && (
        <div className="fmo-credit-full" role="note" data-testid="model-credit-full">
          {full}
        </div>
      )}
    </div>
  );
}
