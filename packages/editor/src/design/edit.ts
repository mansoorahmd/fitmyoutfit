/**
 * Immutable edit operations. Each returns a new document and never changes
 * its input. An edit that would produce an invalid layer or colour throws a
 * `DesignError` with readable messages instead of returning a broken document.
 *
 * Fonts: a text or number layer must use a font listed in the document's
 * `fonts`, so add the font first (`addFont`). Fonts that no layer uses any more
 * (after `removeLayer`, or after a layer switches font) are left in `fonts`:
 * an unused font entry is harmless, it keeps the font available for the next
 * layer, and it is never removed behind the caller's back.
 *
 * Products: the document does not hold the product's pieces and zones, so the
 * edits cannot check them on their own. Pass `{ product }` as the last
 * argument to also refuse a piece or zone the product does not have.
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
  type ProductDefinition,
} from "./schema.js";
import { DEFAULT_JERSEY_NUMBER_RULES, type JerseyNumberRules } from "./jersey-number-rules.js";
import { DesignError, jerseyNumberLayerErrors, jerseyNumberRulesError, zodIssuesToErrors } from "./validate.js";

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

/** Options for the edit functions. */
export interface EditOptions {
  /** When given, the edit is also checked against this product's pieces and zones. */
  product?: ProductDefinition;
  /**
   * The jersey number rules for number layers. Defaults to
   * `DEFAULT_JERSEY_NUMBER_RULES` (maximum 99, three digit systems).
   */
  jerseyNumberRules?: JerseyNumberRules;
}

/** The rules to use, or a DesignError when the given rules are unusable. */
function requireRules(options: EditOptions | undefined, action: string): JerseyNumberRules {
  const rules = options?.jerseyNumberRules ?? DEFAULT_JERSEY_NUMBER_RULES;
  const problem = jerseyNumberRulesError(rules);
  if (problem) throw new DesignError(`Cannot ${action}: ${problem.message}`);
  return rules;
}

function describeValue(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "an array";
  if (value === undefined) return "undefined";
  return `a ${typeof value}`;
}

/** Throws a DesignError, not a TypeError, when an argument has the wrong shape. */
function requireDesign(design: unknown, action: string): asserts design is DesignDocument {
  const d = design as Partial<DesignDocument> | null | undefined;
  if (
    typeof d !== "object" ||
    d === null ||
    !Array.isArray(d.layers) ||
    !Array.isArray(d.fonts) ||
    typeof d.zones !== "object" ||
    d.zones === null
  ) {
    throw new DesignError(`Cannot ${action}: the first argument must be a design document, got ${describeValue(design)}`);
  }
}

function requireString(value: unknown, action: string, what: string): asserts value is string {
  if (typeof value !== "string") {
    throw new DesignError(`Cannot ${action}: ${what} must be a string, got ${describeValue(value)}`);
  }
}

function requireProduct(options: EditOptions | undefined, action: string): ProductDefinition | undefined {
  const product = options?.product;
  if (product === undefined) return undefined;
  if (typeof product !== "object" || product === null || !Array.isArray(product.pieces) || !Array.isArray(product.zones)) {
    throw new DesignError(`Cannot ${action}: 'product' in the options must be a product definition, got ${describeValue(product)}`);
  }
  return product;
}

/** A layer must use a font that the document lists, and (with a product) a piece the product has. */
function checkLayerReferences(
  design: DesignDocument,
  layer: Layer,
  product: ProductDefinition | undefined,
  action: string,
): void {
  if ((layer.kind === "text" || layer.kind === "number") && !design.fonts.some((f) => f.id === layer.fontId)) {
    const listed = design.fonts.map((f) => f.id).join(", ") || "none";
    throw new DesignError(
      `Cannot ${action}: font "${layer.fontId}" is not in the document's fonts (fonts: ${listed}). Add it first with addFont.`,
    );
  }
  if (product) {
    if (design.product.id !== product.id) {
      throw new DesignError(
        `Cannot ${action}: the design is for product "${design.product.id}" but the product given is "${product.id}"`,
      );
    }
    if (!product.pieces.some((p) => p.id === layer.pieceId)) {
      const available = product.pieces.map((p) => p.id).join(", ");
      throw new DesignError(
        `Cannot ${action}: product "${product.id}" has no pattern piece "${layer.pieceId}" (pieces: ${available})`,
      );
    }
  }
}

/** Sets the colour of one zone. The zone must already exist in the document (and in the product, if given). */
export function setZoneColor(
  design: DesignDocument,
  zoneId: string,
  color: ColorRef,
  options?: EditOptions,
): DesignDocument {
  requireDesign(design, "set colour");
  requireString(zoneId, "set colour", "the zone id");
  const product = requireProduct(options, "set colour");
  if (product && !product.zones.some((z) => z.id === zoneId)) {
    throw new DesignError(
      `Cannot set colour: product "${product.id}" has no colour zone "${zoneId}" (zones: ${product.zones.map((z) => z.id).join(", ")})`,
    );
  }
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

/**
 * Adds a layer on top of the stack. The layer id must not be in use, and a
 * text or number layer must use a font that is in `design.fonts`.
 */
export function addLayer(design: DesignDocument, layer: Layer, options?: EditOptions): DesignDocument {
  requireDesign(design, "add layer");
  const product = requireProduct(options, "add layer");
  const rules = requireRules(options, "add layer");
  const parsed = layerSchema.safeParse(layer);
  if (!parsed.success) {
    throw new DesignError("Invalid layer", zodIssuesToErrors(parsed.error.issues, "layer"));
  }
  const numberErrors = jerseyNumberLayerErrors(parsed.data, "layer", rules);
  if (numberErrors.length > 0) throw new DesignError("Invalid layer", numberErrors);
  if (design.layers.some((l) => l.id === parsed.data.id)) {
    throw new DesignError(`Cannot add layer: a layer with id "${parsed.data.id}" already exists`);
  }
  checkLayerReferences(design, parsed.data, product, `add layer "${parsed.data.id}"`);
  return { ...design, layers: [...design.layers, parsed.data] };
}

/** Changes fields of an existing layer. The result must still be a valid layer. */
export function updateLayer(
  design: DesignDocument,
  layerId: string,
  patch: LayerPatch,
  options?: EditOptions,
): DesignDocument {
  requireDesign(design, "update layer");
  requireString(layerId, "update layer", "the layer id");
  const product = requireProduct(options, "update layer");
  const rules = requireRules(options, "update layer");
  if (typeof patch !== "object" || patch === null || Array.isArray(patch)) {
    throw new DesignError(`Cannot update layer "${layerId}": the changes must be an object, got ${describeValue(patch)}`);
  }
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
  const numberErrors = jerseyNumberLayerErrors(parsed.data, "layer", rules);
  if (numberErrors.length > 0) throw new DesignError(`Invalid update for layer "${layerId}"`, numberErrors);
  checkLayerReferences(design, parsed.data, product, `update layer "${layerId}"`);
  const layers = design.layers.slice();
  layers[index] = parsed.data;
  return { ...design, layers };
}

/** Removes a layer. Fonts stay in the document even if no layer uses them any more. */
export function removeLayer(design: DesignDocument, layerId: string): DesignDocument {
  requireDesign(design, "remove layer");
  requireString(layerId, "remove layer", "the layer id");
  if (!design.layers.some((l) => l.id === layerId)) {
    throw new DesignError(`Cannot remove layer: no layer with id "${layerId}"`);
  }
  return { ...design, layers: design.layers.filter((l) => l.id !== layerId) };
}

/** Adds a font to the document, or replaces the font with the same id. */
export function addFont(design: DesignDocument, font: FontRef): DesignDocument {
  requireDesign(design, "add font");
  const parsed = fontRefSchema.safeParse(font);
  if (!parsed.success) {
    throw new DesignError("Invalid font", zodIssuesToErrors(parsed.error.issues, "font"));
  }
  const exists = design.fonts.some((f) => f.id === parsed.data.id);
  const fonts = exists ? design.fonts.map((f) => (f.id === parsed.data.id ? parsed.data : f)) : [...design.fonts, parsed.data];
  return { ...design, fonts };
}
