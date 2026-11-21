/**
 * E3f: what the mouse pointer is over on the model, shown over the canvas: an item (name, number, logo, text) gets
 * a thin outline of its box; a part of the garment is marked softly on the model itself (by the canvas) and named
 * by a small label that follows the pointer. Never in the way of a press: nothing here takes the pointer.
 */
import { useEffect, useRef } from "react";
import type { CanvasHover } from "../react/DesignCanvas.js";

const LABEL_GAP_X = 14;
const LABEL_GAP_Y = 18;

export function HoverMarks({ hover, name }: { hover: CanvasHover | null; name: string | null }) {
  const label = useRef<HTMLSpanElement>(null);
  const isPart = hover?.kind === "part" && Boolean(name);
  // The label follows the pointer by its own style, not by React (the pointer moves far more often than the hover changes).
  useEffect(() => {
    if (!isPart) return;
    const move = (event: PointerEvent) => {
      const el = label.current;
      const host = el?.parentElement;
      if (!el || !host) return;
      const r = host.getBoundingClientRect();
      const x = Math.min(event.clientX - r.left + LABEL_GAP_X, r.width - el.offsetWidth - 8);
      el.style.transform = `translate(${Math.max(8, x)}px, ${event.clientY - r.top + LABEL_GAP_Y}px)`;
    };
    window.addEventListener("pointermove", move);
    return () => window.removeEventListener("pointermove", move);
  }, [isPart]);
  if (!hover) return null;
  if (hover.kind === "item") {
    // The selected item has its handles; the others get their box drawn.
    if (hover.selected || !hover.corners || hover.corners.length < 3) return null;
    const points = hover.corners.map((c) => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(" ");
    return (
      <svg className="fmo-hover-box" aria-hidden="true" data-testid="hover-box" data-layer={hover.layerId}>
        <polygon points={points} className="fmo-hover-halo" />
        <polygon points={points} className="fmo-hover-line" />
      </svg>
    );
  }
  if (!name) return null;
  return (
    <span ref={label} className="fmo-hover-label" style={{ transform: `translate(${hover.x + LABEL_GAP_X}px, ${hover.y + LABEL_GAP_Y}px)` }} aria-hidden="true" data-testid="hover-label">
      {name}
    </span>
  );
}
