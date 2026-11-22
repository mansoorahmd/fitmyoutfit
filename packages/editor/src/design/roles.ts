/**
 * Items by role (N1, 06-editor.md 4.5): the team name, the player's name and
 * number are roles, not text boxes. The design keeps one value per role (the
 * team name, the sample player's name and number) and every layer with the
 * role shows it, so the roster preview (E4) shows each player by swapping two
 * values, without guessing which layer is which from where it sits.
 *
 * Also here: role slots at placement presets (the Players tool's switches:
 * "Name on back", "Number on front"), moving a layer to a preset, and the
 * size steps (Small, Medium, Large) relative to a preset.
 */
import {
  ROLES_BY_KIND,
  type ColorValue,
  type DesignDocument,
  type ItemRole,
  type Layer,
  type NumberLayer,
  type Outline,
  type PlacementPreset,
  type ProductDefinition,
  type TextLayer,
  type ViewSide,
} from "./schema.js";
import { addLayer, roleValue, setRoleValue, updateLayer, type EditOptions, type ValueRole } from "./edit.js";
import { addCatalogFont, type FontCatalog } from "./font-catalog.js";
import { newNumberLayer, newTextLayer, nextLayerId, requirePreset } from "./new-layers.js";
import { round3 } from "./placement.js";
import { fitLayerToArea } from "./print-area.js";
import { DesignError } from "./validate.js";
import type { LetterCase } from "./letter-case.js";

/** Sets the team name: the design's `teamName` and every team-name layer. One edit. */
export function setTeamName(design: DesignDocument, value: string, options?: EditOptions): DesignDocument {
  return setRoleValue(design, "team-name", value, options);
}

/** A player as the roster gives one: a name (may be empty) and a jersey number as typed. */
export interface PlayerValues {
  name: string;
  number: string;
}

/**
 * Sets the sample player shown while designing (either field, or both): the
 * design's `samplePlayer` and every player-name and player-number layer. One edit.
 */
export function setSamplePlayer(design: DesignDocument, player: Partial<PlayerValues>, options?: EditOptions): DesignDocument {
  let next = design;
  if (player.name !== undefined) next = setRoleValue(next, "player-name", player.name, options);
  if (player.number !== undefined) next = setRoleValue(next, "player-number", player.number, options);
  return next;
}

/**
 * The design as it looks for one player: the player's name and number in
 * every player-name and player-number layer, everything else unchanged. This
 * is the roster preview's swap (E4) and the proof's per-player render (E5).
 * The number must follow the jersey number rule (English, Arabic or Urdu
 * digits, one system, at most 99); names may be Latin, Arabic or Urdu, and are
 * normalised to NFC. Throws a DesignError for a number that breaks the rule.
 */
export function designForPlayer(design: DesignDocument, player: PlayerValues, options?: EditOptions): DesignDocument {
  return setSamplePlayer(design, player, options);
}

export interface ItemQuery {
  role?: ItemRole;
  kind?: Layer["kind"];
  /** Only layers placed at this preset. */
  preset?: string;
  pieceId?: string;
}

/** The layers that match every given field, bottom to top. */
export function findLayers(design: Pick<DesignDocument, "layers">, query: ItemQuery): Layer[] {
  return design.layers.filter(
    (l) =>
      (query.role === undefined || l.role === query.role) &&
      (query.kind === undefined || l.kind === query.kind) &&
      (query.preset === undefined || l.preset === query.preset) &&
      (query.pieceId === undefined || l.pieceId === query.pieceId),
  );
}

/**
 * The side of the garment a layer is seen from: its preset's side; otherwise
 * the side of the product's presets on the same piece; otherwise "front" or
 * "back" for the product's front and back pieces. Null when nothing says.
 */
export function layerSide(product: ProductDefinition, layer: Pick<Layer, "pieceId" | "preset">): ViewSide | null {
  if (layer.preset !== undefined) {
    const preset = product.placements.find((p) => p.id === layer.preset);
    if (preset) return preset.side;
  }
  const onPiece = product.placements.find((p) => p.pieceId === layer.pieceId);
  if (onPiece) return onPiece.side;
  if (layer.pieceId === product.views.front) return "front";
  if (layer.pieceId === product.views.back) return "back";
  return null;
}

/** The layers with a role on one side of the garment ("the player's number on the back"). */
export function findRoleLayersOnSide(design: Pick<DesignDocument, "layers">, product: ProductDefinition, role: ItemRole, side: ViewSide): Layer[] {
  return design.layers.filter((l) => l.role === role && layerSide(product, l) === side);
}

/** Size steps for lettering, relative to the preset's font size (Small, Medium, Large). */
export const SIZE_STEPS = Object.freeze({ small: 0.8, medium: 1, large: 1.25 } as const);
export type SizeStep = keyof typeof SIZE_STEPS;

/** Outline widths, as a fraction of the em size (so an outline looks the same on a 50 mm name and a 215 mm number). */
export const OUTLINE_STEPS = Object.freeze({ thin: 0.03, medium: 0.05, thick: 0.08 } as const);
export type OutlineStep = keyof typeof OUTLINE_STEPS;
/** The thinnest outline drawn, in mm: thinner does not print reliably (placeholder until the factories' limits arrive). */
export const MIN_OUTLINE_MM = 1;

/** The outline width in mm for an outline step at a font size. */
export function outlineWidthMm(fontSize: number, step: OutlineStep): number {
  return round3(Math.min(20, Math.max(MIN_OUTLINE_MM, fontSize * OUTLINE_STEPS[step])));
}

/** The outline step nearest to an outline's width at this font size (for the interface's None / Thin / Thick control). */
export function outlineStepOf(layer: { fontSize: number; outline?: Outline }): OutlineStep | null {
  if (!layer.outline) return null;
  let best: OutlineStep = "thin";
  for (const step of Object.keys(OUTLINE_STEPS) as OutlineStep[]) {
    if (Math.abs(outlineWidthMm(layer.fontSize, step) - layer.outline.width) < Math.abs(outlineWidthMm(layer.fontSize, best) - layer.outline.width)) best = step;
  }
  return best;
}

/** The size step nearest to a layer's font size at its preset, or null without a preset. */
export function sizeStepOf(product: ProductDefinition, layer: { preset?: string; fontSize: number }): SizeStep | null {
  const preset = layer.preset === undefined ? undefined : product.placements.find((p) => p.id === layer.preset);
  if (!preset?.fontSize) return null;
  const factor = layer.fontSize / preset.fontSize;
  let best: SizeStep = "medium";
  for (const step of Object.keys(SIZE_STEPS) as SizeStep[]) if (Math.abs(SIZE_STEPS[step] - factor) < Math.abs(SIZE_STEPS[best] - factor)) best = step;
  return best;
}

/** The style a role slot is drawn in: what the Team and Players tools set. */
export interface LetteringStyle {
  fontId: string;
  fill: ColorValue;
  /** An outline step and its colour, or null for none. */
  outline?: { step: OutlineStep; color: ColorValue } | null;
  /** Default "medium". */
  size?: SizeStep;
}

/** The font size and box a text or number layer gets at a preset, at a size step. */
export function presetBox(preset: PlacementPreset, kind: "text" | "number", factor: number, fallbackFontSize: number) {
  const base = preset.fontSize ?? fallbackFontSize;
  // The box never grows past the preset's largest box; a long line shrinks to its width.
  const lineHeight = kind === "number" ? 1.1 : 1.4;
  const fontSize = round3(base * factor);
  return { fontSize, size: { width: preset.maxSize.width, height: round3(Math.min(preset.maxSize.height, fontSize * lineHeight)) } };
}

function styleOf(layer: TextLayer | NumberLayer, product: ProductDefinition): LetteringStyle {
  const step = sizeStepOf(product, layer);
  return {
    fontId: layer.fontId,
    fill: { ...layer.fill },
    outline: layer.outline ? { step: outlineStepOf(layer)!, color: { ...layer.outline.color } } : null,
    ...(step ? { size: step } : {}),
  };
}

export interface RoleSlotOptions extends EditOptions {
  product: ProductDefinition;
  /** Needed when the style names a font the design does not list yet. */
  fonts?: FontCatalog;
  /**
   * The style for a new layer when no layer of the role is on the kit to copy
   * it from (a template's slot style, say).
   */
  style?: LetteringStyle;
}

/** A text or number layer for a value role at a preset, in a style, showing the design's value. */
export function newRoleLayer(design: DesignDocument, product: ProductDefinition, role: ValueRole, presetId: string, style: LetteringStyle, id?: string): TextLayer | NumberLayer {
  const preset = requirePreset(product, presetId);
  if (!preset.roles.includes(role)) throw new DesignError(`Cannot place the ${role} at preset "${preset.id}": it takes ${preset.roles.join(", ")}`);
  const kind = role === "player-number" ? "number" : "text";
  const { fontSize, size } = presetBox(preset, kind, SIZE_STEPS[style.size ?? "medium"], kind === "number" ? 150 : 50);
  const value = roleValue(design, role);
  if (kind === "number" && value === "") {
    throw new DesignError("Cannot show the number: the sample player has no number yet; set one with setSamplePlayer first");
  }
  const outline = style.outline ? { color: { ...style.outline.color }, width: outlineWidthMm(fontSize, style.outline.step) } : undefined;
  const layerId = id ?? nextLayerId(design, role);
  const common = { id: layerId, preset: preset.id, fontId: style.fontId, fill: { ...style.fill }, fontSize, ...(outline ? { outline } : {}) };
  const layer =
    kind === "number"
      ? newNumberLayer(product, { ...common, role: "player-number", value })
      : newTextLayer(product, { ...common, role: role as "team-name" | "player-name", value });
  return fitLayerToArea(product, { ...layer, size });
}

/**
 * Turns a role slot on or off at a preset (the Players tool's switches, and
 * the Team tool's "Off"). On: adds a layer of the role at the preset, in the
 * style of the role's layer already on the kit (else `options.style`); a slot
 * that is already on is left as it is. Off: removes the role's layers at the
 * preset (the value stays in the design, so turning it on again shows it).
 * One edit.
 */
export function setRoleSlot(design: DesignDocument, role: ValueRole, presetId: string, on: boolean, options: RoleSlotOptions): DesignDocument {
  const { product } = options;
  const preset = requirePreset(product, presetId);
  if (!preset.roles.includes(role)) throw new DesignError(`Cannot place the ${role} at preset "${preset.id}": it takes ${preset.roles.join(", ")}`);
  const here = findLayers(design, { role, preset: presetId });
  if (!on) {
    if (here.length === 0) return design;
    const ids = new Set(here.map((l) => l.id));
    return { ...design, layers: design.layers.filter((l) => !ids.has(l.id)) };
  }
  if (here.length > 0) return design;
  const model = design.layers.find((l): l is TextLayer | NumberLayer => l.role === role && (l.kind === "text" || l.kind === "number"));
  const style = model ? styleOf(model, product) : options.style;
  if (!style) throw new DesignError(`Cannot show the ${role} at "${presetId}": no ${role} is on the kit to copy the style from, and no style was given`);
  let next = design;
  if (!next.fonts.some((f) => f.id === style.fontId)) {
    if (!options.fonts) throw new DesignError(`Cannot show the ${role}: font "${style.fontId}" is not in the design; pass the font catalogue`);
    next = addCatalogFont(next, options.fonts, style.fontId);
  }
  return addLayer(next, newRoleLayer(next, product, role, presetId, style), options);
}

/** Whether a role slot is on at a preset. */
export function isRoleSlotOn(design: Pick<DesignDocument, "layers">, role: ItemRole, presetId: string): boolean {
  return design.layers.some((l) => l.role === role && l.preset === presetId);
}

/**
 * Moves a layer to a placement preset (the "Where" chips): its piece and
 * centre, and for text and numbers the preset's box and font size at the
 * layer's current size step; a logo keeps its proportions inside the preset's
 * box. The preset must take the layer's role. One edit.
 */
export function placeAtPreset(design: DesignDocument, layerId: string, presetId: string, options: EditOptions & { product: ProductDefinition }): DesignDocument {
  const { product } = options;
  const layer = design.layers.find((l) => l.id === layerId);
  if (!layer) throw new DesignError(`Cannot place layer: no layer with id "${layerId}"`);
  const preset = requirePreset(product, presetId);
  if (!preset.roles.includes(layer.role)) {
    throw new DesignError(`Cannot place a ${layer.role} at preset "${preset.id}": it takes ${preset.roles.join(", ")}`);
  }
  const place = { pieceId: preset.pieceId, position: { ...preset.centre }, preset: preset.id };
  if (layer.kind === "text" || layer.kind === "number") {
    const step = sizeStepOf(product, layer) ?? "medium";
    const { fontSize, size } = presetBox(preset, layer.kind, SIZE_STEPS[step], layer.fontSize);
    const fitted = fitLayerToArea(product, { ...layer, ...place, fontSize, size });
    const outline = layer.outline ? { ...layer.outline, width: outlineWidthMm(fitted.fontSize, outlineStepOf(layer)!) } : undefined;
    return updateLayer(design, layerId, { ...place, position: fitted.position, fontSize: fitted.fontSize, size: fitted.size, ...(outline ? { outline } : {}) }, options);
  }
  const ratio = layer.size.height / layer.size.width;
  const width = Math.min(layer.size.width, preset.maxSize.width, preset.maxSize.height / ratio);
  const fitted = fitLayerToArea(product, { ...layer, ...place, size: { width: round3(width), height: round3(width * ratio) } });
  return updateLayer(design, layerId, { ...place, position: fitted.position, size: fitted.size }, options);
}

/** Sets the size step of a text or number layer at its preset (Small, Medium, Large). One edit. */
export function setSizeStep(design: DesignDocument, layerId: string, step: SizeStep, options: EditOptions & { product: ProductDefinition }): DesignDocument {
  const layer = design.layers.find((l) => l.id === layerId);
  if (!layer || (layer.kind !== "text" && layer.kind !== "number")) throw new DesignError(`Cannot resize: no text or number layer with id "${layerId}"`);
  if (layer.preset === undefined) throw new DesignError(`Cannot resize layer "${layerId}" by steps: it is not at a placement preset`);
  const preset = requirePreset(options.product, layer.preset);
  const { fontSize, size } = presetBox(preset, layer.kind, SIZE_STEPS[step], layer.fontSize);
  const fitted = fitLayerToArea(options.product, { ...layer, fontSize, size });
  const outline = layer.outline ? { ...layer.outline, width: outlineWidthMm(fitted.fontSize, outlineStepOf(layer)!) } : undefined;
  return updateLayer(design, layerId, { fontSize: fitted.fontSize, size: fitted.size, position: fitted.position, ...(outline ? { outline } : {}) }, options);
}

/**
 * Sets or removes the outline of a text or number layer: a step (thin,
 * medium, thick: a width relative to the font size) and a colour, or null. One edit.
 */
export function setOutline(design: DesignDocument, layerId: string, outline: { step: OutlineStep; color: ColorValue } | null, options?: EditOptions): DesignDocument {
  const layer = design.layers.find((l) => l.id === layerId);
  if (!layer || (layer.kind !== "text" && layer.kind !== "number")) throw new DesignError(`Cannot set an outline: no text or number layer with id "${layerId}"`);
  if (outline === null) {
    if (!layer.outline) return design;
    const rest = { ...layer };
    delete rest.outline;
    const layers = design.layers.map((l) => (l.id === layerId ? rest : l));
    return { ...design, layers };
  }
  return updateLayer(design, layerId, { outline: { color: { ...outline.color }, width: outlineWidthMm(layer.fontSize, outline.step) } }, options);
}

/** The roles a layer of this kind may have (from the format). */
export function rolesForKind(kind: Layer["kind"]): readonly ItemRole[] {
  return ROLES_BY_KIND[kind];
}

/**
 * How the player-name items are drawn (decision 012, Q-TL2): "upper" is the default and is stored as nothing ("As typed"
 * is the only value that is written). The stored names never change. Returns the same design when nothing changes.
 */
export function setNameLetterCase(design: DesignDocument, value: LetterCase): DesignDocument {
  let changed = false;
  const layers = design.layers.map((layer) => {
    if (layer.kind !== "text" || layer.role !== "player-name") return layer;
    if (value === "as-typed") {
      if (layer.letterCase === "as-typed") return layer;
      changed = true;
      return { ...layer, letterCase: "as-typed" as const };
    }
    if (layer.letterCase === undefined) return layer;
    changed = true;
    const { letterCase: _dropped, ...rest } = layer;
    void _dropped;
    return rest;
  });
  return changed ? { ...design, layers } : design;
}

/** The letter case of the design's player names: "as-typed" when any name item says so, else the default, "upper"; null when the design has no player name item. */
export function nameLetterCase(design: Pick<DesignDocument, "layers">): LetterCase | null {
  const names = design.layers.filter((l) => l.kind === "text" && l.role === "player-name");
  if (names.length === 0) return null;
  return names.some((l) => l.kind === "text" && l.letterCase === "as-typed") ? "as-typed" : "upper";
}
