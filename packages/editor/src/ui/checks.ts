/**
 * The things a coach should check, in their words: letters hard to read on
 * the kit (06-editor.md 4.5), and (E3b) the Done panel's summary of every open
 * warning (9.2). Plain functions over the design, the product and the wording.
 */
import { designReadability, readabilityRemedy, type Readability, type ReadabilityRemedy } from "../design/readability.js";
import type { Palette } from "../design/palette.js";
import { isClipped } from "../design/print-area.js";
import type { DesignDocument, ItemRole, Layer, ProductDefinition } from "../design/schema.js";
import { logoIsBlurry } from "./logos.js";
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
  /** Items whose colours the coach chose: their fix keeps the letters and adds an outline (B4). */
  coachColoured: ReadonlySet<string> = new Set(),
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
    out.push({ text, readability: r, layerIds: [r.layerId], remedy: readabilityRemedy(design, r, { palette: palette ?? undefined, prefer: coachColoured.has(r.layerId) ? "outline" : "letters" }) });
  }
  return out;
}

/** The fix button's words: what it will do ("Use white letters", "Add white outline"). */
export function remedyWords(wording: EditorWording, palette: Pick<Palette, "colors"> | null, remedy: ReadabilityRemedy): string {
  const colour = colourName(palette, remedy.colour).toLowerCase();
  return fill(remedy.kind === "outline" ? wording.lettering.addColourOutline : wording.lettering.useLetterColour, { colour });
}

/** What the editor knows about an uploaded file beyond the design (found by the upload checks, this session). */
export interface LogoNote {
  /** No transparent background: it prints as a box (W-ED95). */
  box?: boolean;
  /** The coach chose "Keep it": the box warning is dismissed for this logo. */
  kept?: boolean;
}

export type ItemCheck = "hard-to-read" | "clipped" | "blurry" | "box";

/** The open warnings of one item: hard to read, cut off at the seam, low resolution, a box behind the logo (kept boxes are not open). */
export function itemChecks(
  product: ProductDefinition,
  design: DesignDocument,
  layer: Layer,
  options: { notes?: Readonly<Record<string, LogoNote>>; hardToRead?: ReadonlySet<string> } = {},
): ItemCheck[] {
  const out: ItemCheck[] = [];
  const hardToRead = options.hardToRead ?? new Set(designReadability(product, design).filter((r) => !r.passes).map((r) => r.layerId));
  if (hardToRead.has(layer.id)) out.push("hard-to-read");
  if (isClipped(product, layer)) out.push("clipped");
  if (logoIsBlurry(layer)) out.push("blurry");
  if (layer.kind === "logo") {
    const note = options.notes?.[layer.asset.assetId];
    if (note?.box && !note.kept) out.push("box");
  }
  return out;
}

export interface DesignCheck {
  layerId: string;
  check: ItemCheck;
  /** The sentence for the Done panel, naming the item ("Logo on the left chest: may print blurry at this size."). */
  text: string;
}

/**
 * The Done panel's summary (06-editor.md 9.2): every open warning on the
 * kit, one line each, naming its item, in the order of the list "On this kit".
 */
export function designChecks(
  wording: EditorWording,
  product: ProductDefinition,
  design: DesignDocument,
  options: { notes?: Readonly<Record<string, LogoNote>>; palette?: Pick<Palette, "colors"> | null; fileName?: (assetId: string) => string | null } = {},
): DesignCheck[] {
  const results = designReadability(product, design);
  const hardToRead = new Set(results.filter((r) => !r.passes).map((r) => r.layerId));
  const out: DesignCheck[] = [];
  for (const layer of [...design.layers].reverse()) {
    for (const check of itemChecks(product, design, layer, { notes: options.notes, hardToRead })) {
      const item = itemWords(wording, product, layer, { fileName: options.fileName });
      let reason: string;
      if (check === "hard-to-read") {
        const r = results.find((x) => x.layerId === layer.id);
        reason = fill(wording.done.checkHardToRead, { colour: r ? colourName(options.palette ?? null, r.background.colour) : "" });
      } else reason = wording.done.checks[check];
      out.push({ layerId: layer.id, check, text: fill(wording.done.checkLine, { item: item.at, reason }) });
    }
  }
  return out;
}
