/**
 * Dialogs a host shows around the editor, in the editor's look and wording:
 * "Continue your last design?" (06-editor.md 9.3, W-ED142) when a design is
 * saved on the device, and the short confirmation after Done (E3a; the Done
 * panel is E3b). Native `<dialog>`s; the host decides when.
 */
import { useMemo } from "react";
import { mergeWording, type WordingOverrides } from "./content.js";
import { ConfirmDialog } from "./parts.js";
import { EDITOR_CSS } from "./styles.js";

export function ResumePrompt({ open, onContinue, onStartAgain, wording }: { open: boolean; onContinue: () => void; onStartAgain: () => void; wording?: WordingOverrides }) {
  const w = useMemo(() => mergeWording(wording), [wording]);
  return (
    <div className="fmo-editor" style={{ display: "contents" }}>
      <style href="fitmyoutfit-editor-css" precedence="default">
        {EDITOR_CSS}
      </style>
      <ConfirmDialog
        open={open}
        title={w.states.continueTitle}
        body={w.states.continueBody}
        onCancel={onContinue}
        testId="resume-prompt"
        actions={
          <>
            {/* E3d (R40, 4.11): the safe action last, filled ink (the one red button stays Done), with the focus. */}
            <button type="button" className="fmo-btn" onClick={onStartAgain} data-testid="resume-start-again">
              {w.states.startAgain}
            </button>
            <button type="button" className="fmo-btn fmo-btn-ink" onClick={onContinue} data-testid="resume-continue" data-dialog-focus autoFocus>
              {w.states.continue}
            </button>
          </>
        }
      />
    </div>
  );
}

export function DoneNotice({ open, onClose, wording }: { open: boolean; onClose: () => void; wording?: WordingOverrides }) {
  const w = useMemo(() => mergeWording(wording), [wording]);
  return (
    <div className="fmo-editor" style={{ display: "contents" }}>
      <ConfirmDialog
        open={open}
        title={w.done.title}
        body={w.done.teamOrdersSoon}
        onCancel={onClose}
        testId="done-notice"
        actions={
          <button type="button" className="fmo-btn" onClick={onClose} data-testid="done-keep-designing" data-dialog-focus autoFocus>
            {w.done.keepDesigning}
          </button>
        }
      />
    </div>
  );
}
