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
import { fitLayerToArea, maxScaleInArea, minItemSide, printAreaOf } from "./print-area.js";
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

/** The fields of a layer that the print-area rule may change (place, box, turn, font size). */
function placed(layer: Layer): Partial<Layer> {
  const { position, size, rotation } = layer;
  return layer.kind === "text" || layer.kind === "number" ? { position, size, rotation, fontSize: layer.fontSize } : { position, size, rotation };
}

/** Applies `change` to the item, then the print-area rule (`fitLayerToArea`), as one update. */
export function placeLayer(
  design: DesignDocument,
  layerId: string,
  change: Partial<Pick<Layer, "position" | "size" | "rotation">> & { fontSize?: number },
  options: Options,
): DesignDocument {
  const layer = find(design, layerId);
  const fitted = fitLayerToArea(options.product, { ...layer, ...change } as Layer);
  return updateLayer(design, layerId, placed(fitted), options);
}

/** Moves the item by (dx, dy) mm, staying inside its print area. */
export function nudgeLayer(design: DesignDocument, layerId: string, dx: number, dy: number, options: Options): DesignDocument {
  const layer = find(design, layerId);
  return placeLayer(design, layerId, { position: { x: round3(layer.position.x + dx), y: round3(layer.position.y + dy) } }, options);
}

/**
 * The factor a resize may use: no larger than the print area allows (growing) and no smaller than the
 * product's smallest size for the kind of item (shrinking). A shrink never grows the item, a growth never shrinks it.
 */
export function limitScale(product: Pick<ProductDefinition, "pieces" | "minItemSize">, layer: Layer, factor: number): number {
  if (factor >= 1) {
    const piece = product.pieces.find((p) => p.id === layer.pieceId);
    return piece ? Math.min(factor, Math.max(1, maxScaleInArea(printAreaOf(piece), layer))) : factor;
  }
  const side = Math.min(layer.size.width, layer.size.height);
  return side > 0 ? Math.max(factor, Math.min(1, minItemSide(product, layer.kind) / side)) : factor;
}

/** Scales the item by `factor` about its centre, no larger than its print area allows and no smaller than its kind's smallest size. */
export function scaleLayerBy(design: DesignDocument, layerId: string, factor: number, options: Options): DesignDocument {
  const layer = find(design, layerId);
  return placeLayer(design, layerId, scaleLayer(layer, limitScale(options.product, layer, factor)), options);
}

/** Turns the item by `degrees` (clockwise), or to `to` degrees; stays inside its print area. */
export function rotateLayerBy(design: DesignDocument, layerId: string, degrees: number, options: Options): DesignDocument {
  const layer = find(design, layerId);
  return rotateLayerTo(design, layerId, layer.rotation + degrees, options);
}

export function rotateLayerTo(design: DesignDocument, layerId: string, degrees: number, options: Options): DesignDocument {
  find(design, layerId);
  return placeLayer(design, layerId, { rotation: normalizeRotation(degrees) }, options);
}

/** "Centre on the shirt": on the piece's centre line (the print area's middle), at the same height. */
export function centreLayer(design: DesignDocument, layerId: string, options: Options): DesignDocument {
  const layer = find(design, layerId);
  const piece = options.product.pieces.find((p) => p.id === layer.pieceId);
  if (!piece) return design;
  const area = printAreaOf(piece);
  return placeLayer(design, layerId, { position: { x: round3(area.x + area.width / 2), y: layer.position.y } }, options);
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
  const { preset: _preset, ...rest } = layer;
  void _preset;
  const position = { x: round3(layer.position.x + DUPLICATE_OFFSET_MM), y: round3(layer.position.y + DUPLICATE_OFFSET_MM) };
  const copy = fitLayerToArea(options.product, { ...rest, id, position } as Layer);
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
