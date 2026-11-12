/**
 * The Logos tool's rules (06-editor.md 4.6), as plain functions: where the
 * next logo goes, its size in words (the stepper), "Make it sharp", the
 * resolution warning recomputed from the design, and the replacement of a
 * logo's file keeping its place.
 */
import { updateLayer } from "../design/edit.js";
import { round3 } from "../design/placement.js";
import { clampToPrintArea, maxScaleInArea, printAreaOf } from "../design/print-area.js";
import type { DesignDocument, Layer, LogoAssetRef, PlacementPreset, ProductDefinition } from "../design/schema.js";
import { DEFAULT_UPLOAD_LIMITS, logoLayerWarnings, maxPrintWidthMm } from "../design/upload-checks.js";

export type LogoLayer = Extract<Layer, { kind: "logo" }>;

/**
 * The usual order of logos on club kits (4.6): the crest on the left chest
 * (the wearer's left), a sponsor in the centre of the chest, a third on the
 * upper back; then the other places.
 */
export const LOGO_ORDER = ["left-chest", "chest-centre", "upper-back", "right-chest", "lower-back", "sleeve-left", "sleeve-right"];

/** The size a logo is said to be, from the stepper's reference (a third of the way each side counts as "between"). */
export type LogoSizeWord = "small" | "medium" | "large";

/** The logo's reference width (mm): what "Medium" means at its place: its preset's box, at most 100 mm, as a new logo starts. */
export function logoReferenceWidth(product: ProductDefinition, layer: Pick<LogoLayer, "preset" | "pieceId" | "asset">): number {
  const preset = layer.preset ? product.placements.find((p) => p.id === layer.preset) : undefined;
  const piece = product.pieces.find((p) => p.id === layer.pieceId);
  const presetWidth = preset ? Math.min(preset.maxSize.width, (preset.maxSize.height * layer.asset.width) / layer.asset.height) : Infinity;
  return Math.max(20, Math.min(100, (piece?.width ?? 500) * 0.4, presetWidth));
}

/** The stepper's step (each press of − or +). */
export const LOGO_SIZE_STEP = 1.15;

export function logoSizeWord(product: ProductDefinition, layer: LogoLayer): LogoSizeWord {
  const ratio = layer.size.width / logoReferenceWidth(product, layer);
  if (ratio < 0.85) return "small";
  if (ratio > 1.15) return "large";
  return "medium";
}

/** Whether − and + can still change the size (limits: 5 mm, and the print area). */
export function logoSizeLimits(product: ProductDefinition, layer: LogoLayer): { canShrink: boolean; canGrow: boolean } {
  const piece = product.pieces.find((p) => p.id === layer.pieceId);
  const room = piece ? maxScaleInArea(printAreaOf(piece), layer) : Infinity;
  return { canShrink: Math.min(layer.size.width, layer.size.height) / LOGO_SIZE_STEP >= 5, canGrow: room > 1.0005 };
}

/** The widest the logo prints sharp (mm), and in whole centimetres down, for the coach ("Sharp up to 9 cm wide"). */
export function sharpWidth(layer: Pick<LogoLayer, "asset">, minDpi = DEFAULT_UPLOAD_LIMITS.minDpi): { mm: number; cm: number } {
  const mm = maxPrintWidthMm(layer.asset.width, minDpi);
  return { mm, cm: Math.max(1, Math.floor(mm / 10)) };
}

/** True when the logo prints below the minimum resolution at its size (the warning and the badge, 4.6). */
export function logoIsBlurry(layer: Layer): boolean {
  return logoLayerWarnings(layer).some((w) => w.code === "resolution");
}

/** "Make it sharp": the largest size at which the logo prints sharp, about its centre, inside the print area. One undo step. */
export function makeLogoSharp(design: DesignDocument, layerId: string, options: { product: ProductDefinition }): DesignDocument {
  const layer = design.layers.find((l) => l.id === layerId);
  if (!layer || layer.kind !== "logo") return design;
  const { mm } = sharpWidth(layer);
  const aspect = layer.asset.width / layer.asset.height;
  // The printed width is the box's width or its height times the image's proportions, whichever is less.
  const printed = Math.min(layer.size.width, layer.size.height * aspect);
  if (printed <= mm) return design;
  const factor = mm / printed;
  // Rounded down, so it is not a hair over the limit.
  const size = { width: Math.floor(layer.size.width * factor * 1000) / 1000, height: Math.floor(layer.size.height * factor * 1000) / 1000 };
  const position = clampToPrintArea(options.product, { ...layer, size });
  return updateLayer(design, layerId, { size, position }, options);
}

/** A new file for a logo: its place and width kept, its height from the new image's proportions, inside the print area. */
export function replaceLogoAsset(design: DesignDocument, layerId: string, asset: LogoAssetRef, options: { product: ProductDefinition }): DesignDocument {
  const layer = design.layers.find((l) => l.id === layerId);
  if (!layer || layer.kind !== "logo") return design;
  const width = layer.size.width;
  let size = { width: round3(width), height: round3((width * asset.height) / asset.width) };
  const piece = options.product.pieces.find((p) => p.id === layer.pieceId);
  if (piece) {
    const room = maxScaleInArea(printAreaOf(piece), { ...layer, size });
    if (room < 1) size = { width: round3(size.width * room), height: round3(size.height * room) };
  }
  const position = clampToPrintArea(options.product, { ...layer, size });
  return updateLayer(design, layerId, { asset: { ...asset }, size, position }, options);
}

/** Where the next logo goes: the first place in the usual order that is free (no item there), else the first. */
export function nextLogoPreset(design: Pick<DesignDocument, "layers">, presets: readonly PlacementPreset[]): PlacementPreset | null {
  const used = new Set(design.layers.map((l) => l.preset).filter(Boolean));
  const ordered = [...LOGO_ORDER.map((id) => presets.find((p) => p.id === id)).filter((p): p is PlacementPreset => Boolean(p)), ...presets];
  return ordered.find((p) => !used.has(p.id)) ?? ordered[0] ?? null;
}
