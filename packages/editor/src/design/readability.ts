/**
 * Readability of names and numbers (N15, 06-editor.md 4.5): the contrast
 * between a text or number item's colour and the colour actually under its
 * centre on the garment (the zone there, or a shape such as a hoop over it),
 * and whether it passes the specification's 3:1 rule (the WCAG non-text
 * contrast ratio, as a stand-in for "readable from the stands"; opinion, to
 * be tested).
 *
 * An outline counts: a name whose fill is too close to the background but
 * whose outline stands out passes. That is what the interface's "Add outline"
 * fix relies on (`readabilityFix` picks the team colour for it).
 */
import { contrastRatio } from "./colour.js";
import { zoneAtPiecePoint } from "./pattern.js";
import type { ColorValue, DesignDocument, Layer, Point, ProductDefinition, TeamColourRole } from "./schema.js";
import { TEAM_COLOUR_ROLES } from "./schema.js";
import { flattenPath, parseSvgPath, pointInPolylines } from "./svg-path.js";

/** The specification's minimum contrast for names, numbers and the team name. */
export const READABILITY_MIN_CONTRAST = 3;

/** What is under a point of a piece: a shape (topmost) or the zone there. */
export type Background =
  | { kind: "zone"; zoneId: string; colour: ColorValue }
  | { kind: "shape"; shapeId: string; group: string; colour: ColorValue };

/** The colour under a point of a piece: the topmost shape there, else the zone (as the texture paints it). Null off the piece. */
export function backgroundAt(product: ProductDefinition, design: Pick<DesignDocument, "zones" | "shapes">, pieceId: string, point: Point): Background | null {
  const piece = product.pieces.find((p) => p.id === pieceId);
  if (!piece) return null;
  for (let i = design.shapes.length - 1; i >= 0; i--) {
    const shape = design.shapes[i]!;
    if (shape.pieceId !== pieceId) continue;
    const parsed = parseSvgPath(shape.path);
    if (parsed.ok && pointInPolylines(flattenPath(parsed.commands), point)) {
      return { kind: "shape", shapeId: shape.id, group: shape.group, colour: shape.fill };
    }
  }
  const zoneId = zoneAtPiecePoint(piece, point);
  if (zoneId === null) return null;
  const colour = Object.prototype.hasOwnProperty.call(design.zones, zoneId) ? design.zones[zoneId] : product.zones.find((z) => z.id === zoneId)?.defaultColor;
  return colour ? { kind: "zone", zoneId, colour } : null;
}

export interface Readability {
  layerId: string;
  /** The item's fill. */
  colour: ColorValue;
  /** What is under the item's centre. */
  background: Background;
  /** Contrast of the fill on the background, 1 to 21. */
  ratio: number;
  /** Contrast of the outline on the background, when the item has an outline. */
  outlineRatio: number | null;
  /** The fill or the outline reaches the minimum contrast. */
  passes: boolean;
}

type TextLike = Extract<Layer, { kind: "text" | "number" }>;

/**
 * The readability of a text or number item: its colours against what is
 * under its centre. Null for a logo, a missing layer, or an item whose centre
 * is off its piece.
 */
export function itemReadability(
  product: ProductDefinition,
  design: Pick<DesignDocument, "zones" | "shapes" | "layers">,
  layerId: string,
  minimum: number = READABILITY_MIN_CONTRAST,
): Readability | null {
  const layer = design.layers.find((l): l is TextLike => l.id === layerId && (l.kind === "text" || l.kind === "number"));
  if (!layer) return null;
  const background = backgroundAt(product, design, layer.pieceId, layer.position);
  if (!background) return null;
  const ratio = contrastRatio(layer.fill.hex, background.colour.hex);
  const outlineRatio = layer.outline ? contrastRatio(layer.outline.color.hex, background.colour.hex) : null;
  return { layerId, colour: layer.fill, background, ratio, outlineRatio, passes: ratio >= minimum || (outlineRatio ?? 0) >= minimum };
}

/** The readability of every text and number item (with a value), in layer order. */
export function designReadability(product: ProductDefinition, design: Pick<DesignDocument, "zones" | "shapes" | "layers">, minimum: number = READABILITY_MIN_CONTRAST): Readability[] {
  return design.layers.flatMap((l) => {
    if ((l.kind !== "text" && l.kind !== "number") || l.value === "") return [];
    const r = itemReadability(product, design, l.id, minimum);
    return r ? [r] : [];
  });
}

/**
 * The team colour to outline an item in when it is hard to read: the one
 * with the highest contrast on the background (ties: the earlier role).
 */
export function readabilityFix(design: Pick<DesignDocument, "teamColors">, background: Background): { role: TeamColourRole; ratio: number } {
  let best: { role: TeamColourRole; ratio: number } | null = null;
  for (const role of TEAM_COLOUR_ROLES) {
    const team = design.teamColors[role];
    if (!team) continue;
    const ratio = contrastRatio(team.hex, background.colour.hex);
    if (!best || ratio > best.ratio) best = { role, ratio };
  }
  return best!;
}

/**
 * The team colour that makes the best outline for letters of `fill` on a
 * background: the one whose weaker contrast (against the letters, and against
 * the background) is the strongest, so the outline shows round the letters
 * and against the garment. A default for an outline the coach has not
 * coloured yet; ties go to the earlier role.
 */
export function outlineColourFor(design: Pick<DesignDocument, "teamColors">, fill: ColorValue, background: Background): { role: TeamColourRole; ratio: number } {
  let best: { role: TeamColourRole; ratio: number } | null = null;
  for (const role of TEAM_COLOUR_ROLES) {
    const team = design.teamColors[role];
    if (!team) continue;
    const ratio = Math.min(contrastRatio(team.hex, fill.hex), contrastRatio(team.hex, background.colour.hex));
    if (!best || ratio > best.ratio) best = { role, ratio };
  }
  return best!;
}
