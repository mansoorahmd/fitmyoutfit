/**
 * The things a coach should check, in their words: letters hard to read on
 * the kit (06-editor.md 4.5), and (E3b) the Done panel's summary of every open
 * warning (9.2). Plain functions over the design, the product and the wording.
 */
import { designReadability, readabilityRemedy, type Readability, type ReadabilityRemedy } from "../design/readability.js";
import type { Palette } from "../design/palette.js";
import type { DesignDocument, ItemRole, ProductDefinition } from "../design/schema.js";
import { fill, type EditorWording } from "./content.js";
import { itemWords } from "./items.js";
import { colourName } from "./stage-logic.js";

export interface ReadabilityWarning {
  /** "Number on the back is hard to read on Navy." */
  text: string;
  /** The first failing item (the warning's key) and its result. */
  readability: Readability;
  /** Every item the warning stands for: two items with the same words share one warning, and one fix. */
  layerIds: string[];
  remedy: ReadabilityRemedy;
}

/**
 * The readability warnings for the items of some roles, each naming its item
 * and where it is. Two items that would read the same ("Number on the back"
 * twice) share one warning, so identical warnings never stack.
 */
export function readabilityWarnings(
  wording: EditorWording,
  product: ProductDefinition,
  design: DesignDocument,
  palette: Pick<Palette, "colors"> | null,
  roles: readonly ItemRole[] | null = null,
): ReadabilityWarning[] {
  const out: ReadabilityWarning[] = [];
  for (const r of designReadability(product, design)) {
    if (r.passes) continue;
    const layer = design.layers.find((l) => l.id === r.layerId);
    if (!layer || (roles && !roles.includes(layer.role))) continue;
    const text = fill(wording.lettering.hardToRead, { item: itemWords(wording, product, layer).at, colour: colourName(palette, r.background.colour) });
    const same = out.find((w) => w.text === text);
    if (same) {
      same.layerIds.push(r.layerId);
      continue;
    }
    out.push({ text, readability: r, layerIds: [r.layerId], remedy: readabilityRemedy(design, r, { palette: palette ?? undefined }) });
  }
  return out;
}
