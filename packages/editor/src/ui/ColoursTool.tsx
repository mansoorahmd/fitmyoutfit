/**
 * Colours (06-editor.md 4.2, 4.3): the parts of the kit as chips (and the
 * template's shapes), tap the kit to choose a part (it flashes), the team
 * colours with swap and edit, recent colours, the palette by family, and
 * "Match a colour code", which shows both colours and applies only the
 * palette's.
 */
import { memo, useCallback, useEffect, useId, useRef, useState } from "react";
import { coloursByFamily, findPaletteColour, paletteColourRef, type PaletteColour } from "../design/palette.js";
import { setZoneColor } from "../design/edit.js";
import { TEAM_COLOUR_ROLES, type ColorValue, type DesignDocument, type ProductDefinition, type TeamColourRole } from "../design/schema.js";
import { setShapeGroupColor, setTeamColor, setZoneTeamColor, swapTeamColors, teamColourValue } from "../design/team-colours.js";
import { colourCodeState, normaliseCodeInput } from "./colour-code.js";
import { fill, shapeGroupWords } from "./content.js";
import { useEditor, type ColourTarget } from "./context.js";
import { EditorIcon } from "./icons.js";
import { Chip, Swatch } from "./parts.js";
import { colourName } from "./stage-logic.js";

/** The colour a zone or a group of shapes has now. */
export function targetColour(design: DesignDocument, target: ColourTarget, fallback?: ColorValue): ColorValue | undefined {
  if (target.kind === "zone") return design.zones[target.id] ?? fallback;
  return design.shapes.find((s) => s.group === target.id)?.fill;
}

/** The edit that gives a zone or group of shapes a colour: following a team colour, or a palette colour (with a requested code). */
export function colourEdit(target: ColourTarget, colour: { role: TeamColourRole } | { value: ColorValue }, options: { product: ProductDefinition }) {
  return (d: DesignDocument): DesignDocument => {
    if ("role" in colour) {
      return target.kind === "zone" ? setZoneTeamColor(d, target.id, colour.role) : setShapeGroupColor(d, target.id, teamColourValue(d, colour.role));
    }
    return target.kind === "zone" ? setZoneColor(d, target.id, colour.value, options) : setShapeGroupColor(d, target.id, colour.value);
  };
}

/** A palette colour's swatch, memoised (S1): it re-renders only when its own state changes. */
const PaletteSwatch = memo(function PaletteSwatch({ colour, label, selected, prefix, onPick, onPreview }: { colour: PaletteColour; label: string; selected: boolean; prefix: string; onPick: (c: PaletteColour) => void; onPreview: (c: PaletteColour, on: boolean) => void }) {
  return <Swatch hex={colour.hex} label={label} selected={selected} onPick={() => onPick(colour)} onPreview={(on) => onPreview(colour, on)} testId={`swatch-${prefix}-${colour.id}`} />;
});

function ColoursToolView() {
  const api = useEditor();
  const { design, product, palette, wording, colourTarget, detent, layout } = api;
  const w = wording.colours;
  const [view, setView] = useState<"main" | "team">("main");
  const [editRole, setEditRole] = useState<TeamColourRole>("main");
  const expanded = detent === "expanded" || layout !== "compact";
  const zoneDefault = colourTarget.kind === "zone" ? product.zones.find((z) => z.id === colourTarget.id)?.defaultColor : undefined;
  const current = targetColour(design, colourTarget, zoneDefault);
  const targetName = colourTarget.kind === "zone" ? (product.zones.find((z) => z.id === colourTarget.id)?.name ?? "") : shapeGroupWords(wording, colourTarget.id);
  const label = colourTarget.kind === "zone" ? "zone-colour" : "shape-colour";
  const groups = [...new Set(design.shapes.map((s) => s.group))];

  const apply = (colour: { role: TeamColourRole } | { value: ColorValue }, recentId?: string) => {
    api.markTiming("swatch");
    if (api.commit(colourEdit(colourTarget, colour, { product }), label) && recentId) api.useColour(recentId);
  };
  const preview = (colour: { role: TeamColourRole } | { value: ColorValue }) => (on: boolean) => api.hoverPreview(on ? colourEdit(colourTarget, colour, { product }) : null);

  const roles = TEAM_COLOUR_ROLES.filter((r) => design.teamColors[r]);
  const teamSwatches = roles.map((role) => {
    const c = design.teamColors[role]!;
    const name = `${w.roles[role]}: ${colourName(palette, c)}`;
    const selected = current?.teamColor === role;
    return <Swatch key={role} hex={c.hex} label={selected ? fill(w.selected, { colour: name }) : name} selected={selected} onPick={() => apply({ role }, c.id)} onPreview={preview({ role })} testId={`swatch-team-${role}`} />;
  });
  // Stable handlers (S1): a tap re-renders only the two palette swatches whose "selected" changed.
  const handlers = useRef({ apply, preview });
  useEffect(() => {
    handlers.current = { apply, preview };
  });
  const pickPalette = useCallback((c: PaletteColour) => handlers.current.apply({ value: paletteColourRef(c) }, c.id), []);
  const previewPalette = useCallback((c: PaletteColour, on: boolean) => handlers.current.preview({ value: paletteColourRef(c) })(on), []);
  const paletteSwatch = (c: PaletteColour, prefix: string) => {
    const selected = current?.id === c.id && !current.teamColor;
    return <PaletteSwatch key={`${prefix}-${c.id}`} colour={c} label={selected ? fill(w.selected, { colour: c.name }) : c.name} selected={selected} prefix={prefix} onPick={pickPalette} onPreview={previewPalette} />;
  };
  const recent = api.recentColours.map((id) => findPaletteColour(palette, id)).filter((c): c is PaletteColour => Boolean(c));

  if (view === "team") {
    return (
      <TeamColoursEditor
        role={editRole}
        onRole={setEditRole}
        onBack={() => setView("main")}
      />
    );
  }

  const headerLine = current ? (current.requested ? fill(w.matched, { zone: targetName, colour: colourName(palette, current), code: current.requested }) : fill(w.zoneColour, { zone: targetName, colour: colourName(palette, current) })) : targetName;

  return (
    <>
      <p className="fmo-line" data-testid="colour-line" data-keep-typing>
        <strong>{headerLine.split(":")[0]}:</strong>
        {headerLine.slice(headerLine.indexOf(":") + 1)}
      </p>
      <div className="fmo-scroll-row" role="group" aria-label={w.parts} data-testid="zone-chips">
        {product.zones.map((z) => {
          const c: ColorValue = design.zones[z.id] ?? z.defaultColor;
          return (
            <Chip key={z.id} pressed={colourTarget.kind === "zone" && colourTarget.id === z.id} onClick={() => api.chooseColourTarget({ kind: "zone", id: z.id }, true)} dot={c.hex} marked={Boolean(c.requested)} testId={`zone-${z.id}`}>
              {z.name}
            </Chip>
          );
        })}
        {groups.map((g) => {
          const c = design.shapes.find((s) => s.group === g)!.fill;
          return (
            <Chip key={g} pressed={colourTarget.kind === "shapes" && colourTarget.id === g} onClick={() => api.chooseColourTarget({ kind: "shapes", id: g }, true)} dot={c.hex} marked={Boolean(c.requested)} testId={`shapes-${g}`}>
              {shapeGroupWords(wording, g)}
            </Chip>
          );
        })}
      </div>
      {!expanded ? (
        <div className="fmo-scroll-row" data-testid="swatch-row">
          <span className="fmo-group-label">{w.teamColours}</span>
          {teamSwatches}
          {recent.length > 0 && <span className="fmo-divider" />}
          {recent.length > 0 && <span className="fmo-group-label">{w.recent}</span>}
          {recent.map((c) => paletteSwatch(c, "recent"))}
          <span className="fmo-divider" />
          <button type="button" className="fmo-chip" onClick={() => api.setDetent("expanded")} data-testid="all-colours">
            {w.all}
            <EditorIcon name="chevronUp" size={18} />
          </button>
        </div>
      ) : (
        <>
          <section className="fmo-stack" aria-label={w.teamColours}>
            <span className="fmo-label">{w.teamColours}</span>
            <div className="fmo-row">
              <div className="fmo-swatches">{teamSwatches}</div>
              {/* R21: a chip with its word, not a bare icon. */}
              <button type="button" className="fmo-chip" onClick={() => api.commit(swapTeamColors, "swap-team-colours")} data-testid="swap-team" aria-label={w.swap} title={w.swap}>
                <EditorIcon name="swap" size={20} />
                {w.swapShort}
              </button>
              <button type="button" className="fmo-btn fmo-btn-text" onClick={() => setView("team")} data-testid="edit-team">
                {w.editTeam}
              </button>
            </div>
          </section>
          {recent.length > 0 && (
            <section className="fmo-stack" aria-label={w.recent}>
              <span className="fmo-label">{w.recent}</span>
              <div className="fmo-swatches">{recent.map((c) => paletteSwatch(c, "recent"))}</div>
            </section>
          )}
          {coloursByFamily(palette).map(({ family, colours }) => (
            <section key={family.id} className="fmo-family" aria-label={family.name}>
              <span className="fmo-label">{family.name}</span>
              <div className="fmo-swatches">{colours.map((c) => paletteSwatch(c, "palette"))}</div>
            </section>
          ))}
          <ColourCodeMatch onUse={(value, id) => apply({ value }, id)} />
          <p className="fmo-muted">{w.printNote}</p>
        </>
      )}
      <p className="fmo-muted">{w.tapKit}</p>
    </>
  );
}

/** "Edit team colours": choose Main, Second or Accent, then its colour; swap; remove the accent. */
function TeamColoursEditor({ role, onRole, onBack }: { role: TeamColourRole; onRole: (role: TeamColourRole) => void; onBack: () => void }) {
  const api = useEditor();
  const { design, palette, wording } = api;
  const w = wording.colours;
  const setRole = (c: PaletteColour) => {
    if (api.commit((d) => setTeamColor(d, role, paletteColourRef(c)), "team-colour")) api.useColour(c.id);
  };
  return (
    <>
      <div className="fmo-back-row">
        <button type="button" onClick={onBack} data-testid="back">
          {wording.tools.back}
        </button>
      </div>
      <div className="fmo-team-slots" role="radiogroup" aria-label={w.teamColours}>
        {TEAM_COLOUR_ROLES.map((r) => {
          const c = design.teamColors[r];
          return (
            <button key={r} type="button" role="radio" aria-checked={role === r} className="fmo-team-slot" data-active={role === r} onClick={() => onRole(r)} style={{ border: 0, background: "none", cursor: "pointer", padding: 0 }} data-testid={`team-slot-${r}`}>
              <span className={c ? "fmo-swatch" : "fmo-swatch fmo-swatch-empty"} style={{ background: c?.hex, boxShadow: role === r ? "0 0 0 2px #fff, 0 0 0 4px var(--fmo-ink)" : undefined }} aria-hidden="true" />
              {w.roles[r]}
            </button>
          );
        })}
        <button type="button" className="fmo-btn fmo-btn-text" onClick={() => api.commit(swapTeamColors, "swap-team-colours")}>
          <EditorIcon name="swap" size={20} />
          {w.swap}
        </button>
      </div>
      {design.teamColors.accent && (
        <button type="button" className="fmo-btn fmo-btn-text" onClick={() => api.commit((d) => setTeamColor(d, "accent", null), "team-colour")} data-testid="no-accent">
          {w.noAccent}
        </button>
      )}
      <p className="fmo-label">{fill(w.editRole, { role: w.roles[role] })}</p>
      {coloursByFamily(palette).map(({ family, colours }) => (
        <section key={family.id} className="fmo-family" aria-label={family.name}>
          <span className="fmo-label">{family.name}</span>
          <div className="fmo-swatches">
            {colours.map((c) => {
              const selected = design.teamColors[role]?.id === c.id;
              return <Swatch key={c.id} hex={c.hex} label={selected ? fill(w.selected, { colour: c.name }) : c.name} selected={selected} onPick={() => setRole(c)} testId={`team-colour-${c.id}`} />;
            })}
          </div>
        </section>
      ))}
    </>
  );
}

/** "Match a colour code" (4.3): the field, both colours, the match line, "Use …". */
function ColourCodeMatch({ onUse }: { onUse: (value: ColorValue, colourId: string) => void }) {
  const { palette, wording, reducedMotion } = useEditor();
  const w = wording.colours;
  const [raw, setRaw] = useState("");
  const [finished, setFinished] = useState(false);
  const id = useId();
  const state = colourCodeState(palette, raw, finished);
  const invalid = state.kind === "invalid";
  // R20: a result that appears below the fold is brought into view (instantly with reduced motion).
  const result = useRef<HTMLDivElement>(null);
  const matched = state.kind === "match" ? state.colour.id + state.requested : null;
  useEffect(() => {
    if (matched) result.current?.scrollIntoView?.({ block: "nearest", behavior: reducedMotion ? "auto" : "smooth" });
  }, [matched, reducedMotion]);
  return (
    <section className="fmo-section" aria-label={w.matchCode} data-testid="colour-code">
      <label className="fmo-label" htmlFor={`${id}-code`}>
        {w.matchCode}
      </label>
      <div className="fmo-code-field">
        <input
          id={`${id}-code`}
          className="fmo-field"
          dir="ltr"
          inputMode="text"
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          placeholder="#1F4E9C"
          aria-describedby={`${id}-hint${invalid ? ` ${id}-error` : ""}`}
          aria-invalid={invalid}
          value={raw}
          maxLength={8}
          onChange={(e) => {
            setFinished(false);
            setRaw(e.target.value === "" ? "" : normaliseCodeInput(e.target.value));
          }}
          onBlur={() => setFinished(true)}
          onKeyDown={(e) => e.key === "Enter" && setFinished(true)}
          data-testid="colour-code-input"
        />
      </div>
      <p className="fmo-muted" id={`${id}-hint`}>
        {w.codeLabel}
      </p>
      {invalid && (
        <p className="fmo-field-error" id={`${id}-error`} role="alert" data-testid="colour-code-error">
          <EditorIcon name="alert" size={18} />
          {w.invalidCode}
        </p>
      )}
      {state.kind === "match" && (
        <div className="fmo-match" ref={result} data-testid="colour-code-result">
          <div className="fmo-match-col">
            <span>{w.youEntered}</span>
            <span className="fmo-match-chip" style={{ background: state.requested }} />
            <code>{state.requested}</code>
          </div>
          <EditorIcon name="chevronLeft" size={20} className="fmo-flip" />
          <div className="fmo-match-col">
            <span>{w.wePrint}</span>
            <span className="fmo-match-chip" style={{ background: state.colour.hex }} />
            <span>
              {state.colour.name} <code>{state.colour.hex}</code>
            </span>
          </div>
          <p className="fmo-match-line" data-level={state.match} data-testid="colour-code-level">
            {state.match === "different" && <EditorIcon name="alert" size={18} />}
            {w.match[state.match]}
          </p>
          <button type="button" className="fmo-btn fmo-btn-block" onClick={() => onUse(state.value, state.colour.id)} data-testid="colour-code-use">
            {fill(w.use, { colour: state.colour.name })}
          </button>
        </div>
      )}
    </section>
  );
}

/** E3d (speed): re-renders only when its props or the editor's data change. */
export const ColoursTool = memo(ColoursToolView);
