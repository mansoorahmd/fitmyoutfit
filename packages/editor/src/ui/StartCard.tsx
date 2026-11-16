/**
 * The start card (06-editor.md 7.2), on the first open of a new design only:
 * two or three team colours and the team name, with the garment live above
 * it, then "See designs in your colours". A panel, not a modal.
 */
import { useEffect, useId, useState } from "react";
import { coloursByFamily, coloursCommonFirst, findPaletteColour, paletteColourRef, type PaletteColour } from "../design/palette.js";
import { setTeamName } from "../design/roles.js";
import { TEAM_COLOUR_ROLES, type DesignDocument } from "../design/schema.js";
import { setTeamColor } from "../design/team-colours.js";
import { fill } from "./content.js";
import { useEditor } from "./context.js";
import { EditorIcon } from "./icons.js";
import { Swatch } from "./parts.js";
import { fieldCheck } from "./lettering.js";

/** The team colours from the colours picked so far: Main, Second, Accent in the order picked. */
export function teamColoursFromPicks(design: DesignDocument, picks: readonly PaletteColour[]): DesignDocument {
  let next = design;
  if (picks[0]) next = setTeamColor(next, "main", paletteColourRef(picks[0]));
  if (picks[1]) next = setTeamColor(next, "second", paletteColourRef(picks[1]));
  next = setTeamColor(next, "accent", picks[2] ? paletteColourRef(picks[2]) : null);
  return next;
}

export function StartCard({ onClose }: { onClose: (seeDesigns: boolean) => void }) {
  const api = useEditor();
  const { palette, wording, design } = api;
  const w = wording.start;
  const id = useId();
  const [picks, setPicks] = useState<PaletteColour[]>([]);
  const [all, setAll] = useState(false);
  const [name, setName] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const choose = (next: PaletteColour[]) => {
    setPicks(next);
    api.commit((d) => teamColoursFromPicks(d, next), "team-colour");
  };
  const tap = (c: PaletteColour) => {
    if (picks.some((p) => p.id === c.id)) choose(picks.filter((p) => p.id !== c.id));
    else if (picks.length < 3) choose([...picks, c]);
  };
  const swatch = (c: PaletteColour) => {
    const selected = picks.some((p) => p.id === c.id);
    return <Swatch key={c.id} hex={c.hex} label={selected ? fill(wording.colours.selected, { colour: c.name }) : c.name} selected={selected} onPick={() => tap(c)} testId={`start-colour-${c.id}`} />;
  };

  return (
    <section className="fmo-start" aria-labelledby={`${id}-title`} data-testid="start-card">
      <div className="fmo-panel-head">
        <h2 className="fmo-panel-title" id={`${id}-title`}>
          {w.title}
        </h2>
        <button type="button" className="fmo-round" style={{ border: 0, background: "none" }} aria-label={wording.tools.closePanel} onClick={() => onClose(false)}>
          <EditorIcon name="close" />
        </button>
      </div>
      <div className="fmo-panel-body">
        <div className="fmo-panel-inner fmo-stack">
          <div className="fmo-start-step">
            <span className="fmo-step-n" aria-hidden="true">
              1
            </span>
            <div>
              <span className="fmo-label">{w.colours}</span>
              <div className="fmo-team-slots" style={{ marginBottom: 8 }}>
                {TEAM_COLOUR_ROLES.map((role, k) => {
                  const c = picks[k] ?? null;
                  const roleName = wording.colours.roles[role];
                  return (
                    <div key={role} className="fmo-team-slot" data-active={Boolean(c)}>
                      {c ? (
                        <Swatch hex={c.hex} label={fill(w.clearSlot, { role: `${roleName}: ${c.name}` })} selected={false} onPick={() => choose(picks.filter((_, j) => j !== k))} testId={`start-slot-${role}`} />
                      ) : (
                        <span className="fmo-swatch fmo-swatch-empty" role="img" aria-label={fill(w.emptySlot, { role: roleName })} data-testid={`start-slot-${role}`} />
                      )}
                      {roleName}
                    </div>
                  );
                })}
              </div>
              {all ? (
                coloursByFamily(palette).map(({ family, colours }) => (
                  <section key={family.id} className="fmo-family" aria-label={family.name}>
                    <span className="fmo-group-label">{family.name}</span>
                    <div className="fmo-swatches">{colours.map(swatch)}</div>
                  </section>
                ))
              ) : (
                <div className="fmo-scroll-row" data-testid="start-colours">
                  {coloursCommonFirst(palette)
                    .filter((c) => palette.common.includes(c.id))
                    .map(swatch)}
                  <button type="button" className="fmo-chip" onClick={() => setAll(true)} data-testid="start-all-colours">
                    {w.allColours}
                    <EditorIcon name="chevronDown" size={18} />
                  </button>
                </div>
              )}
            </div>
          </div>
          <div className="fmo-start-step">
            <span className="fmo-step-n" aria-hidden="true">
              2
            </span>
            <div>
              <label className="fmo-label" htmlFor={`${id}-name`}>
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
                onFocus={() => api.begin("team-name")}
                aria-invalid={Boolean(nameError)}
                onBlur={() => {
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
          <button type="button" className="fmo-btn fmo-btn-block" onClick={() => onClose(true)} data-testid="see-designs">
            {w.seeDesigns}
          </button>
          <div style={{ textAlign: "center" }}>
            <button type="button" className="fmo-btn fmo-btn-text" onClick={() => onClose(false)} data-testid="start-skip">
              {w.skip}
            </button>
          </div>
          <p className="fmo-muted" style={{ textAlign: "center" }}>
            {w.later}
          </p>
        </div>
      </div>
    </section>
  );
}

/** The picks already in a design's team colours (a design brought back keeps its colours; the card starts empty for a new one). */
export function picksOf(design: DesignDocument, palette: Parameters<typeof findPaletteColour>[0]): PaletteColour[] {
  return TEAM_COLOUR_ROLES.flatMap((r) => {
    const c = design.teamColors[r];
    const found = c ? findPaletteColour(palette, c.id) : undefined;
    return found ? [found] : [];
  });
}
