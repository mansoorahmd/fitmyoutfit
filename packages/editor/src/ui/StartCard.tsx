/**
 * The start card (06-editor.md 7.2), on the first open of a new design only:
 * two or three team colours and the team name, with the garment live above
 * it, then "See designs in your colours". A panel, not a modal.
 */
import { useEffect, useId, useRef, useState } from "react";
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

  const choose = (next: PaletteColour[]) => {
    setPicks(next);
    api.commit((d) => teamColoursFromPicks(d, next), "team-colour");
  };
  const tap = (c: PaletteColour) => {
    if (picks.some((p) => p.id === c.id)) choose(picks.filter((p) => p.id !== c.id));
    else if (picks.length < 3) choose([...picks, c]);
  };
  // R5, R7: the pick order is on the swatch itself (1 Main, 2 Second, 3 Accent), said in its name; tap again to remove.
  const swatch = (c: PaletteColour) => {
    const k = picks.findIndex((p) => p.id === c.id);
    const role = k >= 0 ? TEAM_COLOUR_ROLES[k] : undefined;
    const label = role ? fill(w.pickedAs, { colour: c.name, role: wording.colours.roles[role] }) : c.name;
    return <Swatch key={c.id} hex={c.hex} label={label} selected={k >= 0} badge={k >= 0 ? String(k + 1) : undefined} onPick={() => tap(c)} testId={`start-colour-${c.id}`} />;
  };
  const picked = picks.map((c, k) => fill(w.pickedRole, { role: wording.colours.roles[TEAM_COLOUR_ROLES[k]!], colour: c.name })).join(w.pickedJoin);

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
            {all ? (
              coloursByFamily(palette).map(({ family, colours }) => (
                <section key={family.id} className="fmo-family" aria-label={family.name}>
                  <span className="fmo-group-label">{family.name}</span>
                  <div className="fmo-swatches">{colours.map(swatch)}</div>
                </section>
              ))
            ) : (
              <div className="fmo-scroll-row" role="group" aria-labelledby={`${id}-colours`} data-testid="start-colours">
                {coloursCommonFirst(palette)
                  .filter((c) => palette.common.includes(c.id))
                  .map(swatch)}
                <button type="button" className="fmo-chip" onClick={() => setAll(true)} data-testid="start-all-colours">
                  {w.allColours}
                  <EditorIcon name="chevronDown" size={18} />
                </button>
              </div>
            )}
            <p className="fmo-start-picked" aria-live="polite" hidden={!picked} data-testid="start-picked">
              {picked}
            </p>
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

/** The picks already in a design's team colours (a design brought back keeps its colours; the card starts empty for a new one). */
export function picksOf(design: DesignDocument, palette: Parameters<typeof findPaletteColour>[0]): PaletteColour[] {
  return TEAM_COLOUR_ROLES.flatMap((r) => {
    const c = design.teamColors[r];
    const found = c ? findPaletteColour(palette, c.id) : undefined;
    return found ? [found] : [];
  });
}
