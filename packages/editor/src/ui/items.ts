/**
 * What an item on the kit is called, in the coach's words (06-editor.md 4.8):
 * "Team name: TIGERS", "Number", "Logo: crest.png", and where it is ("Chest",
 * "Back"). Used by the readability warnings ("Number on the back is hard to
 * read on Navy."), the list "On this kit", the contextual bar and the Done
 * panel's checks. Plain functions over the wording and the data.
 */
import type { DesignDocument, Layer, ProductDefinition } from "../design/schema.js";
import { fill, presetWords, type EditorWording } from "./content.js";

export interface ItemWords {
  /** The role's word: "Team name", "Number", "Logo". */
  kind: string;
  /** With its value or file: "Team name: TIGERS", "Logo: crest.png"; the role's word alone for names and numbers. */
  name: string;
  /** Where it is, as a chip says it ("Chest", "Back", "Left sleeve"), or the piece's name. */
  where: string;
  /** Where it is, in a sentence ("chest", "back"). */
  place: string;
  /** The role's word and where: "Number on the back". */
  at: string;
}

/** Where a layer is: its preset's words, else the piece's name. */
export function itemWhere(wording: EditorWording, product: ProductDefinition, layer: Pick<Layer, "preset" | "pieceId">): { where: string; place: string } {
  const preset = layer.preset ? product.placements.find((p) => p.id === layer.preset) : undefined;
  if (preset) {
    const w = presetWords(wording, preset);
    return { where: w.short, place: w.place };
  }
  const piece = product.pieces.find((p) => p.id === layer.pieceId);
  const name = piece?.name ?? "";
  return { where: name, place: name.toLowerCase() };
}

export function itemWords(
  wording: EditorWording,
  product: ProductDefinition,
  layer: Layer,
  options: { fileName?: (assetId: string) => string | null } = {},
): ItemWords {
  const kind = wording.items.roles[layer.role] ?? wording.items.roles.text!;
  let value: string | null = null;
  if (layer.role === "team-name" && layer.kind === "text") value = layer.value;
  else if (layer.role === "text" && (layer.kind === "text" || layer.kind === "number")) value = layer.value;
  else if (layer.kind === "logo" || layer.kind === "clipart") value = options.fileName?.(layer.asset.assetId) || null;
  const { where, place } = itemWhere(wording, product, layer);
  return {
    kind,
    name: value ? fill(wording.items.named, { item: kind, value }) : kind,
    where,
    place,
    at: place ? fill(wording.items.at, { item: kind, where: place }) : kind,
  };
}

/** The item's words by id, or null when the design has no such layer. */
export function itemWordsById(wording: EditorWording, product: ProductDefinition, design: Pick<DesignDocument, "layers">, layerId: string, options?: { fileName?: (assetId: string) => string | null }): ItemWords | null {
  const layer = design.layers.find((l) => l.id === layerId);
  return layer ? itemWords(wording, product, layer, options) : null;
}

/**
 * An undo step's label naming what changed (E3c, 10.5): "move|Logo", "zone-colour|Body front". The part of the
 * kit for a colour, else the item that changed (added, removed or edited); the bare key when nothing says.
 */
export function namedLabel(wording: EditorWording, product: ProductDefinition, label: string, before: Pick<DesignDocument, "zones" | "layers" | "shapes">, after: Pick<DesignDocument, "zones" | "layers" | "shapes">): string {
  if (label === "zone-colour") {
    const zone = product.zones.find((z) => JSON.stringify(before.zones[z.id]) !== JSON.stringify(after.zones[z.id]));
    return zone ? `${label}|${zone.name}` : label;
  }
  if (label === "shape-colour") {
    const shape = after.shapes.find((s) => JSON.stringify(before.shapes.find((b) => b.id === s.id)?.fill) !== JSON.stringify(s.fill));
    return shape ? `${label}|${wording.shapeGroups[shape.group] ?? wording.shapeGroups.other}` : label;
  }
  const was = new Map(before.layers.map((l) => [l.id, JSON.stringify(l)]));
  const changed = after.layers.find((l) => was.get(l.id) !== JSON.stringify(l)) ?? before.layers.find((l) => !after.layers.some((x) => x.id === l.id));
  if (!changed) return label;
  return `${label}|${wording.items.roles[changed.role] ?? wording.items.roles.text}`;
}
