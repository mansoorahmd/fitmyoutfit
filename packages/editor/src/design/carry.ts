/**
 * Carrying a design from one garment to another (G4, the garment chooser). Plain functions on the design document and
 * the two product definitions: no React, no model, no store.
 *
 * - **The same pattern** (the two necks of the match jersey: the same piece ids, colour zones and placements; only the
 *   collar piece's outline differs): everything is kept, unchanged, apart from the print-area rule, which moves or
 *   shrinks an item that no longer fits its area (an item on the collar, say). Those items are reported in `adjusted`.
 * - **Another garment** (jersey to T-shirt): the team colours, the team name, the sample player, the fonts, the colour
 *   of every zone the two garments share by id, and every item whose role has a placement on the new garment, put at
 *   that placement (the item's own placement when the new garment has it for that role, else a free placement for the
 *   role on the same side of the garment). Items with no place there are not carried: they are returned in
 *   `leftBehind`, so the customer can be told. The template and the pattern shapes (stripes, a sash) belong to the old
 *   garment's drawing and are not carried (`patternLeftBehind` says whether there were any).
 *
 * The input design is never changed. The old garment's own saved design is the host's: it stays saved, so choosing the
 * old garment again brings it back.
 */
import { createDesign } from "./create.js";
import { addLayer, type EditOptions } from "./edit.js";
import { fitDesignToAreas } from "./print-area.js";
import { layerSide, placeAtPreset } from "./roles.js";
import type { DesignDocument, Layer, PlacementPreset, ProductDefinition } from "./schema.js";

export interface CarryResult {
  /** The design for the new garment (its `product.id` is the new garment's). */
  design: DesignDocument;
  /** Whether the two garments share their pattern: everything was kept. */
  samePattern: boolean;
  /** The items that have no place on the new garment (always empty for the same pattern). */
  leftBehind: Layer[];
  /** The items the print-area rule moved or shrank to stay inside their area (same pattern), or that were put at another placement than their own (another garment). */
  adjusted: string[];
  /** The old design had pattern shapes (stripes, a sash) that the new garment does not take. */
  patternLeftBehind: boolean;
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Whether two products share their pattern: the same pieces (by id), colour zones (by id) and placements (all their data). Pieces' outlines may differ. */
export function sharesPattern(a: ProductDefinition, b: ProductDefinition): boolean {
  const ids = (list: ReadonlyArray<{ id: string }>) => list.map((x) => x.id).sort();
  return same(ids(a.pieces), ids(b.pieces)) && same(ids(a.zones), ids(b.zones)) && same(a.placements, b.placements) && same(a.views, b.views);
}

/** The placement a layer goes to on `to`, or null: its own when `to` has it for the layer's role, else a free one for the role on the same side. */
function targetPreset(from: ProductDefinition, to: ProductDefinition, layer: Layer, taken: ReadonlySet<string>): PlacementPreset | null {
  const own = layer.preset === undefined ? undefined : to.placements.find((p) => p.id === layer.preset);
  if (own && own.roles.includes(layer.role)) return own;
  const side = layerSide(from, layer);
  return to.placements.find((p) => p.roles.includes(layer.role) && (side === null || p.side === side) && !taken.has(`${layer.role}|${p.id}`)) ?? null;
}

export function carryDesign(design: DesignDocument, from: ProductDefinition, to: ProductDefinition, options: EditOptions = {}): CarryResult {
  if (sharesPattern(from, to)) {
    const moved = { ...design, product: { id: to.id } };
    const fitted = fitDesignToAreas(to, moved);
    const adjusted = fitted.layers.filter((l, i) => l !== moved.layers[i]).map((l) => l.id);
    return { design: fitted, samePattern: true, leftBehind: [], adjusted, patternLeftBehind: false };
  }
  const base = createDesign(to, { teamColors: design.teamColors, teamName: design.teamName, samplePlayer: design.samplePlayer });
  const zones = { ...base.zones };
  for (const zone of to.zones) if (design.zones[zone.id]) zones[zone.id] = { ...design.zones[zone.id]! };
  let next: DesignDocument = { ...base, zones, palette: { ...design.palette }, fonts: design.fonts.map((f) => ({ ...f })) };
  const leftBehind: Layer[] = [];
  const adjusted: string[] = [];
  const taken = new Set<string>();
  for (const layer of design.layers) {
    const preset = targetPreset(from, to, layer, taken);
    if (!preset) {
      leftBehind.push(layer);
      continue;
    }
    taken.add(`${layer.role}|${preset.id}`);
    if (layer.preset !== preset.id) adjusted.push(layer.id);
    next = addLayer(next, { ...layer, pieceId: preset.pieceId, preset: preset.id, position: { ...preset.centre } }, { ...options, product: to });
    next = placeAtPreset(next, layer.id, preset.id, { ...options, product: to });
  }
  return { design: next, samePattern: false, leftBehind, adjusted, patternLeftBehind: design.shapes.length > 0 };
}
