/**
 * Templates as data (N2, 06-editor.md 4.1): a starting design for one
 * product, in colour ROLES, so every template shows in the team's own colours.
 *
 * A template holds:
 * - `zones`: every colour zone of the product, each a team colour role
 *   ({ "team": "main" }) or a fixed palette colour ({ "palette": {...} });
 * - `shapes`: stripes, hoops, a sash, a chevron: vector paths in piece
 *   millimetres, each with a colour role and a group (the shapes recoloured
 *   together, one Colours chip);
 * - `slots`: where the team name, the player's name and the player's number
 *   go (a placement preset each) and their style (font, colour, and optionally
 *   outline and size).
 *
 * `applyTemplate(design, template, options)` returns the new design. It KEEPS
 * the team colours, the team name and its text, every logo and free text with
 * its preset, the sample player, the coach's own slot switches (a number they
 * turned on at the front, a team name they moved or turned off) and the style
 * choices the template leaves open (an outline or a size it does not set). It
 * CHANGES the zone colours (the layout), the shapes, the role slots' default
 * positions, and the fonts and colours the template sets. One document change,
 * so one undo step.
 */
import { z } from "zod";
import {
  ID_PATTERN,
  HEX_PATTERN,
  TEAM_COLOUR_ROLES,
  VALUE_ROLES,
  ZONE_ID_PATTERN,
  type ColorValue,
  type DesignDocument,
  type Layer,
  type NumberLayer,
  type ProductDefinition,
  type Shape,
  type TeamColourRole,
  type TextLayer,
} from "./schema.js";
import { checkJerseyNumber } from "./jersey-number.js";
import { roleValue, type ValueRole } from "./edit.js";
import { addCatalogFont, type FontCatalog } from "./font-catalog.js";
import { nextLayerId } from "./new-layers.js";
import { OUTLINE_STEPS, SIZE_STEPS, newRoleLayer, outlineStepOf, sizeStepOf, type LetteringStyle, type OutlineStep, type SizeStep } from "./roles.js";
import { flattenPath, parseSvgPath, shapesOverlap } from "./svg-path.js";
import { teamColourValue } from "./team-colours.js";
import { DesignError, parseWith, validateDesign, type ValidationError, type ValidationResult } from "./validate.js";

/** Version of the template format. */
export const TEMPLATE_SCHEMA_VERSION = 1 as const;

const id = z.string().regex(ID_PATTERN, "must be 1 to 64 characters: letters, digits, '-', '_' or '.', starting with a letter or digit");
const zoneId = z.string().regex(ZONE_ID_PATTERN, "must be a zone id");

/** A colour in a template: a team colour role, or a fixed palette colour. */
export const templateColourSchema = z.union([
  z.strictObject({ team: z.enum(TEAM_COLOUR_ROLES) }),
  z.strictObject({ palette: z.strictObject({ id, hex: z.string().regex(HEX_PATTERN, "must be an upper-case hex colour like #1B2A5C") }) }),
]);

const outlineSteps = Object.keys(OUTLINE_STEPS) as [OutlineStep, ...OutlineStep[]];
const sizeSteps = Object.keys(SIZE_STEPS) as [SizeStep, ...SizeStep[]];

export const templateStyleSchema = z.strictObject({
  fontId: id,
  fill: templateColourSchema,
  /** An outline step and colour; null: no outline; left out: the template does not set it (the coach's choice stays). */
  outline: z.strictObject({ step: z.enum(outlineSteps), color: templateColourSchema }).nullable().optional(),
  /** A size step; left out: the coach's choice stays (medium on a new slot). */
  size: z.enum(sizeSteps).optional(),
});

export const templateSlotSchema = z.strictObject({
  role: z.enum(VALUE_ROLES),
  /** A placement preset of the product that takes the role. */
  preset: id,
  style: templateStyleSchema,
});

export const templateShapeSchema = z.strictObject({
  /** Shapes coloured together share a group ("hoops"); the Colours tool shows one chip per group. */
  group: id,
  pieceId: id,
  /** SVG path data (M, L, H, V, C, Q, Z) in the piece's millimetres; it may reach past the outline. */
  path: z.string().min(1).max(20_000),
  fill: templateColourSchema,
});

export const templateSchema = z.strictObject({
  schemaVersion: z.literal(TEMPLATE_SCHEMA_VERSION),
  id,
  /** Revision of this template. A design records the id and version it was given. */
  version: z.number().int().min(0),
  /** The product this template is for. */
  productId: id,
  /** A name for people reading the data; the interface has its own wording. */
  name: z.string().min(1).max(100),
  /** A note for people reading the file (where the shapes come from, how they were placed). */
  about: z.string().max(2000).optional(),
  /** What an Accent role means when the team has only two colours. Default "second". */
  accentFallback: z.enum(["main", "second"]).optional(),
  /** Every colour zone of the product. */
  zones: z.record(zoneId, templateColourSchema),
  shapes: z.array(templateShapeSchema).max(200),
  slots: z.array(templateSlotSchema).max(20),
  /** The number shown when the design has no sample player number yet (a jersey number, as typed). */
  sampleNumber: z.string().optional(),
});

export type TemplateColour = z.infer<typeof templateColourSchema>;
export type TemplateStyle = z.infer<typeof templateStyleSchema>;
export type TemplateSlot = z.infer<typeof templateSlotSchema>;
export type TemplateShape = z.infer<typeof templateShapeSchema>;
export type Template = z.infer<typeof templateSchema>;

function error(path: string, message: string): ValidationError {
  return { path, message: path ? `${path}: ${message}` : message };
}

export interface ValidateTemplateOptions {
  /** Check zones, pieces and presets against the product. */
  product?: ProductDefinition;
  /** Check that every font the template names is in the catalogue. */
  fonts?: FontCatalog;
}

/** Validates a template. Never throws. With a product, also its zones (all of them), pieces, shapes and presets. */
export function validateTemplate(input: unknown, options: ValidateTemplateOptions = {}): ValidationResult<Template> {
  try {
    const parsed = parseWith(templateSchema, input, "a template", TEMPLATE_SCHEMA_VERSION);
    if (!parsed.ok) return parsed;
    const t = parsed.value;
    const errors: ValidationError[] = [];
    t.shapes.forEach((shape, i) => {
      const path = parseSvgPath(shape.path);
      if (!path.ok) errors.push(error(`shapes[${i}].path`, `is not usable path data: ${path.error}`));
    });
    if (t.sampleNumber !== undefined) {
      const check = checkJerseyNumber(t.sampleNumber);
      if (!check.ok) errors.push(error("sampleNumber", check.error));
    }
    const seen = new Set<string>();
    t.slots.forEach((slot, i) => {
      const key = `${slot.role}@${slot.preset}`;
      if (seen.has(key)) errors.push(error(`slots[${i}]`, `the ${slot.role} is at preset "${slot.preset}" twice`));
      seen.add(key);
    });
    if (t.slots.some((s) => s.role === "player-number") && t.sampleNumber === undefined) {
      errors.push(error("sampleNumber", "is required when a slot shows the player's number (it is shown until the coach types one)"));
    }
    const { product, fonts } = options;
    if (product) {
      if (t.productId !== product.id) errors.push(error("productId", `the template is for "${t.productId}", not "${product.id}"`));
      const zoneIds = new Set(product.zones.map((z) => z.id));
      for (const zone of zoneIds) if (!Object.prototype.hasOwnProperty.call(t.zones, zone)) errors.push(error("zones", `has no colour for the product's zone "${zone}"`));
      for (const zone of Object.keys(t.zones)) if (!zoneIds.has(zone)) errors.push(error(`zones.${zone}`, `the product has no zone "${zone}"`));
      const pieces = new Map(product.pieces.map((p) => [p.id, p]));
      t.shapes.forEach((shape, i) => {
        const piece = pieces.get(shape.pieceId);
        if (!piece) {
          errors.push(error(`shapes[${i}].pieceId`, `the product has no piece "${shape.pieceId}"`));
          return;
        }
        const path = parseSvgPath(shape.path);
        const outline = parseSvgPath(piece.outline);
        if (path.ok && outline.ok && !shapesOverlap(flattenPath(path.commands), flattenPath(outline.commands))) {
          errors.push(error(`shapes[${i}].path`, `lies outside piece "${piece.id}": none of it would be drawn`));
        }
      });
      t.slots.forEach((slot, i) => {
        const preset = product.placements.find((p) => p.id === slot.preset);
        if (!preset) errors.push(error(`slots[${i}].preset`, `the product has no placement preset "${slot.preset}"`));
        else if (!preset.roles.includes(slot.role)) errors.push(error(`slots[${i}].preset`, `preset "${slot.preset}" takes ${preset.roles.join(", ")}, not the ${slot.role}`));
      });
    }
    if (fonts) {
      t.slots.forEach((slot, i) => {
        if (!fonts.fonts.some((f) => f.id === slot.style.fontId)) errors.push(error(`slots[${i}].style.fontId`, `font "${slot.style.fontId}" is not in the font catalogue`));
      });
    }
    return errors.length > 0 ? { ok: false, errors } : parsed;
  } catch (e) {
    return { ok: false, errors: [error("", `a template could not be read (${e instanceof Error ? e.message : String(e)})`)] };
  }
}

/** A template colour as the design's colour value: a team colour's value, or the palette colour. */
export function resolveTemplateColour(design: Pick<DesignDocument, "teamColors">, colour: TemplateColour, accentFallback: "main" | "second" = "second"): ColorValue {
  if ("palette" in colour) return { id: colour.palette.id, hex: colour.palette.hex };
  const role: TeamColourRole = colour.team === "accent" && !design.teamColors.accent ? accentFallback : colour.team;
  return teamColourValue(design, role);
}

export interface ApplyTemplateOptions {
  product: ProductDefinition;
  /** The font catalogue: the template's fonts are added to the design from it. */
  fonts: FontCatalog;
  /**
   * The template the design has now (`design.template`), if the caller has
   * it. It tells the coach's own slot switches apart from the old template's
   * layout: a slot the coach turned on or off, or moved, is kept as the coach
   * left it. Without it, the new template's slots replace the role layers,
   * except a role the coach turned off entirely, which stays off.
   */
  previous?: Template | null;
}

type RoleLayer = TextLayer | NumberLayer;

function styleFor(design: DesignDocument, template: Template, slotStyle: TemplateStyle, current: RoleLayer | undefined, product: ProductDefinition): LetteringStyle {
  const fallback = template.accentFallback ?? "second";
  const style: LetteringStyle = { fontId: slotStyle.fontId, fill: resolveTemplateColour(design, slotStyle.fill, fallback) };
  if (slotStyle.outline === null) style.outline = null;
  else if (slotStyle.outline) style.outline = { step: slotStyle.outline.step, color: resolveTemplateColour(design, slotStyle.outline.color, fallback) };
  else if (current?.outline) {
    // The template leaves the outline open: the coach's outline stays (its colour follows its team colour).
    const color = current.outline.color.teamColor && design.teamColors[current.outline.color.teamColor] ? teamColourValue(design, current.outline.color.teamColor) : { ...current.outline.color };
    style.outline = { step: outlineStepOf(current) ?? "thin", color };
  } else style.outline = null;
  const size = slotStyle.size ?? (current ? sizeStepOf(product, current) : null) ?? "medium";
  style.size = size;
  return style;
}

/**
 * The design with a template applied (see the module comment for what is
 * kept and what changes). Throws a DesignError when the template does not fit
 * the product or the font catalogue, or the result would not be valid.
 */
export function applyTemplate(design: DesignDocument, template: Template, options: ApplyTemplateOptions): DesignDocument {
  const { product, fonts } = options;
  const checked = validateTemplate(template, { product, fonts });
  if (!checked.ok) throw new DesignError(`Cannot apply template "${(template as { id?: unknown }).id}"`, checked.errors);
  if (design.product.id !== product.id) throw new DesignError(`Cannot apply template: the design is for "${design.product.id}", the product given is "${product.id}"`);
  const fallback = template.accentFallback ?? "second";

  // Zones and shapes: the template's layout, in the team's colours.
  const zones: DesignDocument["zones"] = {};
  for (const zone of product.zones) zones[zone.id] = resolveTemplateColour(design, template.zones[zone.id]!, fallback);

  // The sample player: kept; a template's sample number only fills an empty one.
  let next: DesignDocument = { ...design, zones, shapes: [], template: { id: template.id, version: template.version } };
  if (next.samplePlayer.number === "" && template.sampleNumber !== undefined && template.slots.some((s) => s.role === "player-number")) {
    next = { ...next, samplePlayer: { ...next.samplePlayer, number: template.sampleNumber } };
  }
  for (const slot of template.slots) if (!next.fonts.some((f) => f.id === slot.style.fontId)) next = addCatalogFont(next, fonts, slot.style.fontId);

  // Role slots, role by role.
  const replaced = new Map<string, RoleLayer | null>(); // current layer id -> its successor (null: removed)
  const added: RoleLayer[] = [];
  const takenIds = new Set([...design.layers.map((l) => l.id)]);
  for (const role of VALUE_ROLES as readonly ValueRole[]) {
    const current = next.layers.filter((l): l is RoleLayer => l.role === role && (l.kind === "text" || l.kind === "number"));
    const nowAt = new Set(current.flatMap((l) => (l.preset ? [l.preset] : [])));
    const slots = template.slots.filter((s) => s.role === role);
    let presets: string[];
    if (design.template === null) {
      presets = slots.map((s) => s.preset);
    } else if (current.length === 0) {
      presets = []; // the coach turned it off: it stays off
    } else {
      const before = options.previous ? new Set(options.previous.slots.filter((s) => s.role === role).map((s) => s.preset)) : new Set(nowAt);
      const extras = [...nowAt].filter((p) => !before.has(p));
      const removed = new Set([...before].filter((p) => !nowAt.has(p)));
      presets = [...slots.map((s) => s.preset).filter((p) => !removed.has(p)), ...extras.filter((p) => !slots.some((s) => s.preset === p))];
    }
    if (role === "player-number" && presets.length > 0 && roleValue(next, role) === "") {
      throw new DesignError(`Cannot apply template "${template.id}": the player's number is shown but the sample player has no number, and the template gives none`);
    }
    // Reuse the ids (and so the selection) of the role's layers: same preset first, then in order.
    const pool = [...current];
    const take = (preset: string): RoleLayer | undefined => {
      const k = pool.findIndex((l) => l.preset === preset);
      return k >= 0 ? pool.splice(k, 1)[0] : pool.shift();
    };
    const successors: Array<{ old: RoleLayer | undefined; layer: RoleLayer }> = [];
    for (const preset of presets) {
      const old = take(preset);
      const slot = slots.find((s) => s.preset === preset) ?? slots[0];
      const style = slot ? styleFor(next, template, slot.style, old ?? current[0], product) : old ? currentStyle(old, product) : null;
      if (!style) continue;
      const id = old?.id ?? freshId(takenIds, role);
      takenIds.add(id);
      successors.push({ old, layer: newRoleLayer(next, product, role, preset, style, id) });
    }
    for (const { old, layer } of successors) {
      if (old) replaced.set(old.id, layer);
      else added.push(layer);
    }
    for (const left of pool) replaced.set(left.id, null);
  }
  const layers: Layer[] = [];
  for (const layer of next.layers) {
    if (!replaced.has(layer.id)) layers.push(layer);
    else {
      const successor = replaced.get(layer.id);
      if (successor) layers.push(successor);
    }
  }
  layers.push(...added);

  // Shapes: ids that no layer uses.
  const shapes: Shape[] = [];
  for (const shape of template.shapes) {
    const shapeId = freshId(takenIds, "shape");
    takenIds.add(shapeId);
    shapes.push({ id: shapeId, kind: "shape", group: shape.group, pieceId: shape.pieceId, path: shape.path, fill: resolveTemplateColour(next, shape.fill, fallback), locked: true });
  }
  const result: DesignDocument = { ...next, shapes, layers };
  const valid = validateDesign(result, { product });
  if (!valid.ok) throw new DesignError(`Applying template "${template.id}" would give an invalid design`, valid.errors);
  return valid.value;
}

function currentStyle(layer: RoleLayer, product: ProductDefinition): LetteringStyle {
  return {
    fontId: layer.fontId,
    fill: { ...layer.fill },
    outline: layer.outline ? { step: outlineStepOf(layer) ?? "thin", color: { ...layer.outline.color } } : null,
    size: sizeStepOf(product, layer) ?? "medium",
  };
}

function freshId(taken: Set<string>, prefix: string): string {
  return nextLayerId({ layers: [...taken].map((id) => ({ id }) as Layer) }, prefix);
}
