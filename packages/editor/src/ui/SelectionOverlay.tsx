/**
 * The selected item's handles over the 3D model (06-editor.md 5.2): the box
 * as a two-tone line that follows the cloth, four corner handles that resize
 * evenly, a turn handle on a stem, and the snapping guides and print area
 * while placing. Drawn as SVG over the canvas, never into the texture, so a
 * handle never waits for a repaint. Its geometry comes from the canvas (the
 * UV lookup, N9) through a small store, so only this overlay re-renders as the
 * camera turns.
 *
 * When the item faces away from the camera the handles hide and one control,
 * "Turn to edit", turns the garment to it.
 */
import { useCallback, useEffect, useRef, useSyncExternalStore, type PointerEvent as ReactPointerEvent } from "react";
import type { SelectionGeometry } from "../react/DesignCanvas.js";
import type { ViewInsets } from "../react/camera.js";
import type { EditorWording } from "./content.js";
import { EditorIcon } from "./icons.js";
import { HANDLE_HIT, HANDLE_SIZE, TURN_KNOB, resizeFactor, turnDelta, type Bus, type Pt } from "./handles.js";
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
  /** The item has a warning (blurry, cut off, a box, hard to read): a badge at its top right corner (4.6). */
  warn?: boolean;
}

const points = (list: readonly Pt[]) => list.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");

export function SelectionOverlay(props: SelectionOverlayProps) {
  const geometry = useSyncExternalStore(props.bus.subscribe, props.bus.get, props.bus.get);
  const gesture = useRef<{ kind: "resize" | "rotate"; pointerId: number; centre: Pt; start: Pt; mirrored: boolean } | null>(null);
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
  if (!geometry || props.hidden) return null;
  const g = geometry;
  const w = props.wording.selection;

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
    gesture.current = { kind, pointerId: event.pointerId, centre: g.centre, start: local(event), mirrored: g.mirrored };
    if (kind === "resize") props.onResize("start", 1);
    else props.onRotate("start", 0, event.altKey);
  };
  const onMove = (event: ReactPointerEvent<SVGElement>) => {
    const s = gesture.current;
    if (!s || s.pointerId !== event.pointerId) return;
    event.preventDefault();
    const now = local(event);
    if (s.kind === "resize") props.onResize("move", resizeFactor(s.centre, s.start, now));
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
    if (s.kind === "resize") props.onResize(phase, resizeFactor(s.centre, s.start, local(event)));
    else props.onRotate(phase, turnDelta(s.centre, s.start, local(event), s.mirrored), event.altKey);
  };

  const freeCentre = (g.width - props.insets.right) / 2;
  const half = HANDLE_SIZE / 2;
  const hit = HANDLE_HIT / 2;
  return (
    <div className="fmo-overlay" data-testid="selection-overlay" data-facing={g.facing} data-box={JSON.stringify({ centre: g.centre, corners: g.corners, turn: g.turn, angle: Math.round(g.angle) })}>
      <svg width={g.width} height={g.height} aria-hidden="true">
        {g.guides.map((guide, k) =>
          guide.runs.map((run, j) => (
            <g key={`${k}-${j}`} className={guide.kind === "area" ? "fmo-area" : "fmo-guide"} data-testid={guide.kind === "area" ? "print-area-line" : "snap-guide"}>
              <polyline points={points(run)} className="fmo-guide-halo" />
              <polyline points={points(run)} className="fmo-guide-line" />
            </g>
          )),
        )}
        {g.facing && (
          <>
            <polygon points={points(g.outline)} className="fmo-box-halo" />
            <polygon points={points(g.outline)} className="fmo-box-line" />
            <line x1={g.top.x} y1={g.top.y} x2={g.turn.x} y2={g.turn.y} className="fmo-stem-halo" />
            <line x1={g.top.x} y1={g.top.y} x2={g.turn.x} y2={g.turn.y} className="fmo-stem" />
            {g.corners.map((c, k) => (
              <g key={k} data-testid={`handle-corner-${k}`}>
                <rect x={c.x - half} y={c.y - half} width={HANDLE_SIZE} height={HANDLE_SIZE} className="fmo-handle" />
                <rect x={c.x - hit} y={c.y - hit} width={HANDLE_HIT} height={HANDLE_HIT} className="fmo-hit" data-kind="resize" data-cursor={k % 2 === 0 ? "nwse" : "nesw"} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onLostPointerCapture={onLost} />
              </g>
            ))}
            <g data-testid="handle-turn">
              <circle cx={g.turn.x} cy={g.turn.y} r={TURN_KNOB / 2} className="fmo-handle" />
              <circle cx={g.turn.x} cy={g.turn.y} r={hit} className="fmo-hit fmo-hit-turn" data-kind="rotate" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onLostPointerCapture={onLost} />
            </g>
          </>
        )}
      </svg>
      {g.facing && props.warn && (
        <span className="fmo-badge fmo-overlay-badge" style={{ left: g.corners[1]!.x + 14, top: g.corners[1]!.y - 14 }} aria-hidden="true" data-testid="selection-badge">
          <EditorIcon name="alert" size={16} />
        </span>
      )}
      {!g.facing && (
        <button type="button" className="fmo-chip fmo-turn-to" style={{ top: props.top + 8, left: freeCentre }} onClick={props.onTurnTo} data-testid="turn-to-edit">
          <EditorIcon name="reset" size={20} />
          <span>{w.turnToEdit}</span>
        </button>
      )}
    </div>
  );
}
