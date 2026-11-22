/**
 * The stage's plain logic: its tone (06-editor.md 12.2: a light stage that
 * deepens for very light kits, with a gap so it does not flicker) and its
 * description in words for screen readers (11.2, W-ED122).
 */
import { relativeLuminance } from "../design/colour.js";
import { drawnText, upperLatin } from "../design/letter-case.js";
import type { Palette } from "../design/palette.js";
import type { ColorValue, DesignDocument, ProductDefinition } from "../design/schema.js";
import { fill, presetWords, type EditorWording } from "./content.js";

export type StageTone = "normal" | "deep";

/** Above this relative luminance of the body, the stage deepens; below `STAGE_BACK_TO_NORMAL` it returns. */
export const STAGE_DEEPEN_AT = 0.6;
export const STAGE_BACK_TO_NORMAL = 0.5;

/** The colour of the garment's body: the zone of its front piece. */
export function bodyColour(product: ProductDefinition, design: Pick<DesignDocument, "zones">): ColorValue | null {
  const front = product.pieces.find((p) => p.id === product.views.front);
  if (!front) return null;
  return design.zones[front.zone] ?? product.zones.find((z) => z.id === front.zone)?.defaultColor ?? null;
}

/** The stage's tone for a body colour, given the tone it has now (between the two thresholds it stays as it is). */
export function nextStageTone(previous: StageTone, bodyHex: string | null): StageTone {
  if (!bodyHex) return previous;
  const l = relativeLuminance(bodyHex);
  if (l > STAGE_DEEPEN_AT) return "deep";
  if (l < STAGE_BACK_TO_NORMAL) return "normal";
  return previous;
}

/**
 * The model credit's form for a stage this wide (E3b): the whole credit on one line where it fits (it is
 * about 380 px at 11 px type), else the host's short form with a button to the full one. Never two lines.
 */
export const CREDIT_FULL_MIN_WIDTH = 560;
export function creditForm(stageWidth: number): "full" | "short" {
  return stageWidth >= CREDIT_FULL_MIN_WIDTH ? "full" : "short";
}

/** "a, b and c" (with the wording's "and"). */
export function joinWords(words: readonly string[], and: string): string {
  if (words.length <= 1) return words.join("");
  return `${words.slice(0, -1).join(", ")} ${and} ${words[words.length - 1]}`;
}

/** A colour's name from the palette, else its code. */
export function colourName(palette: Pick<Palette, "colors"> | null | undefined, colour: Pick<ColorValue, "id" | "hex">): string {
  return palette?.colors.find((c) => c.id === colour.id)?.name ?? colour.hex;
}

/**
 * The stage's accessible name: "Jersey, back view. Body front navy, sleeves
 * white. Team name TIGERS on the chest. Logo on the left chest. Name ALI RAZA
 * and number 10 on the back." Built from the design and the product's data.
 */
export function describeStage(
  wording: EditorWording,
  product: ProductDefinition,
  design: DesignDocument,
  options: { productName: string; side: "front" | "back" | "left" | "right" | null; palette?: Pick<Palette, "colors"> | null },
): string {
  const v = wording.view;
  const side = options.side ? v.sideWords[options.side] : v.sideWords.turned;
  // Zones grouped by colour, in the product's order: "Body front, body back and sleeves white; side panels navy."
  const byColour = new Map<string, string[]>();
  for (const zone of product.zones) {
    const colour = colourName(options.palette, design.zones[zone.id] ?? zone.defaultColor).toLowerCase();
    const list = byColour.get(colour) ?? [];
    list.push(zone.name.toLowerCase());
    byColour.set(colour, list);
  }
  const parts = [...byColour].map(([colour, zones]) => fill(v.zonePart, { zone: joinWords(zones, v.and), colour }));
  const sentences: string[] = [];
  if (parts.length > 0) {
    const joined = parts.join("; ");
    sentences.push(fill(v.zonesSummary, { zones: joined.charAt(0).toUpperCase() + joined.slice(1) }));
  }
  const where = (presetId: string | undefined, pieceId: string) => {
    const preset = presetId ? product.placements.find((p) => p.id === presetId) : undefined;
    if (preset) return presetWords(wording, preset).place;
    return product.pieces.find((p) => p.id === pieceId)?.name.toLowerCase() ?? "";
  };
  for (const layer of design.layers) {
    let item: string | null = null;
    if (layer.role === "team-name" && layer.kind === "text" && layer.value) item = fill(v.teamNameItem, { value: layer.value });
    else if (layer.role === "player-number" && layer.kind === "number") {
      const nameItem = design.layers.find((l) => l.role === "player-name" && l.pieceId === layer.pieceId);
      // Said as it is drawn: the Latin letters of a name in capitals unless the coach chose "As typed".
      const name = nameItem ? (nameItem.kind === "text" && nameItem.letterCase !== "as-typed" ? upperLatin(design.samplePlayer.name) : design.samplePlayer.name) : "";
      item = name ? fill(v.playerItem, { name, number: layer.value }) : `${wording.lettering.number} ${layer.value}`;
    } else if (layer.role === "player-name") {
      // Said with the number when both are on one piece.
      if (design.layers.some((l) => l.role === "player-number" && l.pieceId === layer.pieceId)) continue;
      if (layer.kind === "text" && layer.value) item = `${wording.lettering.playerName} ${drawnText(layer)}`;
    } else if (layer.kind === "logo" || layer.kind === "clipart") item = v.logoItem;
    else if (layer.kind === "text" && layer.value) item = fill(v.textItem, { value: layer.value });
    else if (layer.kind === "number") item = fill(v.textItem, { value: layer.value });
    if (item) sentences.push(fill(v.itemOn, { item, where: where(layer.preset, layer.pieceId) }));
  }
  return fill(v.description, { product: options.productName, side, summary: sentences.join(" ") }).trim();
}
