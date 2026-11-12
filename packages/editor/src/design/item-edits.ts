/**
 * The selected item's edits without dragging (06-editor.md 5.1, 5.2: the
 * contextual bar, fine-tune and the keyboard; WCAG 2.5.7 needs a way that is
 * not a drag): nudge, size and turn steps, straighten, centre, duplicate,
 * bring forward and send back. Every result keeps the whole box inside the
 * piece's print area (print-area.ts). Each returns a new design (one undo step
 * when committed); none touches the design passed in.
 */
import { addLayer, moveLayer, updateLayer, type EditOptions } from "./edit.js";
import { nextLayerId } from "./new-layers.js";
import { normalizeRotation, round3, scaleLayer } from "./placement.js";
import { clampToPrintArea, maxScaleInArea, printAreaOf } from "./print-area.js";
import type { DesignDocument, Layer, ProductDefinition } from "./schema.js";

type Options = EditOptions & { product: ProductDefinition };

/** Steps (06-editor.md 5.1, 5.2): fine-tune moves 2 mm; arrows 1 mm, Shift 10 mm; size 10%; turn 15 degrees. */
export const NUDGE_MM = 2;
export const KEY_NUDGE_MM = 1;
export const KEY_NUDGE_LARGE_MM = 10;
export const SIZE_STEP = 1.1;
export const TURN_STEP = 15;
/** How far a duplicate lands from its original (mm, down and right), so both are seen. */
export const DUPLICATE_OFFSET_MM = 12;

function find(design: DesignDocument, layerId: string): Layer {
  const layer = design.layers.find((l) => l.id === layerId);
  if (!layer) throw new RangeError(`there is no layer "${layerId}"`);
  return layer;
}

/** Moves the item by (dx, dy) mm, staying inside its print area. */
export function nudgeLayer(design: DesignDocument, layerId: string, dx: number, dy: number, options: Options): DesignDocument {
  const layer = find(design, layerId);
  const position = clampToPrintArea(options.product, layer, { x: round3(layer.position.x + dx), y: round3(layer.position.y + dy) });
  return updateLayer(design, layerId, { position }, options);
}

/** Scales the item by `factor` about its centre, no larger than its print area allows. */
export function scaleLayerBy(design: DesignDocument, layerId: string, factor: number, options: Options): DesignDocument {
  const layer = find(design, layerId);
  const piece = options.product.pieces.find((p) => p.id === layer.pieceId);
  const limited = piece ? Math.min(factor, Math.max(1, maxScaleInArea(printAreaOf(piece), layer))) : factor;
  const scaled = scaleLayer(layer, factor > 1 ? limited : factor);
  const position = clampToPrintArea(options.product, { ...layer, size: scaled.size });
  return updateLayer(design, layerId, { ...scaled, position }, options);
}

/** Turns the item by `degrees` (clockwise), or to `to` degrees; stays inside its print area. */
export function rotateLayerBy(design: DesignDocument, layerId: string, degrees: number, options: Options): DesignDocument {
  const layer = find(design, layerId);
  return rotateLayerTo(design, layerId, layer.rotation + degrees, options);
}

export function rotateLayerTo(design: DesignDocument, layerId: string, degrees: number, options: Options): DesignDocument {
  const layer = find(design, layerId);
  const rotation = normalizeRotation(degrees);
  const position = clampToPrintArea(options.product, { ...layer, rotation });
  return updateLayer(design, layerId, { rotation, position }, options);
}

/** "Centre on the shirt": on the piece's centre line (the print area's middle), at the same height. */
export function centreLayer(design: DesignDocument, layerId: string, options: Options): DesignDocument {
  const layer = find(design, layerId);
  const piece = options.product.pieces.find((p) => p.id === layer.pieceId);
  if (!piece) return design;
  const area = printAreaOf(piece);
  const position = clampToPrintArea(options.product, layer, { x: round3(area.x + area.width / 2), y: layer.position.y });
  return updateLayer(design, layerId, { position }, options);
}

/** Which items may be duplicated: logos and free text (06-editor.md 4.8). Names and numbers come from the team, once each. */
export function canDuplicate(layer: Pick<Layer, "kind" | "role">): boolean {
  return layer.kind === "logo" || layer.kind === "clipart" || (layer.kind === "text" && layer.role === "text");
}

/** A copy of the item just above it, a little down and right, inside the print area; the copy's id is returned with the design. */
export function duplicateLayer(design: DesignDocument, layerId: string, options: Options): { design: DesignDocument; id: string } {
  const layer = find(design, layerId);
  if (!canDuplicate(layer)) throw new RangeError(`a ${layer.role} item cannot be duplicated`);
  const id = nextLayerId(design, layer.kind === "text" ? "text" : "logo");
  const position = clampToPrintArea(options.product, layer, { x: round3(layer.position.x + DUPLICATE_OFFSET_MM), y: round3(layer.position.y + DUPLICATE_OFFSET_MM) });
  const { preset: _preset, ...rest } = layer;
  void _preset;
  const copy = { ...rest, id, position } as Layer;
  const added = addLayer(design, copy, options);
  const from = added.layers.findIndex((l) => l.id === id);
  const to = added.layers.findIndex((l) => l.id === layerId) + 1;
  return { design: from === to ? added : moveLayer(added, id, to), id };
}

/** One place up (drawn over the next item) or down. Unchanged at the top or the bottom. */
export function bringForward(design: DesignDocument, layerId: string): DesignDocument {
  const k = design.layers.findIndex((l) => l.id === layerId);
  return k < 0 || k === design.layers.length - 1 ? design : moveLayer(design, layerId, k + 1);
}

export function sendBack(design: DesignDocument, layerId: string): DesignDocument {
  const k = design.layers.findIndex((l) => l.id === layerId);
  return k <= 0 ? design : moveLayer(design, layerId, k - 1);
}
