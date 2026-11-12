/**
 * Team colours (06-editor.md 4.2): the design's two or three colours, in
 * order Main, Second, Accent. Zones, shapes, and the fill and outline of text
 * and numbers can FOLLOW a team colour (`teamColor` on the colour value), so
 * one edit here recolours everything that uses the role, as one document
 * change and so one undo step.
 *
 * A colour that follows a team colour always holds that team colour's palette
 * id and code (validateDesign checks it): the printed colour is in the
 * document, and the painting code needs no lookup.
 */
import {
  TEAM_COLOUR_ROLES,
  teamColorSchema,
  type ColorValue,
  type DesignDocument,
  type Layer,
  type Shape,
  type TeamColor,
  type TeamColourRole,
} from "./schema.js";
import { DesignError, zodIssuesToErrors } from "./validate.js";

/** The colour value that follows a team colour of the design. Throws when the design has no such team colour. */
export function teamColourValue(design: Pick<DesignDocument, "teamColors">, role: TeamColourRole): ColorValue {
  const team = design.teamColors[role];
  if (!team) throw new DesignError(`The design has no ${role} team colour`);
  return { id: team.id, hex: team.hex, teamColor: role };
}

/** The team colours the design has, in order (Main, Second, and Accent when set). */
export function teamColourRoles(design: Pick<DesignDocument, "teamColors">): TeamColourRole[] {
  return TEAM_COLOUR_ROLES.filter((role) => design.teamColors[role] !== undefined);
}

/**
 * Applies `map` to every colour value of the design (zones, shapes, text and
 * number fills and outlines). Returns the same object when nothing changed.
 */
export function mapDesignColours(design: DesignDocument, map: (value: ColorValue) => ColorValue): DesignDocument {
  let changed = false;
  const apply = (value: ColorValue): ColorValue => {
    const next = map(value);
    if (next !== value) changed = true;
    return next;
  };
  const zones: DesignDocument["zones"] = {};
  for (const [zone, value] of Object.entries(design.zones)) zones[zone] = apply(value);
  const shapes: Shape[] = design.shapes.map((shape) => {
    const fill = apply(shape.fill);
    return fill === shape.fill ? shape : { ...shape, fill };
  });
  const layers: Layer[] = design.layers.map((layer) => {
    if (layer.kind !== "text" && layer.kind !== "number") return layer;
    const fill = apply(layer.fill);
    const outlineColour = layer.outline ? apply(layer.outline.color) : undefined;
    if (fill === layer.fill && (!layer.outline || outlineColour === layer.outline.color)) return layer;
    return { ...layer, fill, ...(layer.outline ? { outline: { ...layer.outline, color: outlineColour! } } : {}) };
  });
  return changed ? { ...design, zones, shapes, layers } : design;
}

/** Every value that follows a team colour, set to that team colour's current id and code. */
function followTeamColours(design: DesignDocument): DesignDocument {
  return mapDesignColours(design, (value) => {
    if (value.teamColor === undefined) return value;
    const team = design.teamColors[value.teamColor];
    if (!team) {
      // The team colour is gone (Accent removed): keep the printed colour, follow nothing.
      return { id: value.id, hex: value.hex };
    }
    if (team.id === value.id && team.hex === value.hex) return value;
    return { id: team.id, hex: team.hex, teamColor: value.teamColor };
  });
}

function readTeamColour(colour: unknown, role: TeamColourRole): TeamColor {
  let input = colour;
  if (typeof colour === "object" && colour !== null) {
    // A colour value may be passed as is: its own team-colour link means nothing here.
    const copy = { ...(colour as ColorValue) };
    delete copy.teamColor;
    input = copy;
  }
  const parsed = teamColorSchema.safeParse(input);
  if (!parsed.success) throw new DesignError(`Invalid ${role} team colour`, zodIssuesToErrors(parsed.error.issues, role));
  return parsed.data;
}

/**
 * Sets one team colour (a palette colour, with the code the coach asked for
 * in `requested` when it came from the colour-code match) and recolours
 * every zone, shape, fill and outline that follows it. One edit.
 *
 * `null` removes the Accent (Main and Second are always there); whatever
 * followed the Accent keeps its colour and follows nothing.
 */
export function setTeamColor(design: DesignDocument, role: TeamColourRole, colour: TeamColor | ColorValue | null): DesignDocument {
  if (!TEAM_COLOUR_ROLES.includes(role)) throw new DesignError(`Cannot set a team colour: "${String(role)}" is not one of ${TEAM_COLOUR_ROLES.join(", ")}`);
  const teamColors = { ...design.teamColors };
  if (colour === null) {
    if (role !== "accent") throw new DesignError(`Cannot remove the ${role} team colour: a design always has Main and Second`);
    delete teamColors.accent;
  } else {
    teamColors[role] = readTeamColour(colour, role);
  }
  return followTeamColours({ ...design, teamColors });
}

/**
 * Swaps two team colours (by default Main and Second) across the whole kit:
 * Main takes Second's colour and Second takes Main's, and everything that
 * follows either is recoloured. The quickest way to an away kit. One edit.
 */
export function swapTeamColors(design: DesignDocument, a: TeamColourRole = "main", b: TeamColourRole = "second"): DesignDocument {
  const first = design.teamColors[a];
  const second = design.teamColors[b];
  if (!first || !second) throw new DesignError(`Cannot swap the ${a} and ${b} team colours: the design has no ${!first ? a : b} team colour`);
  if (a === b) return design;
  return followTeamColours({ ...design, teamColors: { ...design.teamColors, [a]: { ...second }, [b]: { ...first } } });
}

/** Makes a zone follow a team colour (its colour becomes the team colour's). */
export function setZoneTeamColor(design: DesignDocument, zoneId: string, role: TeamColourRole): DesignDocument {
  if (!Object.prototype.hasOwnProperty.call(design.zones, zoneId)) {
    throw new DesignError(`Cannot set colour: the design has no colour zone "${zoneId}" (zones: ${Object.keys(design.zones).join(", ") || "none"})`);
  }
  return { ...design, zones: { ...design.zones, [zoneId]: teamColourValue(design, role) } };
}

/** Where a team colour is used: zone ids, shape groups and layer ids (for the interface's "used by" hints and tests). */
export function teamColourUses(design: DesignDocument, role: TeamColourRole): { zones: string[]; shapeGroups: string[]; layers: string[] } {
  const zones = Object.entries(design.zones).flatMap(([zone, value]) => (value.teamColor === role ? [zone] : []));
  const shapeGroups = [...new Set(design.shapes.filter((s) => s.fill.teamColor === role).map((s) => s.group))];
  const layers = design.layers.flatMap((l) =>
    (l.kind === "text" || l.kind === "number") && (l.fill.teamColor === role || l.outline?.color.teamColor === role) ? [l.id] : [],
  );
  return { zones, shapeGroups, layers };
}

/**
 * Sets the colour of every shape of a group (the Colours tool's "Stripes"
 * chip): a palette colour, or a team colour's value. One edit.
 */
export function setShapeGroupColor(design: DesignDocument, group: string, colour: ColorValue): DesignDocument {
  if (!design.shapes.some((s) => s.group === group)) {
    throw new DesignError(`Cannot set colour: the design has no shapes in group "${group}" (groups: ${[...new Set(design.shapes.map((s) => s.group))].join(", ") || "none"})`);
  }
  const value = colour.teamColor ? teamColourValue(design, colour.teamColor) : { id: colour.id, hex: colour.hex, ...(colour.requested ? { requested: colour.requested } : {}) };
  return { ...design, shapes: design.shapes.map((s) => (s.group === group ? { ...s, fill: { ...value } } : s)) };
}
