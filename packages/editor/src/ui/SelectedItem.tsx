/**
 * The selected item's controls (06-editor.md 5.2): the contextual bar (its
 * name; Delete, Duplicate where allowed, More with Bring forward, Send back
 * and Edit; Done), the "cut off at the seam" note with Move it in, and
 * Fine-tune (size, turn, straighten, move by steps, centre, snapping), the way
 * to do everything without dragging (WCAG 2.5.7). On a phone the bar sits on
 * the stage and never over the item; on a desktop it heads the panel.
 */
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { removeLayer } from "../design/edit.js";
import { KEY_NUDGE_LARGE_MM, KEY_NUDGE_MM, NUDGE_MM, SIZE_STEP, TURN_STEP, bringForward, canDuplicate, centreLayer, duplicateLayer, nudgeLayer, rotateLayerBy, rotateLayerTo, scaleLayerBy, sendBack } from "../design/item-edits.js";
import { isClipped, moveInside } from "../design/print-area.js";
import type { DesignDocument, Layer } from "../design/schema.js";
import type { EditLabel } from "../state/history.js";
import type { SelectionGeometry } from "../react/DesignCanvas.js";
import { fill } from "./content.js";
import { useEditor } from "./context.js";
import { HANDLE_HIT, type Bus } from "./handles.js";
import { EditorIcon, type IconName } from "./icons.js";
import { itemWords } from "./items.js";
import { Alert, SwitchRow } from "./parts.js";
import { CONTEXT_BAR_HEIGHT, contextBarPlacement, itemScreenBox, toolForLayer } from "./selection.js";

function useSelectedLayer(): Layer | null {
  const { design, selectedId } = useEditor();
  return selectedId ? (design.layers.find((l) => l.id === selectedId) ?? null) : null;
}

/** The bar's buttons, for the stage (phone) and the panel (desktop). */
export function ContextBar({ variant }: { variant: "stage" | "panel" }) {
  const api = useEditor();
  const { product, wording, assets } = api;
  const layer = useSelectedLayer();
  const [menu, setMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menu) return;
    const close = (e: PointerEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenu(false);
    };
    window.addEventListener("pointerdown", close, true);
    return () => window.removeEventListener("pointerdown", close, true);
  }, [menu]);
  if (!layer) return null;
  const w = wording.selection;
  const words = itemWords(wording, product, layer, { fileName: assets.fileName });
  const index = api.design.layers.findIndex((l) => l.id === layer.id);
  const duplicable = canDuplicate(layer);
  return (
    <div className={`fmo-context fmo-context-${variant}`} role="toolbar" aria-label={fill(w.actionsFor, { item: words.name })} data-testid={`context-bar-${variant}`}>
      <span className="fmo-context-name fmo-bdi" dir="auto">
        {words.name}
      </span>
      <button type="button" className="fmo-context-btn" onClick={() => api.commit((d) => removeLayer(d, layer.id), "remove-item") && api.select(null)} data-testid="context-delete">
        <EditorIcon name="trash" size={20} />
        <span>{w.delete}</span>
      </button>
      {duplicable && (
        <button
          type="button"
          className="fmo-context-btn"
          onClick={() => {
            let copy: string | null = null;
            if (
              api.commit((d) => {
                const out = duplicateLayer(d, layer.id, { product });
                copy = out.id;
                return out.design;
              }, "add-item") &&
              copy
            )
              api.select(copy);
          }}
          data-testid="context-duplicate"
        >
          <EditorIcon name="copy" size={20} />
          <span>{w.duplicate}</span>
        </button>
      )}
      <div className="fmo-context-more" ref={menuRef}>
        <button type="button" className="fmo-context-btn" aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu((m) => !m)} data-testid="context-more">
          <EditorIcon name="more" size={20} />
          <span>{w.more}</span>
        </button>
        {menu && (
          <div className="fmo-menu" role="menu" data-testid="context-menu">
            <button type="button" role="menuitem" aria-disabled={index === api.design.layers.length - 1} onClick={() => index < api.design.layers.length - 1 && api.commit((d) => bringForward(d, layer.id), "order")} data-testid="context-forward">
              <EditorIcon name="forward" size={20} />
              {w.bringForward}
            </button>
            <button type="button" role="menuitem" aria-disabled={index === 0} onClick={() => index > 0 && api.commit((d) => sendBack(d, layer.id), "order")} data-testid="context-back">
              <EditorIcon name="back" size={20} />
              {w.sendBack}
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setMenu(false);
                api.openTool(toolForLayer(layer));
              }}
              data-testid="context-edit"
            >
              <EditorIcon name={toolForLayer(layer)} size={20} />
              {w.edit}
            </button>
          </div>
        )}
      </div>
      <button type="button" className="fmo-context-btn" onClick={() => api.select(null)} data-testid="context-done">
        <EditorIcon name="check" size={20} />
        <span>{w.done}</span>
      </button>
    </div>
  );
}

/**
 * The bar on the stage (phones): at the top under the credit line, or at the
 * bottom of the free area when the item reaches into the top band (the
 * placement rule in selection.ts).
 */
export function StageContextBar({ bus, top, bottomInset }: { bus: Bus<SelectionGeometry | null>; top: number; bottomInset: number }) {
  const geometry = useSyncExternalStore(bus.subscribe, bus.get, bus.get);
  const api = useEditor();
  if (!api.selectedId) return null;
  const item = geometry && geometry.facing ? itemScreenBox([...geometry.corners, geometry.turn], HANDLE_HIT / 2) : null;
  const freeBottom = (geometry?.height ?? 0) - bottomInset;
  const place = geometry ? contextBarPlacement({ top, freeBottom, item }) : "top";
  return (
    <div className="fmo-context-place" style={place === "top" ? { top } : { top: freeBottom - CONTEXT_BAR_HEIGHT }} data-place={place} data-testid="context-bar-place">
      <ContextBar variant="stage" />
    </div>
  );
}

/** "Part of this is cut off at the seam." with Move it in, when the selected item crosses its piece's outline. */
export function ClippedNote() {
  const api = useEditor();
  const layer = useSelectedLayer();
  // Once per position, size and turn (the search for a place that fits is not free).
  const key = layer ? JSON.stringify([layer.pieceId, layer.position, layer.size, layer.rotation]) : "";
  const check = useMemo(() => {
    if (!layer) return null;
    return isClipped(api.product, layer) ? { at: moveInside(api.product, layer) } : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the key holds what the check reads
  }, [key, api.product]);
  if (!layer || !check) return null;
  const at = check.at;
  const w = api.wording.selection;
  return (
    <Alert kind="warning" testId="clipped-note">
      <p>{w.clipped}</p>
      {at ? (
        <button type="button" className="fmo-btn" onClick={() => api.commit((d) => nudgeLayer(d, layer.id, at.x - layer.position.x, at.y - layer.position.y, { product: api.product }), "move")} data-testid="move-it-in">
          {w.moveIn}
        </button>
      ) : (
        <p>{w.tooBigToFit}</p>
      )}
    </Alert>
  );
}

/** Fine-tune: closed by default; every step one undo step. Millimetres and degrees only on desktop, as secondary text. */
export function FineTune() {
  const api = useEditor();
  const layer = useSelectedLayer();
  const [open, setOpen] = useState(false);
  if (!layer) return null;
  const { product, wording } = api;
  const w = wording.selection;
  const opts = { product };
  const desktop = api.layout === "wide";
  const id = layer.id;
  const step = (edit: (d: DesignDocument) => DesignDocument, label: EditLabel) => () => api.commit(edit, label);
  return (
    <div className="fmo-finetune" data-testid="fine-tune">
      <button type="button" className="fmo-disclosure" aria-expanded={open} onClick={() => setOpen((o) => !o)} data-testid="fine-tune-toggle">
        <EditorIcon name={open ? "chevronUp" : "chevronDown"} size={20} />
        <span>{w.fineTune}</span>
      </button>
      {open && (
        <div className="fmo-stack" style={{ gap: 10 }}>
          <div className="fmo-ft-row">
            <span className="fmo-label">{w.size}</span>
            <button type="button" className="fmo-round" aria-label={w.smaller} title={w.smaller} onClick={step((d) => scaleLayerBy(d, id, 1 / SIZE_STEP, opts), "resize")} data-testid="ft-smaller">
              <EditorIcon name="minus" />
            </button>
            <button type="button" className="fmo-round" aria-label={w.bigger} title={w.bigger} onClick={step((d) => scaleLayerBy(d, id, SIZE_STEP, opts), "resize")} data-testid="ft-bigger">
              <EditorIcon name="plus" />
            </button>
            {desktop && <span className="fmo-muted">{fill(w.sizeMm, { width: Math.round(layer.size.width), height: Math.round(layer.size.height) })}</span>}
          </div>
          <div className="fmo-ft-row">
            <span className="fmo-label">{w.turn}</span>
            <button type="button" className="fmo-round" aria-label={w.turnLeft} title={w.turnLeft} onClick={step((d) => rotateLayerBy(d, id, -TURN_STEP, opts), "rotate")} data-testid="ft-turn-left">
              <EditorIcon name="turnLeft" />
            </button>
            <button type="button" className="fmo-round" aria-label={w.turnRight} title={w.turnRight} onClick={step((d) => rotateLayerBy(d, id, TURN_STEP, opts), "rotate")} data-testid="ft-turn-right">
              <EditorIcon name="turnRight" />
            </button>
            <button type="button" className="fmo-btn" aria-disabled={layer.rotation === 0} onClick={() => layer.rotation !== 0 && api.commit((d) => rotateLayerTo(d, id, 0, opts), "rotate")} data-testid="ft-straighten">
              {w.straighten}
            </button>
            {desktop && <span className="fmo-muted">{fill(w.degrees, { degrees: Math.round(layer.rotation) })}</span>}
          </div>
          <div className="fmo-ft-row">
            <span className="fmo-label">{w.move}</span>
            <RepeatButton label={w.moveLeft} icon="arrowLeft" onStep={() => api.commit((d) => nudgeLayer(d, id, -NUDGE_MM, 0, opts), "move")} testId="ft-left" />
            <RepeatButton label={w.moveRight} icon="arrowRight" onStep={() => api.commit((d) => nudgeLayer(d, id, NUDGE_MM, 0, opts), "move")} testId="ft-right" />
            <RepeatButton label={w.moveUp} icon="arrowUp" onStep={() => api.commit((d) => nudgeLayer(d, id, 0, -NUDGE_MM, opts), "move")} testId="ft-up" />
            <RepeatButton label={w.moveDown} icon="arrowDown" onStep={() => api.commit((d) => nudgeLayer(d, id, 0, NUDGE_MM, opts), "move")} testId="ft-down" />
          </div>
          <div className="fmo-row">
            <button type="button" className="fmo-btn" onClick={step((d) => centreLayer(d, id, opts), "move")} data-testid="ft-centre">
              {w.centre}
            </button>
          </div>
          <SwitchRow label={w.snap} checked={api.snapping} onChange={api.setSnapping} testId="ft-snap" />
          {desktop && <p className="fmo-muted">{w.keys}</p>}
        </div>
      )}
    </div>
  );
}

/** A button that repeats while held (a long press moves the item on, 06-editor.md 5.2); a click is one step. */
function RepeatButton({ label, icon, onStep, testId }: { label: string; icon: IconName; onStep: () => void; testId: string }) {
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const held = useRef(false);
  useEffect(() => () => {
    if (timer.current) clearInterval(timer.current);
  }, []);
  const stop = () => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
  };
  return (
    <button
      type="button"
      className="fmo-round"
      aria-label={label}
      title={label}
      onPointerDown={() => {
        stop();
        held.current = false;
        timer.current = setInterval(() => {
          held.current = true;
          onStep();
        }, 180);
      }}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      onClick={() => {
        // A long press already moved it; a short one (or Enter, Space) is one step.
        if (!held.current) onStep();
        held.current = false;
      }}
      data-testid={testId}
    >
      <EditorIcon name={icon} />
    </button>
  );
}

/** The keyboard steps for the selected item (06-editor.md 5.1), as an edit, or null for a key that is not one. */
export function keyEdit(key: string, shift: boolean): { kind: "nudge"; dx: number; dy: number } | { kind: "scale"; factor: number } | { kind: "rotate"; degrees: number } | { kind: "delete" } | null {
  const big = shift ? KEY_NUDGE_LARGE_MM : KEY_NUDGE_MM;
  switch (key) {
    case "ArrowLeft":
      return { kind: "nudge", dx: -big, dy: 0 };
    case "ArrowRight":
      return { kind: "nudge", dx: big, dy: 0 };
    case "ArrowUp":
      return { kind: "nudge", dx: 0, dy: -big };
    case "ArrowDown":
      return { kind: "nudge", dx: 0, dy: big };
    case "]":
    case "}":
      return shift || key === "}" ? { kind: "rotate", degrees: TURN_STEP } : { kind: "scale", factor: SIZE_STEP };
    case "[":
    case "{":
      return shift || key === "{" ? { kind: "rotate", degrees: -TURN_STEP } : { kind: "scale", factor: 1 / SIZE_STEP };
    case "Delete":
    case "Backspace":
      return { kind: "delete" };
    default:
      return null;
  }
}
