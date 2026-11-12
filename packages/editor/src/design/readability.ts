/**
 * Readability of names and numbers (N15, 06-editor.md 4.5): the contrast
 * between a text or number item's colour and EVERY colour under it on the
 * garment (the zones there, and shapes such as hoops or a sash over them), and
 * whether it passes the specification's 3:1 rule (the WCAG non-text contrast
 * ratio, as a stand-in for "readable from the stands"; opinion, to be tested).
 *
 * Where it looks: the item's box, turned with the item, sampled on a grid.
 * For a line of text the box is as wide as the layer's box and as tall as the
 * letters (`INK_HEIGHT_EM` of the font size, plus the outline): a layer's box
 * is a line height tall, and the space above and below the letters holds no
 * ink. A name that crosses a sash is judged on the body AND on the sash
 * (E3a-1 looked only under the centre, so half a name could vanish into a
 * sash unnoticed).
 *
 * The rule:
 * - the letters' fill reaches 3:1 on every colour under them: readable;
 * - the fill is too weak on every colour under them, and the outline reaches
 *   3:1 on every one: readable as outlined letters (the "Add outline" fix);
 * - otherwise not: in particular when the fill shows on one part and vanishes
 *   on another, the letters read as hollow over that part even with an
 *   outline. The fix then is a letter colour that stands out from all of them
 *   (`readabilityRemedy`).
 */
import { contrastRatio } from "./colour.js";
import { zoneAtPiecePoint } from "./pattern.js";
import type { ColorValue, DesignDocument, Layer, Point, ProductDefinition, TeamColourRole } from "./schema.js";
import { TEAM_COLOUR_ROLES } from "./schema.js";
import { flattenPath, parseSvgPath, pointInPolylines, type Polyline } from "./svg-path.js";

/** The specification's minimum contrast for names, numbers and the team name. */
export const READABILITY_MIN_CONTRAST = 3;

/**
 * How tall the letters of a line are, as a share of the font size: capitals
 * and digits are about 0.7 em in the placeholder fonts; a little more covers
 * accents and the Arabic letters' height. The area judged is this tall (plus
 * the outline on both sides), centred on the line.
 */
export const INK_HEIGHT_EM = 0.75;

/** What is under a point of a piece: a shape (topmost) or the zone there. */
export type Background =
  | { kind: "zone"; zoneId: string; colour: ColorValue }
  | { kind: "shape"; shapeId: string; group: string; colour: ColorValue };

/** Parsed shape paths, by path text (readability samples many points per shape). */
const shapePolylines = new Map<string, Polyline[] | null>();
function polylinesOf(path: string): Polyline[] | null {
  let found = shapePolylines.get(path);
  if (found === undefined) {
    const parsed = parseSvgPath(path);
    found = parsed.ok ? flattenPath(parsed.commands) : null;
    if (shapePolylines.size > 2000) shapePolylines.clear();
    shapePolylines.set(path, found);
  }
  return found;
}

/** The colour under a point of a piece: the topmost shape there, else the zone (as the texture paints it). Null off the piece. */
export function backgroundAt(product: ProductDefinition, design: Pick<DesignDocument, "zones" | "shapes">, pieceId: string, point: Point): Background | null {
  const piece = product.pieces.find((p) => p.id === pieceId);
  if (!piece) return null;
  const zoneId = zoneAtPiecePoint(piece, point);
  if (zoneId === null) return null;
  for (let i = design.shapes.length - 1; i >= 0; i--) {
    const shape = design.shapes[i]!;
    if (shape.pieceId !== pieceId) continue;
    const polylines = polylinesOf(shape.path);
    if (polylines && pointInPolylines(polylines, point)) {
      return { kind: "shape", shapeId: shape.id, group: shape.group, colour: shape.fill };
    }
  }
  const colour = Object.prototype.hasOwnProperty.call(design.zones, zoneId) ? design.zones[zoneId] : product.zones.find((z) => z.id === zoneId)?.defaultColor;
  return colour ? { kind: "zone", zoneId, colour } : null;
}

type TextLike = Extract<Layer, { kind: "text" | "number" }>;

/** The area a text or number item is judged on, in its own frame (centred, unrotated), in mm. */
export function readabilityArea(layer: Pick<TextLike, "size" | "fontSize" | "outline">): { width: number; height: number } {
  const outline = layer.outline ? 2 * layer.outline.width : 0;
  return { width: layer.size.width, height: Math.min(layer.size.height, layer.fontSize * INK_HEIGHT_EM + outline) };
}

/** Sample points over an item's area, on its piece (turned with the item). About every 4 mm, at most 64 x 24. */
export function readabilitySamples(layer: Pick<TextLike, "position" | "rotation" | "size" | "fontSize" | "outline">): Point[] {
  const { width, height } = readabilityArea(layer);
  const nx = Math.min(64, Math.max(3, Math.ceil(width / 4) + 1));
  const ny = Math.min(24, Math.max(3, Math.ceil(height / 4) + 1));
  const angle = (layer.rotation * Math.PI) / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const points: Point[] = [];
  for (let j = 0; j < ny; j++) {
    const ly = -height / 2 + (height * j) / (ny - 1);
    for (let i = 0; i < nx; i++) {
      const lx = -width / 2 + (width * i) / (nx - 1);
      points.push({ x: layer.position.x + lx * cos - ly * sin, y: layer.position.y + lx * sin + ly * cos });
    }
  }
  return points;
}

/** Every distinct colour under an item's area (by what paints it), in the order found, with how much of the area each covers (0 to 1). */
export function backgroundsUnder(
  product: ProductDefinition,
  design: Pick<DesignDocument, "zones" | "shapes">,
  layer: Pick<TextLike, "pieceId" | "position" | "rotation" | "size" | "fontSize" | "outline">,
): Array<Background & { share: number }> {
  const found = new Map<string, Background & { share: number }>();
  let total = 0;
  for (const point of readabilitySamples(layer)) {
    const background = backgroundAt(product, design, layer.pieceId, point);
    if (!background) continue;
    total++;
    const key = `${background.kind === "zone" ? `zone:${background.zoneId}` : `shape:${background.group}`}:${background.colour.hex}`;
    const entry = found.get(key);
    if (entry) entry.share++;
    else found.set(key, { ...background, share: 1 });
  }
  const list = [...found.values()];
  for (const entry of list) entry.share = total > 0 ? entry.share / total : 0;
  return list;
}

export interface Readability {
  layerId: string;
  /** The item's fill. */
  colour: ColorValue;
  /** The colour under the item that is hardest to read on (the weakest contrast with the letters). */
  background: Background;
  /** Every colour under the item's area, with the share of the area it covers. */
  backgrounds: Array<Background & { share: number }>;
  /** Weakest contrast of the fill on the colours under it, 1 to 21. */
  ratio: number;
  /** Weakest contrast of the outline on the colours under it, when the item has an outline. */
  outlineRatio: number | null;
  /** The fill stands out on some colours under it but not on others: the letters would look hollow over part. */
  mixed: boolean;
  /** Readable by the rule in the module comment. */
  passes: boolean;
}

/**
 * The readability of a text or number item: its colours against every colour
 * under its area. Null for a logo, a missing layer, or an item wholly off its piece.
 */
export function itemReadability(
  product: ProductDefinition,
  design: Pick<DesignDocument, "zones" | "shapes" | "layers">,
  layerId: string,
  minimum: number = READABILITY_MIN_CONTRAST,
): Readability | null {
  const layer = design.layers.find((l): l is TextLike => l.id === layerId && (l.kind === "text" || l.kind === "number"));
  if (!layer) return null;
  const backgrounds = backgroundsUnder(product, design, layer);
  if (backgrounds.length === 0) return null;
  let worst = backgrounds[0]!;
  let ratio = Infinity;
  let strongest = 0;
  let outlineRatio: number | null = layer.outline ? Infinity : null;
  for (const b of backgrounds) {
    const r = contrastRatio(layer.fill.hex, b.colour.hex);
    if (r < ratio) {
      ratio = r;
      worst = b;
    }
    strongest = Math.max(strongest, r);
    if (layer.outline) outlineRatio = Math.min(outlineRatio!, contrastRatio(layer.outline.color.hex, b.colour.hex));
  }
  const fillEverywhere = ratio >= minimum;
  const fillNowhere = strongest < minimum;
  const mixed = !fillEverywhere && !fillNowhere;
  const passes = fillEverywhere || (fillNowhere && (outlineRatio ?? 0) >= minimum);
  const { share: _share, ...background } = worst;
  void _share;
  return { layerId, colour: layer.fill, background, backgrounds, ratio, outlineRatio, mixed, passes };
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

/** A one-tap fix for an item that is hard to read (see `readabilityRemedy`). */
export type ReadabilityRemedy =
  | { kind: "outline"; role: TeamColourRole; colour: ColorValue; ratio: number }
  | { kind: "fill"; role: TeamColourRole | null; colour: ColorValue; ratio: number };

/**
 * The one-tap fix for an item that is hard to read:
 * - `outline`: on one kind of background, an outline in the team colour that
 *   stands out most from it (the specification's "Add outline");
 * - `fill`: over several colours (a name across a sash), an outline cannot
 *   stop the letters looking hollow over part, so the letters take the team
 *   colour whose weakest contrast over all of them is the strongest; when no
 *   team colour reaches the minimum and a palette is given, the palette colour
 *   that does best (`role` null).
 */
export function readabilityRemedy(
  design: Pick<DesignDocument, "teamColors">,
  readability: Pick<Readability, "backgrounds" | "background" | "mixed">,
  options: { palette?: { colors: ReadonlyArray<{ id: string; hex: string }> }; minimum?: number } = {},
): ReadabilityRemedy {
  const minimum = options.minimum ?? READABILITY_MIN_CONTRAST;
  if (!readability.mixed) {
    const fix = readabilityFix(design, readability.background);
    return { kind: "outline", role: fix.role, colour: { ...design.teamColors[fix.role]!, teamColor: fix.role }, ratio: fix.ratio };
  }
  const weakest = (hex: string) => Math.min(...readability.backgrounds.map((b) => contrastRatio(hex, b.colour.hex)));
  let best: ReadabilityRemedy | null = null;
  for (const role of TEAM_COLOUR_ROLES) {
    const team = design.teamColors[role];
    if (!team) continue;
    const ratio = weakest(team.hex);
    if (!best || ratio > best.ratio) best = { kind: "fill", role, colour: { id: team.id, hex: team.hex, teamColor: role }, ratio };
  }
  if (best && best.ratio < minimum && options.palette) {
    for (const c of options.palette.colors) {
      const ratio = weakest(c.hex);
      if (ratio > best.ratio) best = { kind: "fill", role: null, colour: { id: c.id, hex: c.hex }, ratio };
    }
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
