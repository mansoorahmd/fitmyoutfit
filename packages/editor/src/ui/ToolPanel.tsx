/**
 * The six tool tabs (06-editor.md 3.2: a dock at the bottom on compact, a
 * rail on short and wide; a tablist with arrow keys) and the tool panel (3.3
 * to 3.5): on compact a bottom panel with a normal and an expanded height
 * (drag the grab strip, or "Show all"; dragging is never the only way), on
 * short a 320 px side panel, on wide a 360 px panel that is always open.
 * One panel at a time; further choices open inside it.
 */
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import type { EditorWording } from "./content.js";
import type { ToolId } from "./context.js";
import { EditorIcon, type IconName } from "./icons.js";
import type { EditorLayout, PanelDetent } from "./layout.js";

export const TOOL_ORDER: readonly ToolId[] = ["design", "colours", "team", "players", "logos", "text"];
const TOOL_ICONS: Record<ToolId, IconName> = { design: "design", colours: "colours", team: "team", players: "players", logos: "logos", text: "text" };

export function ToolTabs({ layout, tools, active, wording, disabled, onSelect }: { layout: EditorLayout; tools: readonly ToolId[]; active: ToolId | null; wording: EditorWording; disabled: boolean; onSelect: (tool: ToolId) => void }) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const [focusIndex, setFocusIndex] = useState(Math.max(0, tools.indexOf(active ?? tools[0]!)));
  const onKey = (event: KeyboardEvent<HTMLDivElement>) => {
    const vertical = layout !== "compact";
    const next = (vertical ? event.key === "ArrowDown" : event.key === "ArrowRight") ? 1 : (vertical ? event.key === "ArrowUp" : event.key === "ArrowLeft") ? -1 : 0;
    let index = focusIndex;
    if (next !== 0) index = (focusIndex + next + tools.length) % tools.length;
    else if (event.key === "Home") index = 0;
    else if (event.key === "End") index = tools.length - 1;
    else return;
    event.preventDefault();
    setFocusIndex(index);
    refs.current[index]?.focus();
  };
  return (
    <div className={layout === "compact" ? "fmo-tabs fmo-dock" : "fmo-tabs fmo-rail"} role="tablist" aria-label={wording.tools.toolsName} aria-orientation={layout === "compact" ? "horizontal" : "vertical"} onKeyDown={onKey} data-testid="tool-tabs">
      {tools.map((tool, k) => (
        <button
          key={tool}
          ref={(el) => {
            refs.current[k] = el;
          }}
          type="button"
          role="tab"
          id={`fmo-tab-${tool}`}
          aria-selected={active === tool}
          aria-controls={active === tool ? "fmo-panel" : undefined}
          aria-disabled={disabled}
          tabIndex={k === focusIndex ? 0 : -1}
          className="fmo-tab"
          title={wording.tools[tool]}
          onFocus={() => setFocusIndex(k)}
          onClick={() => onSelect(tool)}
          data-testid={`tab-${tool}`}
        >
          <EditorIcon name={TOOL_ICONS[tool]} />
          <span className="fmo-tab-label">{wording.tools[tool]}</span>
        </button>
      ))}
    </div>
  );
}

export interface ToolPanelProps {
  layout: EditorLayout;
  tool: ToolId;
  wording: EditorWording;
  detent: PanelDetent;
  heights: { normal: number; expanded: number };
  typing: boolean;
  onDetent: (detent: PanelDetent) => void;
  onClose: () => void;
  /** The panel's size as it settles (for the camera's framing). */
  onSize: (size: { width: number; height: number }) => void;
  /** A title of its own (the list "On this kit" in the panel's place); it has no tool tip. */
  title?: string;
  children: ReactNode;
}

export function ToolPanel(props: ToolPanelProps) {
  const { layout, wording, detent, heights, tool } = props;
  const ref = useRef<HTMLElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const [help, setHelp] = useState(false);
  /** The content's own height: when it fits the normal height there is nothing more to show. */
  const [natural, setNatural] = useState(0);
  const [drag, setDrag] = useState<{ start: number; startHeight: number; height: number } | null>(null);
  const compact = layout === "compact";
  const onSize = useRef(props.onSize);
  useEffect(() => {
    onSize.current = props.onSize;
  });
  // Tell the shell the panel's size whenever it changes (it re-frames the garment when it settles).
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const report = () => onSize.current({ width: el.offsetWidth, height: el.offsetHeight });
    report();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(report);
    observer.observe(el);
    return () => observer.disconnect();
  }, [layout]);

  useEffect(() => {
    const el = inner.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const measure = () => setNatural(el.scrollHeight);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [tool]);
  // Chrome round the content: the grab strip, the header, the body's padding.
  const fitsNormal = natural > 0 && natural + 24 + 48 + 16 <= heights.normal;
  // Changing tools keeps an expanded panel expanded only when the new tool has more to show (3.3).
  const onDetent = useRef(props.onDetent);
  useEffect(() => {
    onDetent.current = props.onDetent;
  });
  useEffect(() => {
    if (compact && detent === "expanded" && fitsNormal) onDetent.current("normal");
    // Only when the tool changes, not while the coach is looking at an expanded panel.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tool, fitsNormal]);

  const height = compact ? (drag ? drag.height : detent === "expanded" ? heights.expanded : undefined) : undefined;
  const maxHeight = compact && detent !== "expanded" && !drag ? heights.normal : undefined;

  const endDrag = (y: number) => {
    if (!drag) return;
    const moved = drag.start - y; // up is positive
    setDrag(null);
    if (detent === "expanded") {
      if (moved < -40) props.onDetent(moved < -heights.expanded * 0.5 ? "closed" : "normal");
    } else if (moved > 40) props.onDetent("expanded");
    else if (moved < -60) props.onDetent("closed");
  };

  return (
    <section
      ref={ref}
      id="fmo-panel"
      className="fmo-panel"
      role={layout === "wide" ? "tabpanel" : "region"}
      aria-labelledby="fmo-panel-title"
      data-detent={detent}
      data-typing={props.typing}
      style={{ height, maxHeight, transition: drag ? "none" : undefined }}
      data-testid="tool-panel"
    >
      {compact && (
        <div
          className="fmo-grab"
          aria-hidden="true"
          onPointerDown={(e) => {
            (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
            const h = ref.current?.offsetHeight ?? heights.normal;
            setDrag({ start: e.clientY, startHeight: h, height: h });
          }}
          onPointerMove={(e) => drag && setDrag({ ...drag, height: Math.max(80, Math.min(heights.expanded, drag.startHeight + (drag.start - e.clientY))) })}
          onPointerUp={(e) => endDrag(e.clientY)}
          onPointerCancel={() => setDrag(null)}
        />
      )}
      <div className="fmo-panel-head">
        <h2 className="fmo-panel-title" id="fmo-panel-title">
          {props.title ?? wording.tools[tool]}
        </h2>
        {!props.title && (
          <button type="button" className="fmo-icon-btn" aria-label={wording.tools.help} aria-expanded={help} title={wording.tools.help} onClick={() => setHelp((h) => !h)} data-testid="panel-help">
            <EditorIcon name="help" />
          </button>
        )}
        {compact && (!fitsNormal || detent === "expanded") && (
          <button type="button" className="fmo-btn fmo-btn-text" onClick={() => props.onDetent(detent === "expanded" ? "normal" : "expanded")} data-testid="panel-expand">
            {detent === "expanded" ? wording.tools.showLess : wording.tools.showAll}
          </button>
        )}
        {layout !== "wide" && (
          <button type="button" className="fmo-icon-btn" aria-label={wording.tools.closePanel} title={wording.tools.closePanel} onClick={props.onClose} data-testid="panel-close">
            <EditorIcon name={compact ? "chevronDown" : "close"} />
          </button>
        )}
      </div>
      {help && !props.title && <p className="fmo-help">{wording.help[tool]}</p>}
      <div className="fmo-panel-body">
        <div ref={inner} className="fmo-panel-inner fmo-stack">
          {props.children}
        </div>
      </div>
    </section>
  );
}
