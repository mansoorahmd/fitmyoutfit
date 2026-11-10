import placeholderJersey from "../../samples/products/placeholder-jersey.json";
import { validateProductDefinition } from "../design/validate";
import type { ColorRef, DesignDocument, Layer, ProductDefinition } from "../design/schema";

/** The placeholder product definition, validated, as shipped in samples/. */
export function loadPlaceholderProduct(): ProductDefinition {
  const result = validateProductDefinition(placeholderJersey);
  if (!result.ok) throw new Error(result.errors.map((e) => e.message).join("\n"));
  return result.value;
}

export const RED: ColorRef = { id: "placeholder-red", hex: "#C8102E" };
export const GREEN: ColorRef = { id: "placeholder-green", hex: "#0B6B3A" };

export function textLayer(overrides: Partial<Extract<Layer, { kind: "text" }>> = {}): Layer {
  return {
    id: "text-1",
    kind: "text",
    pieceId: "front",
    position: { x: 280, y: 250 },
    size: { width: 400, height: 80 },
    rotation: 0,
    value: "TIGERS",
    fontId: "font-sans",
    fontSize: 60,
    fill: RED,
    align: "center",
    ...overrides,
  };
}

export function numberLayer(): Layer {
  return {
    id: "number-1",
    kind: "number",
    pieceId: "back",
    position: { x: 280, y: 300 },
    size: { width: 300, height: 400 },
    rotation: 0,
    value: "07",
    fontId: "font-sans",
    fontSize: 300,
    fill: RED,
    align: "center",
  };
}

export function logoLayer(): Layer {
  return {
    id: "logo-1",
    kind: "logo",
    pieceId: "front",
    position: { x: 120, y: 100 },
    size: { width: 90, height: 90 },
    rotation: 15,
    asset: { assetId: "upload-abc123", mediaType: "image/svg+xml" },
  };
}

export function clipartLayer(): Layer {
  return {
    id: "clipart-1",
    kind: "clipart",
    pieceId: "sleeve_left",
    position: { x: 220, y: 110 },
    size: { width: 60, height: 60 },
    rotation: -30,
    asset: { assetId: "clipart-star", mediaType: "image/png" },
  };
}

/** A design that uses every layer kind. */
export function fullDesign(base: DesignDocument): DesignDocument {
  return {
    ...base,
    fonts: [{ id: "font-sans", family: "Inter", weight: 700 }],
    layers: [textLayer(), numberLayer(), logoLayer(), clipartLayer()],
  };
}
