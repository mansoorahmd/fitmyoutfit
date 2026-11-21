/**
 * The start card (06-editor.md 7.2), on the first open of a new design only:
 * two or three team colours and the team name, with the garment live above
 * it, then "See designs in your colours". A panel, not a modal.
 */
import { useEffect, useId, useRef, useState } from "react";
import { setTeamName } from "../design/roles.js";
import { TeamColourRows } from "./ColourRows.js";
import { useEditor } from "./context.js";
import { EditorIcon } from "./icons.js";
import { fieldCheck } from "./lettering.js";

export function StartCard({ onClose }: { onClose: (seeDesigns: boolean) => void }) {
  const api = useEditor();
  const { wording, design } = api;
  const w = wording.start;
  const id = useId();
  const [name, setName] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  // The card can close while the name is being typed (a tap on the shirt closes it as Skip, R1): what was typed is
  // kept as one step, as leaving the field would.
  const typingName = useRef(false);
  const end = useRef(api.end);
  useEffect(() => {
    end.current = api.end;
  });
  useEffect(
    () => () => {
      if (typingName.current) end.current();
    },
    [],
  );

  return (
    <section className="fmo-start" aria-labelledby={`${id}-title`} data-testid="start-card">
      <div className="fmo-panel-head">
        <h2 className="fmo-panel-title" id={`${id}-title`}>
          {w.title}
        </h2>
        <button type="button" className="fmo-icon-btn" aria-label={wording.tools.closePanel} onClick={() => onClose(false)} data-testid="start-close">
          <EditorIcon name="close" />
        </button>
      </div>
      <div className="fmo-panel-body">
        <div className="fmo-panel-inner fmo-stack">
          {/* R2, D1: one left edge; the step number inline in its label row. */}
          <div data-testid="start-step-colours">
            <p className="fmo-step-label" id={`${id}-colours`}>
              <span className="fmo-step-n" aria-hidden="true">
                1
              </span>
              {w.colours}
            </p>
            <TeamColourRows prefix="start" />
          </div>
          <div>
            <label className="fmo-step-label" htmlFor={`${id}-name`}>
              <span className="fmo-step-n" aria-hidden="true">
                2
              </span>
              {w.name}
            </label>
            <input
              id={`${id}-name`}
              className="fmo-field"
              dir="auto"
              autoComplete="off"
              maxLength={60}
              enterKeyHint="done"
              placeholder={w.namePlaceholder}
              value={name ?? design.teamName}
              onFocus={() => {
                typingName.current = true;
                api.begin("team-name");
              }}
              aria-invalid={Boolean(nameError)}
              onBlur={() => {
                typingName.current = false;
                api.end();
                setName(null);
                setNameError(null);
              }}
              onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
              onChange={(e) => {
                setName(e.target.value);
                // Emoji refused, tabs and line breaks made spaces (E3c): the kit keeps the last good name.
                const checked = fieldCheck(wording, e.target.value, "name");
                setNameError(checked.error);
                if (!checked.error) api.preview((d) => setTeamName(d, checked.value));
              }}
              data-testid="start-team-name"
            />
            {nameError && (
              <p className="fmo-field-error" role="alert" data-testid="start-team-name-error">
                <EditorIcon name="alert" size={18} />
                {nameError}
              </p>
            )}
          </div>
        </div>
      </div>
      {/* E3f: the main button stays in view whatever the three rows take (the colours and the name scroll above it). */}
      <div className="fmo-start-actions">
        <div className="fmo-panel-inner fmo-stack">
          <button type="button" className="fmo-btn fmo-btn-block" onClick={() => onClose(true)} data-testid="see-designs">
            {w.seeDesigns}
          </button>
          <div className="fmo-start-skip">
            <button type="button" className="fmo-btn fmo-btn-text fmo-btn-pad" onClick={() => onClose(false)} data-testid="start-skip">
              {w.skipLater}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
