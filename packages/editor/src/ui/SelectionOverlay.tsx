/**
 * The selected item's handles over the 3D model (06-editor.md 5.2; E3d, 07-editor-review 4.5): the box as
 * four straight two-tone lines between the item's projected corners, outset 8 px and at least 44 px (never a
 * line along the cloth), four corner handles on those corners that resize evenly, a turn handle on a stem that
 * keeps off other items and the stage's controls, the snapping guides and print area while placing (never
 * through the item), and a warning badge on each unselected item that needs a look. Drawn as SVG over the canvas, never into the texture, so a
 * handle never waits for a repaint. Its geometry comes from the canvas (the
 * UV lookup, N9) through a small store, so only this overlay re-renders as the
 * camera turns.
 *
 * When the item faces away from the camera the handles hide and one control,
 * "Turn to edit", turns the garment to it.
 */
import { useCallback, useEffect, useRef, useSyncExternalStore, type PointerEvent as ReactPointerEvent } from "react";
import type { ItemBox, SelectionGeometry } from "../react/DesignCanvas.js";
import type { ViewInsets } from "../react/camera.js";
import type { EditorWording } from "./content.js";
import { EditorIcon } from "./icons.js";
import { HANDLE_HIT, HANDLE_SIZE, TURN_KNOB, resizeFactor, turnDelta, type Bus, type Pt } from "./handles.js";
import { boundsOf, clipRunsOutside, selectionFrame, type Rect } from "./selection-box.js";
import type { GestureEndReason, GesturePhase } from "./item-gestures.js";

export type { GesturePhase };

/**
 * Whether the handles a gesture holds are gone from the screen (the item turned away, the overlay hidden, no
 * selection): a gesture that is going on must then end, because no release will reach it (B1).
 */
export function handlesGone(geometry: Pick<SelectionGeometry, "facing"> | null, hidden: boolean | undefined): boolean {
  return !geometry || Boolean(hidden) || !geometry.facing;
}

export interface SelectionOverlayProps {
  bus: Bus<SelectionGeometry | null>;
  wording: EditorWording;
  insets: ViewInsets;
  /** Top of the free area (below the credit and the contextual bar), CSS px. */
  top: number;
  /** A corner handle: the factor from the gesture's start. */
  onResize: (phase: GesturePhase, factor: number) => void;
  /** The turn handle: degrees turned on the piece since the gesture's start; `free` with Alt held (no snapping). */
  onRotate: (phase: GesturePhase, degrees: number, free: boolean) => void;
  /** "Turn to edit": turns the garment to the selected item. */
  onTurnTo: () => void;
  /**
   * A gesture on a handle was interrupted without a release reaching it: the pointer capture lost, the handle
   * gone (the item turned away), a second finger. The editor ends it (cancelled). Without it, the phase
   * "cancel" is sent to `onResize` or `onRotate`.
   */
  onInterrupt?: (reason: GestureEndReason) => void;
  /** Hidden while the coach types (the keyboard leaves room for the item only). */
  hidden?: boolean;
  /**
   * E3d (R15, D2): every item's box (the turn handle keeps off them, R33), the items with a warning and what it
   * is (a badge on each unselected one, with that as its name; none on the selected item: its warning leads the
   * panel), and what a badge does (selects its item).
   */
  items?: Bus<ItemBox[]>;
  warnings?: ReadonlyMap<string, string>;
  onSelectItem?: (layerId: string) => void;
  /** The free stage (4.5): the overlay is clipped to it, and its edges are obstacles for the turn handle. */
  clip?: { top: number; right: number; bottom: number; left: number };
  /** Controls floating on the stage ("On this kit"), in the overlay's coordinates: the turn handle keeps off them (4.5). */
  controls?: readonly Rect[];
}

const NO_ITEMS = createEmptyItems();
function createEmptyItems(): Bus<ItemBox[]> {
  const empty: ItemBox[] = [];
  return { emit: () => undefined, get: () => empty, subscribe: () => () => undefined };
}

const points = (list: readonly Pt[]) => list.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");

export function SelectionOverlay(props: SelectionOverlayProps) {
  const geometry = useSyncExternalStore(props.bus.subscribe, props.bus.get, props.bus.get);
  const itemsBus = props.items ?? NO_ITEMS;
  const items = useSyncExternalStore(itemsBus.subscribe, itemsBus.get, itemsBus.get);
  const gesture = useRef<{ kind: "resize" | "rotate"; pointerId: number; centre: Pt; start: Pt; mirrored: boolean; outset: number } | null>(null);
  // The one way out of a gesture that no release will end.
  const propsRef = useRef(props);
  useEffect(() => {
    propsRef.current = props;
  });
  const interrupt = useCallback((reason: GestureEndReason) => {
    const s = gesture.current;
    if (!s) return;
    gesture.current = null;
    const p = propsRef.current;
    if (p.onInterrupt) p.onInterrupt(reason);
    else if (s.kind === "resize") p.onResize("cancel", 1);
    else p.onRotate("cancel", 0, false);
  }, []);
  const gone = handlesGone(geometry, props.hidden);
  useEffect(() => {
    if (gone) interrupt("unmount");
  }, [gone, interrupt]);
  // A second finger while a handle is held: two fingers move the camera, never the item (5.1).
  useEffect(() => {
    const other = (event: PointerEvent) => {
      if (gesture.current && event.pointerId !== gesture.current.pointerId) interrupt("second-pointer");
    };
    window.addEventListener("pointerdown", other, true);
    return () => {
      window.removeEventListener("pointerdown", other, true);
      interrupt("unmount");
    };
  }, [interrupt]);
  const clip = props.clip ?? { top: 0, right: 0, bottom: 0, left: 0 };
  const clipPath = `inset(${clip.top}px ${clip.right}px ${clip.bottom}px ${clip.left}px)`;
  // Badges on unselected items with a warning (R15, D2): a button that selects the item, named by its warning.
  const badges =
    props.warnings && props.warnings.size > 0 && !props.hidden
      ? items.filter((b) => b.facing && b.layerId !== geometry?.layerId && props.warnings!.has(b.layerId)).map((b) => {
          const r = boundsOf(b.corners);
          const label = props.warnings!.get(b.layerId)!;
          return (
            <button
              key={b.layerId}
              type="button"
              className="fmo-badge fmo-overlay-badge fmo-badge-button"
              style={{ left: r.x + r.width, top: r.y }}
              aria-label={label}
              title={label}
              onClick={() => props.onSelectItem?.(b.layerId)}
              data-testid={`item-badge-${b.layerId}`}
            >
              <EditorIcon name="alert" size={16} />
            </button>
          );
        })
      : null;
  if (!geometry || props.hidden) {
    return badges && badges.length > 0 ? (
      <div className="fmo-overlay" style={{ clipPath }} data-testid="selection-overlay-badges">
        {badges}
      </div>
    ) : null;
  }
  const g = geometry;
  const w = props.wording.selection;
  // R31, R32, R33: four straight lines round the item, outset 8 px (at least 44 px), handles on those corners, the
  // turn handle above, or below or at the end side when it would touch another item or the edge of the free stage.
  const obstacles: Rect[] = [
    ...items.filter((b) => b.layerId !== g.layerId && b.facing).map((b) => boundsOf(b.corners)),
    { x: -1e4, y: -1e4, width: 2e4, height: 1e4 + clip.top },
    { x: -1e4, y: g.height - clip.bottom, width: 2e4, height: 1e4 },
    ...(props.controls ?? []),
  ];
  const frame = selectionFrame(g.corners, g.centre, obstacles);
  const handles = frame.corners;

  const local = (event: ReactPointerEvent<Element>): Pt => {
    const svg = (event.currentTarget as Element).closest("svg")!.getBoundingClientRect();
    return { x: event.clientX - svg.left, y: event.clientY - svg.top };
  };
  const onDown = (event: ReactPointerEvent<SVGElement>) => {
    if (event.button !== 0) return;
    const kind = event.currentTarget.dataset.kind === "rotate" ? "rotate" : "resize";
    event.stopPropagation();
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const start = local(event);
    // How far the handle sits beyond the item's corner it stands for (the item's corner follows the pointer).
    const k = Number(event.currentTarget.dataset.corner ?? -1);
    const itemCorner = g.corners[k];
    const outset = kind === "resize" && itemCorner ? Math.max(0, Math.hypot(start.x - g.centre.x, start.y - g.centre.y) - Math.hypot(itemCorner.x - g.centre.x, itemCorner.y - g.centre.y)) : 0;
    gesture.current = { kind, pointerId: event.pointerId, centre: g.centre, start, mirrored: g.mirrored, outset };
    if (kind === "resize") props.onResize("start", 1);
    else props.onRotate("start", 0, event.altKey);
  };
  const onMove = (event: ReactPointerEvent<SVGElement>) => {
    const s = gesture.current;
    if (!s || s.pointerId !== event.pointerId) return;
    event.preventDefault();
    const now = local(event);
    if (s.kind === "resize") props.onResize("move", resizeFactor(s.centre, s.start, now, s.outset));
    else props.onRotate("move", turnDelta(s.centre, s.start, now, s.mirrored), event.altKey);
  };
  const onLost = (event: ReactPointerEvent<SVGElement>) => {
    // After a release the gesture is already over; otherwise the browser took the pointer away.
    if (gesture.current?.pointerId === event.pointerId) interrupt("lost-capture");
  };
  const onUp = (event: ReactPointerEvent<SVGElement>) => {
    const s = gesture.current;
    if (!s || s.pointerId !== event.pointerId) return;
    gesture.current = null;
    const phase = event.type === "pointercancel" ? "cancel" : "end";
    if (s.kind === "resize") props.onResize(phase, resizeFactor(s.centre, s.start, local(event), s.outset));
    else props.onRotate(phase, turnDelta(s.centre, s.start, local(event), s.mirrored), event.altKey);
  };

  const freeCentre = (g.width - props.insets.right) / 2;
  const half = HANDLE_SIZE / 2;
  const hit = HANDLE_HIT / 2;
  return (
    <div
      className="fmo-overlay"
      style={{ clipPath }}
      data-testid="selection-overlay"
      data-facing={g.facing}
      data-turn-place={frame.turnPlace}
      data-box={JSON.stringify({ centre: g.centre, corners: handles, item: g.corners, turn: frame.turn, angle: Math.round(g.angle) })}
    >
      <svg width={g.width} height={g.height} aria-hidden="true">
        {g.guides.map((guide, k) =>
          // R35: a guide is never drawn through the item being placed.
          (guide.kind === "guide" ? clipRunsOutside(guide.runs, handles, 4) : guide.runs).map((run, j) => (
            <g key={`${k}-${j}`} className={guide.kind === "area" ? "fmo-area" : "fmo-guide"} data-testid={guide.kind === "area" ? "print-area-line" : "snap-guide"}>
              <polyline points={points(run)} className="fmo-guide-halo" />
              <polyline points={points(run)} className="fmo-guide-line" />
            </g>
          )),
        )}
        {g.facing && (
          <>
            <polygon points={points(handles)} className="fmo-box-halo" />
            <polygon points={points(handles)} className="fmo-box-line" />
            <line x1={frame.stemFrom.x} y1={frame.stemFrom.y} x2={frame.turn.x} y2={frame.turn.y} className="fmo-stem-halo" />
            <line x1={frame.stemFrom.x} y1={frame.stemFrom.y} x2={frame.turn.x} y2={frame.turn.y} className="fmo-stem" />
            {handles.map((c, k) => (
              <g key={k} data-testid={`handle-corner-${k}`}>
                <rect x={c.x - half} y={c.y - half} width={HANDLE_SIZE} height={HANDLE_SIZE} className="fmo-handle" />
                <rect x={c.x - hit} y={c.y - hit} width={HANDLE_HIT} height={HANDLE_HIT} className="fmo-hit" data-kind="resize" data-corner={k} data-cursor={k % 2 === 0 ? "nwse" : "nesw"} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onLostPointerCapture={onLost} />
              </g>
            ))}
            <g data-testid="handle-turn">
              <circle cx={frame.turn.x} cy={frame.turn.y} r={TURN_KNOB / 2} className="fmo-handle" />
              <circle cx={frame.turn.x} cy={frame.turn.y} r={hit} className="fmo-hit fmo-hit-turn" data-kind="rotate" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onLostPointerCapture={onLost} />
            </g>
          </>
        )}
      </svg>
      {badges}
      {!g.facing && (
        <button type="button" className="fmo-chip fmo-turn-to" style={{ top: props.top + 8, left: freeCentre }} onClick={props.onTurnTo} data-testid="turn-to-edit">
          <EditorIcon name="reset" size={20} />
          <span>{w.turnToEdit}</span>
        </button>
      )}
    </div>
  );
}
