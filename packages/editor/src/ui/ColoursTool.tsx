/**
 * Colours (06-editor.md 4.2, 4.3; E3f): one row per part of the kit (and per group of the template's shapes): its
 * name as the heading, its swatches right under it, the team's colours first. One click sets the colour; tapping
 * the part on the model brings its row into view. Team colours with swap and edit; "Match a colour code" (in a
 * row's "All colours"), which shows both colours and applies only the palette's.
 */
import { memo, useCallback, useEffect, useId, useRef, useState } from "react";
import { coloursCommonFirst, findPaletteColour, paletteColourRef, type PaletteColour } from "../design/palette.js";
import { setZoneColor } from "../design/edit.js";
import { TEAM_COLOUR_ROLES, type ColorValue, type DesignDocument, type ProductDefinition, type TeamColourRole } from "../design/schema.js";
import { setShapeGroupColor, setZoneTeamColor, swapTeamColors, teamColourValue } from "../design/team-colours.js";
import { AllChip, ColourRow, FamilySwatches, TeamColourRows } from "./ColourRows.js";
import { colourCodeState, normaliseCodeInput } from "./colour-code.js";
import { fill, shapeGroupWords, type EditorWording } from "./content.js";
import { useEditor, type ColourTarget } from "./context.js";
import { EditorIcon } from "./icons.js";
import { Swatch } from "./parts.js";
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

/** A part's name in the coach's words: a zone's own name, or the group of shapes ("Hoops"). */
export function partName(wording: EditorWording, product: ProductDefinition, target: ColourTarget): string {
  return target.kind === "zone" ? (product.zones.find((z) => z.id === target.id)?.name ?? "") : shapeGroupWords(wording, target.id);
}

/** Which colour a swatch of a part's row gives: a team colour to follow, or a palette colour's id. */
export interface RowPick {
  kind: ColourTarget["kind"];
  id: string;
  role?: TeamColourRole;
  colourId?: string;
}
type RowHandler = (pick: RowPick, preview: boolean | null) => void;

/** One swatch of a part's row, memoised (S1): a tap re-renders only the swatches whose "selected" changed. */
const PartSwatch = memo(function PartSwatch({ hex, label, selected, kind, id, role, colourId, on, testId }: RowPick & { hex: string; label: string; selected: boolean; on: RowHandler; testId: string }) {
  const pick = { kind, id, role, colourId };
  return <Swatch hex={hex} label={label} selected={selected} onPick={() => on(pick, null)} onPreview={(p) => on(pick, p)} testId={testId} />;
});

/** E3f: the one stable function a part's swatches call: a click sets the colour (one undo step); a hover previews it. */
export function usePartColours(): RowHandler {
  const api = useEditor();
  const latest = useRef(api);
  useEffect(() => {
    latest.current = api;
  });
  return useCallback((p, preview) => {
    const { product, palette, design } = latest.current;
    const found = p.colourId ? findPaletteColour(palette, p.colourId) : undefined;
    const colour = p.role ? { role: p.role } : found ? { value: paletteColourRef(found) } : null;
    if (!colour) return;
    const edit = colourEdit({ kind: p.kind, id: p.id }, colour, { product });
    if (preview !== null) return latest.current.hoverPreview(preview ? edit : null);
    latest.current.markTiming("swatch");
    latest.current.markPart?.(null);
    if (latest.current.commit(edit, p.kind === "zone" ? "zone-colour" : "shape-colour")) latest.current.useColour(p.colourId ?? design.teamColors[p.role!]?.id ?? "");
  }, []);
}

/**
 * E3f: one part of the kit (a zone, or a group of shapes) as a row: its name as the heading with the colour it has
 * now, its swatches right under it: the team's colours first, then the common colours. "All colours" opens the
 * rest and "Match a colour code". One click sets it. The popover on the model shows the same row.
 */
export function PartRow({ target, open, onOpen, active, on }: { target: ColourTarget; open: boolean; onOpen: (open: boolean) => void; active?: boolean; on: RowHandler }) {
  const api = useEditor();
  const { design, product, palette, wording } = api;
  const w = wording.colours;
  const zone = target.kind === "zone" ? product.zones.find((z) => z.id === target.id) : undefined;
  const current = targetColour(design, target, zone?.defaultColor);
  const name = partName(wording, product, target);
  const common = coloursCommonFirst(palette).filter((c) => palette.common.includes(c.id));
  const teamIds = new Set(TEAM_COLOUR_ROLES.map((r) => design.teamColors[r]?.id));
  // The colour in use stays in view when it came from "All colours".
  const own = current && !current.teamColor ? findPaletteColour(palette, current.id) : undefined;
  const palettes = [...(own && !common.some((c) => c.id === own.id) ? [own] : []), ...common].filter((c) => !teamIds.has(c.id));
  const swatch = (c: PaletteColour, prefix: string) => {
    const selected = current?.id === c.id && !current.teamColor;
    return <PartSwatch key={`${prefix}-${c.id}`} hex={c.hex} label={selected ? fill(w.selected, { colour: c.name }) : c.name} selected={selected} kind={target.kind} id={target.id} colourId={c.id} on={on} testId={`swatch-${target.id}-${c.id}`} />;
  };
  const note = current ? (current.requested ? `${colourName(palette, current)} (${current.requested})` : colourName(palette, current)) : undefined;
  return (
    <ColourRow heading={name} note={note} active={active} testId={`part-${target.id}`}>
      <div className="fmo-scroll-row" role="group" aria-label={name}>
        {TEAM_COLOUR_ROLES.filter((r) => design.teamColors[r]).map((role) => {
          const c = design.teamColors[role]!;
          const label = `${w.roles[role]}: ${colourName(palette, c)}`;
          const selected = current?.teamColor === role;
          return <PartSwatch key={role} hex={c.hex} label={selected ? fill(w.selected, { colour: label }) : label} selected={selected} kind={target.kind} id={target.id} role={role} on={on} testId={`swatch-${target.id}-${role}`} />;
        })}
        {palettes.map((c) => swatch(c, "common"))}
        <AllChip open={open} onToggle={() => onOpen(!open)} testId={`all-${target.id}`} />
      </div>
      {open && (
        <>
          <FamilySwatches swatch={(c) => swatch(c, "all")} />
          <ColourCodeMatch onUse={(value, id) => on({ kind: target.kind, id: target.id, colourId: id }, null)} />
          <p className="fmo-muted">{w.printNote}</p>
        </>
      )}
    </ColourRow>
  );
}

function ColoursToolView() {
  const api = useEditor();
  const { design, product, wording, markedPart } = api;
  const w = wording.colours;
  const [view, setView] = useState<"main" | "team">("main");
  const [open, setOpen] = useState<string | null>(null);
  const on = usePartColours();
  const groups = [...new Set(design.shapes.map((s) => s.group))];
  const targets: ColourTarget[] = [...product.zones.map((z) => ({ kind: "zone" as const, id: z.id })), ...groups.map((g) => ({ kind: "shapes" as const, id: g }))];
  // A part tapped on the model: its row is marked and comes into view.
  const root = useRef<HTMLDivElement>(null);
  const markedId = markedPart ? `${markedPart.kind}-${markedPart.id}` : null;
  const reduced = api.reducedMotion;
  useEffect(() => {
    if (markedId) root.current?.querySelector<HTMLElement>('[data-active="true"]')?.scrollIntoView?.({ block: "start", behavior: reduced ? "auto" : "smooth" });
  }, [markedId, reduced]);

  if (view === "team") return <TeamColoursEditor onBack={() => setView("main")} />;

  return (
    <div className="fmo-colour-rows" ref={root} data-testid="colour-rows">
      <div className="fmo-row">
        <span className="fmo-label">{w.teamColours}</span>
        <button type="button" className="fmo-chip" onClick={() => api.commit(swapTeamColors, "swap-team-colours")} data-testid="swap-team" aria-label={w.swap} title={w.swap}>
          <EditorIcon name="swap" size={20} />
          {w.swapShort}
        </button>
        <button type="button" className="fmo-btn fmo-btn-text" onClick={() => setView("team")} data-testid="edit-team">
          {w.editTeam}
        </button>
      </div>
      {targets.map((t) => (
        <PartRow key={`${t.kind}-${t.id}`} target={t} open={open === t.id} onOpen={(o) => setOpen(o ? t.id : null)} active={markedId === `${t.kind}-${t.id}`} on={on} />
      ))}
      <p className="fmo-muted">{w.tapKit}</p>
    </div>
  );
}

/** "Edit team colours": Main, Second and Accent as three rows, and swap. */
function TeamColoursEditor({ onBack }: { onBack: () => void }) {
  const api = useEditor();
  const w = api.wording.colours;
  return (
    <>
      <div className="fmo-back-row">
        <button type="button" onClick={onBack} data-testid="back">
          {api.wording.tools.back}
        </button>
      </div>
      <TeamColourRows prefix="team" />
      <button type="button" className="fmo-btn fmo-btn-text" onClick={() => api.commit(swapTeamColors, "swap-team-colours")}>
        <EditorIcon name="swap" size={20} />
        {w.swap}
      </button>
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
