/**
 * Immutable edit operations. Each returns a new document and never changes
 * its input. An edit that would produce an invalid layer or colour throws a
 * `DesignError` with readable messages instead of returning a broken document.
 *
 * Undo and redo are not built here; they come later and will sit on top of
 * these functions.
 */
import {
  colorRefSchema,
  fontRefSchema,
  layerSchema,
  type ColorRef,
  type DesignDocument,
  type FontRef,
  type Layer,
} from "./schema";
import { DesignError, zodIssuesToErrors } from "./validate";

/**
 * Fields of a layer that can be changed. `id` and `kind` are fixed: to change
 * the kind of a layer, remove it and add a new one. Nested objects such as
 * `position` and `size` are replaced whole, not merged.
 */
export type LayerPatch = Layer extends infer L
  ? L extends Layer
    ? Partial<Omit<L, "id" | "kind">>
    : never
  : never;

/** Sets the colour of one zone. The zone must already exist in the document. */
export function setZoneColor(design: DesignDocument, zoneId: string, color: ColorRef): DesignDocument {
  if (!Object.prototype.hasOwnProperty.call(design.zones, zoneId)) {
    throw new DesignError(
      `Cannot set colour: the design has no colour zone "${zoneId}" (zones: ${Object.keys(design.zones).join(", ") || "none"})`,
    );
  }
  const parsed = colorRefSchema.safeParse(color);
  if (!parsed.success) {
    throw new DesignError(`Invalid colour for zone "${zoneId}"`, zodIssuesToErrors(parsed.error.issues, "color"));
  }
  return { ...design, zones: { ...design.zones, [zoneId]: parsed.data } };
}

/** Adds a layer on top of the stack. The layer id must not be in use. */
export function addLayer(design: DesignDocument, layer: Layer): DesignDocument {
  const parsed = layerSchema.safeParse(layer);
  if (!parsed.success) {
    throw new DesignError("Invalid layer", zodIssuesToErrors(parsed.error.issues, "layer"));
  }
  if (design.layers.some((l) => l.id === parsed.data.id)) {
    throw new DesignError(`Cannot add layer: a layer with id "${parsed.data.id}" already exists`);
  }
  return { ...design, layers: [...design.layers, parsed.data] };
}

/** Changes fields of an existing layer. The result must still be a valid layer. */
export function updateLayer(design: DesignDocument, layerId: string, patch: LayerPatch): DesignDocument {
  const index = design.layers.findIndex((l) => l.id === layerId);
  const current = design.layers[index];
  if (!current) {
    throw new DesignError(`Cannot update layer: no layer with id "${layerId}"`);
  }
  const forbidden = ["id", "kind"].filter((key) => key in (patch as object));
  if (forbidden.length > 0) {
    throw new DesignError(`Cannot update layer "${layerId}": '${forbidden.join("', '")}' cannot be changed. Remove the layer and add a new one instead.`);
  }
  const parsed = layerSchema.safeParse({ ...current, ...patch });
  if (!parsed.success) {
    throw new DesignError(`Invalid update for layer "${layerId}"`, zodIssuesToErrors(parsed.error.issues, "layer"));
  }
  const layers = design.layers.slice();
  layers[index] = parsed.data;
  return { ...design, layers };
}

/** Removes a layer. */
export function removeLayer(design: DesignDocument, layerId: string): DesignDocument {
  if (!design.layers.some((l) => l.id === layerId)) {
    throw new DesignError(`Cannot remove layer: no layer with id "${layerId}"`);
  }
  return { ...design, layers: design.layers.filter((l) => l.id !== layerId) };
}

/** Adds a font to the document, or replaces the font with the same id. */
export function addFont(design: DesignDocument, font: FontRef): DesignDocument {
  const parsed = fontRefSchema.safeParse(font);
  if (!parsed.success) {
    throw new DesignError("Invalid font", zodIssuesToErrors(parsed.error.issues, "font"));
  }
  const exists = design.fonts.some((f) => f.id === parsed.data.id);
  const fonts = exists ? design.fonts.map((f) => (f.id === parsed.data.id ? parsed.data : f)) : [...design.fonts, parsed.data];
  return { ...design, fonts };
}
