/**
 * The navy top bar (06-editor.md 3.5, 3.6): close, undo and redo, the save
 * state, the host's slots (brand, price, share), and Done, the one red button.
 */
import type { ReactNode } from "react";
import type { SaveState } from "../storage/device-store.js";
import type { EditorWording } from "./content.js";
import { EditorIcon } from "./icons.js";
import type { EditorLayout, SaveStateWords } from "./layout.js";

export interface TopBarProps {
  layout: EditorLayout;
  wording: EditorWording;
  productName: string;
  canUndo: boolean;
  canRedo: boolean;
  undoTitle: string;
  redoTitle: string;
  onUndo: () => void;
  onRedo: () => void;
  saveState: SaveState | null;
  saveWords: SaveStateWords;
  onSaveInfo: () => void;
  onClose: () => void;
  onDone: () => void;
  doneDisabled?: boolean;
  /** The Done panel is open: Done is inactive and shows a check; the panel's main button is the red one (9.1). */
  doneOpen?: boolean;
  brand?: ReactNode;
  price?: ReactNode;
  share?: ReactNode;
  account?: ReactNode;
}

function SaveStateView({ state, wording, form, onInfo }: { state: SaveState | null; wording: EditorWording; form: SaveStateWords; onInfo: () => void }) {
  if (!state) return <div className="fmo-save-state" />;
  const f = wording.frame;
  const words = state === "saving" ? f.saving : state === "saved" ? f.saved : f.notSaved;
  const short = state === "saved" ? f.savedShort : words;
  const icon = state === "failed" ? "alert" : state === "saved" ? "saved" : null;
  const content = (
    <>
      {icon && <EditorIcon name={icon} size={20} />}
      {form === "full" ? (
        <span>{words}</span>
      ) : (
        <>
          {form === "short" && <span aria-hidden="true">{short}</span>}
          <span className="fmo-sr-only">{words}</span>
        </>
      )}
    </>
  );
  return (
    <div className="fmo-save-state" data-state={state} role="status" aria-live="polite" data-testid="save-state">
      {state === "failed" ? (
        <button type="button" onClick={onInfo} aria-label={words}>
          {content}
        </button>
      ) : (
        content
      )}
    </div>
  );
}

export function TopBar(props: TopBarProps) {
  const { wording, layout } = props;
  const f = wording.frame;
  const wide = layout === "wide";
  return (
    <header className="fmo-topbar" data-testid="top-bar">
      <button type="button" className="fmo-tb-btn fmo-icon-only" aria-label={f.closeName} title={f.closeName} onClick={props.onClose} data-testid="close">
        <EditorIcon name="close" />
      </button>
      {wide && (
        <div className="fmo-topbar-brand">
          {props.brand}
          <small>{props.productName}</small>
        </div>
      )}
      <button type="button" className={wide ? "fmo-tb-btn" : "fmo-tb-btn fmo-icon-only"} aria-label={f.undo} title={props.undoTitle} aria-disabled={!props.canUndo} onClick={() => props.canUndo && props.onUndo()} data-testid="undo">
        <EditorIcon name="undo" />
        {wide && <span>{f.undo}</span>}
      </button>
      <button type="button" className={wide ? "fmo-tb-btn" : "fmo-tb-btn fmo-icon-only"} aria-label={f.redo} title={props.redoTitle} aria-disabled={!props.canRedo} onClick={() => props.canRedo && props.onRedo()} data-testid="redo">
        <EditorIcon name="redo" />
        {wide && <span>{f.redo}</span>}
      </button>
      <SaveStateView state={props.saveState} wording={wording} form={props.saveWords} onInfo={props.onSaveInfo} />
      {wide && <div className="fmo-topbar-spacer" />}
      {wide && props.share && <div className="fmo-topbar-slot">{props.share}</div>}
      {wide && props.price && <div className="fmo-topbar-slot" data-testid="price-slot">{props.price}</div>}
      {props.account && <div className="fmo-topbar-slot">{props.account}</div>}
      <button
        type="button"
        className="fmo-done"
        onClick={() => !props.doneOpen && props.onDone()}
        disabled={props.doneDisabled}
        aria-disabled={props.doneOpen || undefined}
        aria-label={props.doneOpen ? wording.done.doneOpen : undefined}
        data-open={props.doneOpen || undefined}
        data-testid="done"
      >
        {props.doneOpen && <EditorIcon name="check" size={20} />}
        {f.done}
      </button>
    </header>
  );
}
