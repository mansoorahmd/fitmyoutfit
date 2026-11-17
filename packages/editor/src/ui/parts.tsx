/**
 * Small pieces the tools share: swatches, chips, segmented choices, switches,
 * alerts, the native dialog, the "Where" chips with their mini diagram. No
 * wording here: every word comes in through props from content.ts.
 */
import { useEffect, useRef, type ReactNode } from "react";
import { contrastRatio } from "../design/colour.js";
import type { DesignDocument, PlacementPreset, ProductDefinition } from "../design/schema.js";
import { useEditor } from "./context.js";
import { EditorIcon, type IconName } from "./icons.js";

/** White or ink, whichever stands out more on a colour (the swatch's check mark, 06-editor.md 4.3). */
export function markColourOn(hex: string): string {
  return contrastRatio("#FFFFFF", hex) >= contrastRatio("#0B1530", hex) ? "#FFFFFF" : "#0B1530";
}

export function Swatch({
  hex,
  label,
  selected,
  onPick,
  onPreview,
  testId,
  badge,
}: {
  hex: string;
  /** The accessible name ("Navy" or "Navy, selected"). */
  label: string;
  selected: boolean;
  onPick: () => void;
  /** Pointer devices: preview the colour while hovering (null on leave). */
  onPreview?: (on: boolean) => void;
  testId?: string;
  /** A small mark on the swatch's top end corner (the start card's pick order, "1", "2", "3"); the label says it in words. */
  badge?: string;
}) {
  return (
    <button
      type="button"
      className="fmo-swatch"
      style={{ background: hex }}
      aria-pressed={selected}
      aria-label={label}
      title={label}
      data-testid={testId}
      onClick={onPick}
      onPointerEnter={(e) => e.pointerType === "mouse" && onPreview?.(true)}
      onPointerLeave={(e) => e.pointerType === "mouse" && onPreview?.(false)}
    >
      {selected && (
        <span className="fmo-check" style={{ color: markColourOn(hex), display: "flex", alignItems: "center", justifyContent: "center" }}>
          <EditorIcon name="check" size={22} />
        </span>
      )}
      {badge && (
        <span className="fmo-swatch-order" aria-hidden="true">
          {badge}
        </span>
      )}
    </button>
  );
}

export function Chip({ pressed, onClick, children, label, title, testId, dot, marked }: { pressed?: boolean; onClick: () => void; children: ReactNode; label?: string; title?: string; testId?: string; dot?: string; marked?: boolean }) {
  return (
    <button type="button" className="fmo-chip" aria-pressed={pressed} aria-label={label} title={title} onClick={onClick} data-testid={testId}>
      {dot && (
        <span className="fmo-chip-dot" style={{ background: dot }}>
          {marked && (
            <span className="fmo-chip-mark">
              <EditorIcon name="check" size={10} />
            </span>
          )}
        </span>
      )}
      {children}
    </button>
  );
}

/** One choice of a few (outline, size, digits): a row of buttons, the chosen one pressed. */
export function Segmented<T extends string>({ value, options, onChange, label, testId }: { value: T | null; options: Array<{ value: T; label: string }>; onChange: (value: T) => void; label: string; testId?: string }) {
  return (
    <div className="fmo-segmented" role="group" aria-label={label} data-testid={testId}>
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={value === o.value} onClick={() => onChange(o.value)} data-value={o.value}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function SwitchRow({ label, checked, onChange, testId }: { label: string; checked: boolean; onChange: (on: boolean) => void; testId?: string }) {
  return (
    <label className="fmo-switch">
      <span>{label}</span>
      <input type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} data-testid={testId} />
    </label>
  );
}

export function Alert({ kind, icon, children, role, focus, testId }: { kind: "warning" | "error" | "info"; icon?: IconName; children: ReactNode; role?: "alert" | "status"; focus?: boolean; testId?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (focus) ref.current?.focus();
  }, [focus]);
  return (
    <div ref={ref} className="fmo-alert" data-kind={kind} role={role} tabIndex={focus ? -1 : undefined} data-testid={testId}>
      <EditorIcon name={icon ?? (kind === "info" ? "info" : "alert")} size={20} />
      <div>{children}</div>
    </div>
  );
}

/**
 * A saved design whose text holds emoji or picture symbols (E3c, S5): they can't be printed in a kit colour;
 * "Remove them" removes them (one undo step).
 */
export function PictographAlert({ onRemove, testId }: { onRemove: (design: DesignDocument) => DesignDocument; testId: string }) {
  const api = useEditor();
  const w = api.wording.lettering;
  return (
    <Alert kind="warning" testId={testId}>
      <p>{w.hasPictographs}</p>
      <button type="button" className="fmo-btn" onClick={() => api.commit(onRemove, "text")} data-testid={`${testId}-remove`}>
        {w.removePictographs}
      </button>
    </Alert>
  );
}

/** A modal question in the native `<dialog>` (focus is trapped by the browser). */
export function ConfirmDialog({ open, title, body, actions, onCancel, testId }: { open: boolean; title: string; body?: ReactNode; actions: ReactNode; onCancel: () => void; testId?: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      if (typeof dialog.showModal === "function") dialog.showModal();
      else dialog.setAttribute("open", "");
      // E3d (R40, 4.11): showModal() focuses the first button; the safe action (marked) keeps the focus.
      dialog.querySelector<HTMLElement>("[data-dialog-focus]")?.focus();
    } else if (!open && dialog.open) dialog.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      className="fmo-dialog"
      aria-labelledby="fmo-dialog-title"
      data-testid={testId}
      onCancel={(e) => {
        e.preventDefault();
        onCancel();
      }}
    >
      {open && (
        <div className="fmo-dialog-body">
          <h2 id="fmo-dialog-title">{title}</h2>
          {body && <p>{body}</p>}
          <div className="fmo-dialog-actions">{actions}</div>
        </div>
      )}
    </dialog>
  );
}

/**
 * A 20 x 24 shirt with a dot where a preset is (06-editor.md 4.6): seen from
 * the front for front presets (the wearer's left on the right), from behind
 * for back presets, the dot on a sleeve for sleeve presets.
 */
export function PresetDiagram({ product, preset }: { product: ProductDefinition; preset: PlacementPreset }) {
  const piece = product.pieces.find((p) => p.id === preset.pieceId);
  let x = 10;
  let y = 12;
  if (preset.side === "left") {
    x = 17;
    y = 7;
  } else if (preset.side === "right") {
    x = 3;
    y = 7;
  } else if (piece) {
    x = 5 + (preset.centre.x / piece.width) * 10;
    y = 5 + (preset.centre.y / piece.height) * 17;
  }
  return (
    <svg className="fmo-mini" viewBox="0 0 20 24" aria-hidden="true" focusable="false">
      <path d="M7 2L3 3.5 0.6 8 3 10 5 8.6V22.5H15V8.6L17 10 19.4 8 17 3.5 13 2C12.4 3.6 11.3 4.4 10 4.4S7.6 3.6 7 2Z" fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" />
      <circle cx={x} cy={y} r="2.2" fill="currentColor" />
    </svg>
  );
}

export function PresetChips({
  product,
  presets,
  current,
  words,
  onPick,
  offLabel,
  onOff,
  testIdPrefix,
}: {
  product: ProductDefinition;
  presets: PlacementPreset[];
  /** The preset in use, or null when off. */
  current: string | null;
  words: (preset: PlacementPreset) => { short: string; long: string };
  onPick: (preset: PlacementPreset) => void;
  offLabel?: string;
  onOff?: () => void;
  testIdPrefix: string;
}) {
  return (
    <div className="fmo-row" role="group">
      {presets.map((p) => {
        const w = words(p);
        return (
          <button key={p.id} type="button" className="fmo-chip" aria-pressed={current === p.id} aria-label={w.long} title={w.long} onClick={() => onPick(p)} data-testid={`${testIdPrefix}-${p.id}`}>
            <PresetDiagram product={product} preset={p} />
            {w.short}
          </button>
        );
      })}
      {offLabel && onOff && (
        <button type="button" className="fmo-chip" aria-pressed={current === null} onClick={onOff} data-testid={`${testIdPrefix}-off`}>
          {offLabel}
        </button>
      )}
    </div>
  );
}
