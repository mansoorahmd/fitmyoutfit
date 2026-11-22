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
import { focusForInput } from "./pointer-focus.js";
import { useEffect, useMemo, useRef, type ReactNode } from "react";
import type { DesignDocument } from "../design/schema.js";
import { designChecks, type DesignCheck } from "./checks.js";
import { fill } from "./content.js";
import { useEditor } from "./context.js";
import { EditorIcon } from "./icons.js";
import type { EditorLayout } from "./layout.js";
import { useTeamList } from "./team-list-context.js";
import { doneTeamSection } from "./team-list-words.js";

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
  /** "Show", "Add players" and the main button's own actions (11.2): the panel closes and the list opens (at the first line to fix, or with a new line). */
  onShowList?: (target: "fix" | "players" | "add") => void;
  /** After team orders exist (the host's `listRequiredToContinue`): the main button is the next thing to do for the list. Off before M3. */
  listRequired?: boolean;
  onClose: () => void;
  /** "Show" on a check: the panel closes and the item is selected, with the camera on it. */
  onShow: (check: DesignCheck) => void;
  /** E3d (R37): the panel's height as shown (a phone's sheet is as tall as its content), for the stage's framing. */
  onSize?: (height: number) => void;
}

export function DonePanel(props: DonePanelProps) {
  const api = useEditor();
  const { design, product, wording, palette, assets } = api;
  const w = wording.done;
  const tl = wording.teamList;
  const team = useTeamList();
  const section = doneTeamSection({ wording, summary: team.analysis.report.summary, noun: team.noun, minimum: team.minimum });
  const openList = props.onShowList ?? (() => undefined);
  // The main button is the next thing to do for the list while the host needs one (11.2); ready, or not needed: the host's own.
  const listStep: { label: string; target: "fix" | "players" | "add" } | null = !props.listRequired
    ? null
    : section.kind === "empty"
      ? { label: tl.doneSection.addYourPlayers, target: "players" }
      : section.toFix > 0
        ? { label: section.toFix === 1 ? tl.doneSection.fixOne : fill(tl.doneSection.fixLines, { k: section.toFix }), target: "fix" }
        : section.missing > 0
          ? { label: section.missing === 1 ? tl.doneSection.addMoreOne : fill(tl.doneSection.addMore, { missing: section.missing }), target: "add" }
          : null;
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
      // showModal() puts the focus on the first control (the close button): the main action keeps it (11.2).
      // E3e: the ring only for a keyboard (after a mouse or a finger the button is focused without it).
      const main = dialog.querySelector<HTMLElement>("[data-done-focus], .fmo-primary");
      if (main) focusForInput(main);
    } else if (!props.open && dialog.open) dialog.close();
  }, [props.open]);
  // R37: the sheet's real height, for the stage (the garment is framed above it).
  const report = useRef(props.onSize);
  useEffect(() => {
    report.current = props.onSize;
  });
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog || !props.open) return;
    const measure = () => report.current?.(dialog.offsetHeight);
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(dialog);
    return () => observer.disconnect();
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
          <section aria-labelledby="fmo-done-team" className="fmo-done-team" data-testid="done-team" data-state={section.kind === "empty" ? "empty" : section.ready ? "ready" : "fix"}>
            <h3 id="fmo-done-team" className="fmo-done-checks-title">
              <span>{tl.doneSection.title}</span>
            </h3>
            <p className="fmo-done-team-line">
              <span data-testid="done-team-text">{section.text}</span>
              {section.kind === "empty" ? (
                <button type="button" className="fmo-btn fmo-btn-text" onClick={() => openList("players")} data-testid="done-team-add">
                  {tl.doneSection.addPlayers}
                </button>
              ) : (
                section.toFix > 0 && (
                  <button type="button" className="fmo-btn fmo-btn-text" aria-label={tl.doneSection.showName} onClick={() => openList("fix")} data-testid="done-team-show">
                    {tl.doneSection.show}
                  </button>
                )
              )}
            </p>
            {section.minimumNote && (
              <p className="fmo-tl-minimum" data-testid="done-team-minimum">
                <EditorIcon name="info" size={16} />
                <span>{section.minimumNote}</span>
              </p>
            )}
          </section>
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
          {listStep ? (
            <>
              <button type="button" className="fmo-primary" onClick={() => openList(listStep.target)} data-testid="done-list-step" data-done-focus>
                {listStep.label}
              </button>
              <button type="button" className="fmo-btn fmo-btn-text fmo-btn-pad" onClick={props.onSaveAndGoBack} data-testid="done-finish-later">
                {tl.doneSection.finishLater}
              </button>
            </>
          ) : (
            (primary ?? (
              <>
                <button type="button" className="fmo-primary" onClick={props.onSaveAndGoBack} data-testid="done-save-and-go-back" data-done-focus>
                  {w.saveAndGoBack}
                </button>
                <p className="fmo-muted" data-testid="done-team-orders">
                  {section.kind === "empty" ? tl.doneSection.noteEmpty : tl.doneSection.note}
                </p>
              </>
            ))
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
