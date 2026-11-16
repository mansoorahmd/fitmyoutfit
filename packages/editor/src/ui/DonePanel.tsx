/**
 * The Done panel (06-editor.md 9.2, 9.3), without the proof (E5): the kit in
 * one line, the things to check (every open warning, each with Show, which
 * closes the panel, selects the item and turns the camera to it), the host's
 * price, and the main action. Warnings never block it.
 *
 * Before team orders exist (9.3) the main action is "Save and go back" (it
 * calls the host's `onDone` with the design), with the line about team
 * orders under it; Share stays hidden unless the host gives it. The price,
 * the main action and Share are host slots: the store fills them; the editor
 * stays free of the store.
 *
 * Modal (11.2): a native <dialog> opened with showModal(), which keeps focus
 * inside; Esc and "Keep designing" close it. On a phone it rises from the
 * bottom at the panel's expanded height; on a desktop it is 400 px wide on the
 * right, over the stage's right side.
 */
import { useEffect, useMemo, useRef, type ReactNode } from "react";
import type { DesignDocument } from "../design/schema.js";
import { designChecks, type DesignCheck } from "./checks.js";
import { fill } from "./content.js";
import { useEditor } from "./context.js";
import { EditorIcon } from "./icons.js";
import type { EditorLayout } from "./layout.js";

export interface DonePanelProps {
  open: boolean;
  layout: EditorLayout;
  productName: string;
  /** The host's price line (W-ED168), or nothing. */
  price?: ReactNode;
  /** The host's main action ("Add to team order" when team orders exist); without it, "Save and go back". */
  primaryAction?: ReactNode | ((design: DesignDocument) => ReactNode);
  /** Share (later, with the backend): hidden until the host gives it (9.3). */
  share?: ReactNode;
  onSaveAndGoBack: () => void;
  onClose: () => void;
  /** "Show" on a check: the panel closes and the item is selected, with the camera on it. */
  onShow: (check: DesignCheck) => void;
}

export function DonePanel(props: DonePanelProps) {
  const api = useEditor();
  const { design, product, wording, palette, assets } = api;
  const w = wording.done;
  const ref = useRef<HTMLDialogElement>(null);
  const checks = useMemo(
    () => (props.open ? designChecks(wording, product, design, { notes: api.logoNotes, palette, fileName: assets.fileName, missingAssets: api.missingAssets }) : []),
    [props.open, wording, product, design, api.logoNotes, palette, assets.fileName, api.missingAssets],
  );
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (props.open && !dialog.open) {
      if (typeof dialog.showModal === "function") dialog.showModal();
      else dialog.setAttribute("open", "");
    } else if (!props.open && dialog.open) dialog.close();
  }, [props.open]);
  const count = checks.length;
  const primary = typeof props.primaryAction === "function" ? props.primaryAction(design) : props.primaryAction;
  return (
    <dialog
      ref={ref}
      className="fmo-done-panel"
      data-layout={props.layout}
      aria-labelledby="fmo-done-title"
      onCancel={(e) => {
        e.preventDefault();
        props.onClose();
      }}
      data-testid="done-panel"
    >
      {props.open && (
        <div className="fmo-done-inner fmo-stack">
          <div className="fmo-panel-head">
            <h2 className="fmo-panel-title" id="fmo-done-title">
              {w.title}
            </h2>
            <button type="button" className="fmo-icon-btn" aria-label={w.close} title={w.close} onClick={props.onClose} data-testid="done-close">
              <EditorIcon name={props.layout === "compact" ? "chevronDown" : "close"} />
            </button>
          </div>
          <p className="fmo-done-kit fmo-bdi" dir="auto" data-testid="done-kit">
            {design.teamName.trim() ? fill(w.kitLine, { product: props.productName, team: design.teamName }) : props.productName}
          </p>
          <section aria-labelledby="fmo-done-checks" className="fmo-done-checks" data-testid="done-checks">
            <h3 id="fmo-done-checks" className="fmo-done-checks-title">
              {count === 0 ? null : <EditorIcon name="alert" size={20} />}
              <span>{count === 0 ? w.checksNone : count === 1 ? w.checksOne : fill(w.checksMany, { count })}</span>
            </h3>
            {count > 0 && (
              <ul className="fmo-done-list">
                {checks.map((c) => (
                  <li key={`${c.layerId}-${c.check}`} data-testid={`done-check-${c.layerId}-${c.check}`}>
                    <span className="fmo-bdi" dir="auto">
                      {c.text}
                    </span>
                    <button type="button" className="fmo-btn fmo-btn-text" onClick={() => props.onShow(c)} data-testid={`done-show-${c.layerId}-${c.check}`}>
                      {w.show}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
          {props.price && (
            <div className="fmo-done-price" data-testid="done-price">
              <span className="fmo-label">{w.price}</span>
              {props.price}
            </div>
          )}
          {primary ?? (
            <>
              <button type="button" className="fmo-primary" onClick={props.onSaveAndGoBack} data-testid="done-save-and-go-back" autoFocus>
                {w.saveAndGoBack}
              </button>
              <p className="fmo-muted" data-testid="done-team-orders">
                {w.teamOrdersSoon}
              </p>
            </>
          )}
          {props.share && <div data-testid="done-share">{props.share}</div>}
          <button type="button" className="fmo-btn fmo-btn-text fmo-btn-pad" onClick={props.onClose} data-testid="done-keep-designing">
            {w.keepDesigning}
          </button>
        </div>
      )}
    </dialog>
  );
}
