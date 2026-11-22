/**
 * E3f: colours as a heading with its swatches right under it. The team colours (Main, Second, Accent) are three
 * such rows, on the start card and in "Edit team colours"; each part of the kit is one in the Colours tool. One
 * click on a swatch sets the colour: nothing is chosen first.
 */
import { useId, useState, type ReactNode } from "react";
import { coloursByFamily, coloursCommonFirst, paletteColourRef, type PaletteColour } from "../design/palette.js";
import { TEAM_COLOUR_ROLES, type TeamColourRole } from "../design/schema.js";
import { setTeamColor } from "../design/team-colours.js";
import { fill } from "./content.js";
import { useEditor } from "./context.js";
import { EditorIcon } from "./icons.js";
import { Swatch } from "./parts.js";

/** One heading, with its swatches under it. `note`: a small word after the heading (the colour now, or "optional"). */
export function ColourRow({ heading, note, active, testId, children }: { heading: string; note?: string; active?: boolean; testId?: string; children: ReactNode }) {
  const id = useId();
  return (
    <section className="fmo-colour-row" aria-labelledby={id} data-active={active ? "true" : undefined} data-testid={testId}>
      <h3 className="fmo-row-head" id={id}>
        {heading}
        {note && <span className="fmo-row-note">{note}</span>}
      </h3>
      {children}
    </section>
  );
}

/** The "All colours" chip of a row, and its way back. */
export function AllChip({ open, onToggle, testId }: { open: boolean; onToggle: () => void; testId?: string }) {
  const { wording } = useEditor();
  return (
    <button type="button" className="fmo-chip" aria-expanded={open} onClick={onToggle} data-testid={testId}>
      {open ? wording.colours.fewer : wording.colours.all}
      <EditorIcon name={open ? "chevronUp" : "chevronDown"} size={18} />
    </button>
  );
}

/** The palette by family, as wrapped swatches (the part of a row that "All colours" opens). */
export function FamilySwatches({ swatch }: { swatch: (c: PaletteColour) => ReactNode }) {
  const { palette } = useEditor();
  return (
    <>
      {coloursByFamily(palette).map(({ family, colours }) => (
        <section key={family.id} className="fmo-family" aria-label={family.name}>
          <span className="fmo-group-label">{family.name}</span>
          <div className="fmo-swatches">{colours.map(swatch)}</div>
        </section>
      ))}
    </>
  );
}

/**
 * Main, Second and Accent as three rows (the accent says "optional" and has "None"). One click sets the colour;
 * the chosen swatch is marked inside its box. A colour another row uses is dimmed and can't be picked here: its
 * name says which row has it, so the same colour is never in two rows.
 */
export function TeamColourRows({ prefix }: { prefix: "start" | "team" }) {
  const api = useEditor();
  const { design, palette, wording } = api;
  const w = wording.colours;
  const [all, setAll] = useState<TeamColourRole | null>(null);
  // E3g: on the start card the accent row stays closed behind one line until the coach opens it (or the kit has an accent).
  const [accentOpen, setAccentOpen] = useState(false);
  const common = coloursCommonFirst(palette).filter((c) => palette.common.includes(c.id));
  const pick = (role: TeamColourRole, c: PaletteColour) => {
    if (api.commit((d) => setTeamColor(d, role, paletteColourRef(c)), "team-colour")) api.useColour(c.id);
  };
  const swatchFor = (role: TeamColourRole) => (c: PaletteColour) => {
    const selected = design.teamColors[role]?.id === c.id;
    const user = TEAM_COLOUR_ROLES.find((r) => r !== role && design.teamColors[r]?.id === c.id);
    const label = user ? fill(w.usedAs, { colour: c.name, role: w.roles[user] }) : selected ? fill(w.selected, { colour: c.name }) : c.name;
    return <Swatch key={c.id} hex={c.hex} label={label} selected={selected} disabled={Boolean(user)} onPick={() => pick(role, c)} testId={`${prefix}-colour-${role}-${c.id}`} />;
  };
  return (
    <div className="fmo-colour-rows" data-testid={`${prefix}-colour-rows`}>
      {TEAM_COLOUR_ROLES.map((role) => {
        const own = design.teamColors[role];
        if (prefix === "start" && role === "accent" && !own && !accentOpen) {
          return (
            <button key={role} type="button" className="fmo-chip fmo-add-accent" aria-expanded="false" onClick={() => setAccentOpen(true)} data-testid="start-add-accent">
              <EditorIcon name="plus" size={18} />
              {w.addAccentColour}
            </button>
          );
        }
        const swatch = swatchFor(role);
        const open = all === role;
        // The colour in use stays in view when it came from "All colours".
        const shown = own && !common.some((c) => c.id === own.id) ? [palette.colors.find((c) => c.id === own.id), ...common].filter((c): c is PaletteColour => Boolean(c)) : common;
        return (
          <ColourRow key={role} heading={w.roleHeading[role]} note={role === "accent" ? w.optional : undefined} testId={`${prefix}-row-${role}`}>
            <div className="fmo-scroll-row" role="group" aria-label={w.roleHeading[role]}>
              {role === "accent" && (
                <button type="button" className="fmo-chip" aria-pressed={!own} onClick={() => api.commit((d) => setTeamColor(d, "accent", null), "team-colour")} data-testid={`${prefix}-no-accent`}>
                  {w.none}
                </button>
              )}
              {shown.map(swatch)}
              <AllChip open={open} onToggle={() => setAll(open ? null : role)} testId={`${prefix}-all-${role}`} />
            </div>
            {open && <FamilySwatches swatch={swatch} />}
          </ColourRow>
        );
      })}
    </div>
  );
}
