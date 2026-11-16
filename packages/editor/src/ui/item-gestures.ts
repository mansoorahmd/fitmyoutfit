/**
 * Placing an item on the model (06-editor.md 5.1, 5.2): a drag, a corner
 * resize or a turn, as one plain controller (no React), so every way a
 * gesture can end goes through ONE path (E3c, B1).
 *
 * A gesture starts on a press, shows previews while the pointer moves, and
 * ends exactly once: on release it is committed (one undo step, none when
 * nothing changed); on anything else that interrupts it (a system cancel, the
 * pointer capture lost, the handle unmounted, the tab hidden, a second finger,
 * the window losing focus) it is cancelled and the item goes back. Either way
 * the print-area lines and the snapping guides go, and the "placing" state is
 * cleared, so the tools show the current design again. Events that arrive for
 * a gesture already ended (a late move or release) are ignored.
 *
 * Every preview keeps the item inside its print area by the print-area rule
 * (`fitLayerToArea`); a turn that only fits smaller makes it smaller, and the
 * coach is told when the gesture is committed.
 */
import { updateLayer } from "../design/edit.js";
import { scaleLayer } from "../design/placement.js";
import { fitLayerToArea } from "../design/print-area.js";
import { limitScale } from "../design/item-edits.js";
import { printAreaLines, snapPosition, snapReachMm } from "../design/snapping.js";
import type { DesignDocument, Layer, Point, ProductDefinition } from "../design/schema.js";
import type { EditLabel } from "../state/history.js";
import { snapAngle } from "./handles.js";

export type GestureKind = "move" | "resize" | "rotate";
export type GesturePhase = "start" | "move" | "end" | "cancel";

/** Every way a gesture can end. */
export type GestureEndReason =
  | "release"
  | "cancel"
  | "lost-capture"
  | "unmount"
  | "hidden"
  | "second-pointer"
  | "blur"
  | "tool-change"
  | "selection-change"
  | "done-panel";

/**
 * What an ending does: the coach's release, and their own choice of another tool, item or the Done panel,
 * keep what they placed; anything the system or a second finger does puts the item back.
 */
export function gestureEndOutcome(reason: GestureEndReason): "commit" | "cancel" {
  return reason === "release" || reason === "tool-change" || reason === "selection-change" || reason === "done-panel" ? "commit" : "cancel";
}

/** A line to draw over the model while placing: the print area's edge, or a guide snapped to (piece mm). */
export interface PlacingGuide {
  pieceId: string;
  from: Point;
  to: Point;
  kind: "guide" | "area";
}

export interface ItemGestureDeps {
  product(): ProductDefinition;
  /** The design as it is now (the gesture's previews included). */
  design(): DesignDocument;
  history: {
    begin(label: EditLabel): void;
    preview(update: (design: DesignDocument) => DesignDocument): void;
    end(): void;
    cancel(): void;
  };
  setGuides(guides: PlacingGuide[]): void;
  /** The gesture going on (draft quality, the tools' frozen design), or null. */
  setPlacing(kind: GestureKind | null): void;
  /** Snapping is on (the coach's setting); Alt held turns it off for one move. */
  snapping(): boolean;
  /** A new snap line caught the item (a short buzz). */
  onSnap?(): void;
  /** The gesture ended. `shrunk`: the item had to be made smaller to stay in its print area. */
  onEnd?(info: { kind: GestureKind; outcome: "commit" | "cancel"; reason: GestureEndReason; layerId: string; shrunk: boolean }): void;
}

export interface DragEventLike {
  phase: GesturePhase;
  layerId: string;
  pieceId: string;
  position: Point;
  free?: boolean;
  pxPerMm?: number;
  /** On "end": false when the pointer never travelled (a click): nothing moves, no undo step. */
  moved?: boolean;
}

export interface ItemGestures {
  /** The open gesture, or null. */
  active(): { kind: GestureKind; layerId: string } | null;
  /** A corner handle: `factor` from the gesture's start. */
  resize(layerId: string, phase: GesturePhase, factor: number): void;
  /** The turn handle: degrees turned since the start; `free` with Alt (no snapping). */
  rotate(layerId: string, phase: GesturePhase, degrees: number, free: boolean): void;
  /** A drag of the item on the model (the canvas's events). */
  drag(event: DragEventLike): void;
  /** Ends the open gesture (committed or cancelled by the reason). Returns what was done, or null when none was open. */
  finish(reason: GestureEndReason): "commit" | "cancel" | null;
}

const areaGuides = (product: ProductDefinition, pieceId: string): PlacingGuide[] => printAreaLines(product, pieceId).map((l) => ({ ...l, kind: "area" as const }));

/** The layer's fields a gesture changes. */
function placement(layer: Layer): Partial<Layer> {
  const { position, size, rotation } = layer;
  return layer.kind === "text" || layer.kind === "number" ? { position, size, rotation, fontSize: layer.fontSize } : { position, size, rotation };
}

export function createItemGestures(deps: ItemGestureDeps): ItemGestures {
  let open: { kind: GestureKind; layerId: string; start: Layer; shrunk: boolean; snapKey: string } | null = null;

  const begin = (kind: GestureKind, layerId: string): boolean => {
    // A new gesture while one is open (it should not happen): the old one is kept as it is.
    if (open) finish("release");
    const start = deps.design().layers.find((l) => l.id === layerId);
    if (!start) return false;
    open = { kind, layerId, start, shrunk: false, snapKey: "" };
    deps.history.begin(kind);
    deps.setGuides(areaGuides(deps.product(), start.pieceId));
    deps.setPlacing(kind);
    return true;
  };

  /** Shows the item placed as `wanted`, inside its print area (the rule). */
  const show = (wanted: Layer) => {
    if (!open) return;
    const product = deps.product();
    const fitted = fitLayerToArea(product, wanted);
    if (fitted.size.width < wanted.size.width - 1e-6 && open.kind !== "resize") open.shrunk = true;
    const id = open.layerId;
    deps.history.preview((d) => {
      // The updater must not throw (it runs inside the history's state update).
      try {
        return updateLayer(d, id, placement(fitted), { product });
      } catch (error) {
        console.error("[editor] placing refused:", error);
        return d;
      }
    });
  };

  function finish(reason: GestureEndReason): "commit" | "cancel" | null {
    const now = open;
    if (!now) return null;
    open = null;
    const outcome = gestureEndOutcome(reason);
    if (outcome === "commit") deps.history.end();
    else deps.history.cancel();
    deps.setGuides([]);
    deps.setPlacing(null);
    deps.onEnd?.({ kind: now.kind, outcome, reason, layerId: now.layerId, shrunk: outcome === "commit" && now.shrunk });
    return outcome;
  }

  /** The common end of the handles' phases: "end" commits, "cancel" cancels. */
  const ended = (phase: GesturePhase) => {
    if (phase === "end") finish("release");
    else if (phase === "cancel") finish("cancel");
  };

  return {
    active: () => (open ? { kind: open.kind, layerId: open.layerId } : null),
    finish,
    resize(layerId, phase, factor) {
      if (phase === "start") {
        begin("resize", layerId);
        return;
      }
      if (!open || open.kind !== "resize" || open.layerId !== layerId) return;
      if (phase === "cancel") {
        finish("cancel");
        return;
      }
      const product = deps.product();
      const start = open.start;
      const scaled = scaleLayer(start, limitScale(product, start, factor));
      show({ ...start, ...scaled } as Layer);
      ended(phase);
    },
    rotate(layerId, phase, degrees, free) {
      if (phase === "start") {
        begin("rotate", layerId);
        return;
      }
      if (!open || open.kind !== "rotate" || open.layerId !== layerId) return;
      if (phase === "cancel") {
        finish("cancel");
        return;
      }
      const start = open.start;
      // Turned about its centre from the size it had at the start: it shrinks only while the turn needs it.
      show({ ...start, rotation: snapAngle(start.rotation + degrees, free).angle });
      ended(phase);
    },
    drag(event) {
      if (event.phase === "start") {
        begin("move", event.layerId);
        return;
      }
      if (!open || open.kind !== "move" || open.layerId !== event.layerId) return;
      if (event.phase === "cancel") {
        finish("cancel");
        return;
      }
      if (event.phase === "end" && event.moved === false) {
        // A press and release without travel: never a move (B3). Ending with nothing changed records no step.
        finish("release");
        return;
      }
      const product = deps.product();
      const current = deps.design();
      const layer = current.layers.find((l) => l.id === event.layerId);
      if (!layer) {
        finish("cancel");
        return;
      }
      const snapped = snapPosition(product, current, layer, event.position, { reachMm: snapReachMm(event.pxPerMm), free: Boolean(event.free) || !deps.snapping() });
      show({ ...layer, position: snapped.position });
      const snapKey = snapped.guides.map((g) => `${g.axis}${g.from.x},${g.from.y}`).join("|");
      if (snapKey && snapKey !== open.snapKey) deps.onSnap?.();
      open.snapKey = snapKey;
      if (event.phase === "end") finish("release");
      else deps.setGuides([...areaGuides(product, layer.pieceId), ...snapped.guides.map((g) => ({ pieceId: g.pieceId, from: g.from, to: g.to, kind: "guide" as const }))]);
    },
  };
}

/** A stable stand-in that forwards to the controller in `holder` once it exists (React creates it in an effect). */
export function forwardGestures(holder: { readonly current: ItemGestures | null }): ItemGestures {
  return {
    active: () => holder.current?.active() ?? null,
    resize: (id, phase, factor) => holder.current?.resize(id, phase, factor),
    rotate: (id, phase, degrees, free) => holder.current?.rotate(id, phase, degrees, free),
    drag: (event) => holder.current?.drag(event),
    finish: (reason) => holder.current?.finish(reason) ?? null,
  };
}
