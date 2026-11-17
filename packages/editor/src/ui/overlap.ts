/**
 * Items that cover each other (E3d, left over from E3c): a team name turned or made bigger over the player's
 * name, a logo moved onto the number. The item drawn above another one on the same piece, whose box overlaps that
 * one's box, gets a check ("covers the player name") with a one-tap fix that moves it clear inside its print area,
 * or, when no place is free, makes it smaller. Only the upper item is named, so a pair is never warned twice. The
 * standard places' size and place limits keep the standard items apart by themselves.
 *
 * Plain functions over the design, in piece millimetres (the boxes are the items' turned boxes).
 */
import { nudgeLayer, scaleLayerBy } from "../design/item-edits.js";
import { layerCorners } from "../design/placement.js";
import { isClipped } from "../design/print-area.js";
import type { DesignDocument, Layer, ProductDefinition } from "../design/schema.js";
import { fill, type EditorWording } from "./content.js";

type P = { x: number; y: number };

/** Whether two convex quads overlap by more than `margin` mm (separating axes). */
export function quadsOverlap(a: readonly P[], b: readonly P[], margin = 0.5): boolean {
  for (const quad of [a, b]) {
    for (let i = 0; i < quad.length; i++) {
      const p = quad[i]!;
      const q = quad[(i + 1) % quad.length]!;
      const nx = q.y - p.y;
      const ny = p.x - q.x;
      const len = Math.hypot(nx, ny) || 1;
      const project = (pts: readonly P[]) => pts.map((v) => (v.x * nx + v.y * ny) / len);
      const pa = project(a);
      const pb = project(b);
      const gap = Math.max(Math.min(...pb) - Math.max(...pa), Math.min(...pa) - Math.max(...pb));
      if (gap > -margin) return false;
    }
  }
  return true;
}

/** The item below `layer` on its piece that its box covers (the nearest below it), or null. */
export function coveredItem(design: Pick<DesignDocument, "layers">, layer: Layer): Layer | null {
  const index = design.layers.findIndex((l) => l.id === layer.id);
  const box = layerCorners(layer);
  for (let k = index - 1; k >= 0; k--) {
    const other = design.layers[k]!;
    if (other.pieceId !== layer.pieceId) continue;
    if (quadsOverlap(box, layerCorners(other))) return other;
  }
  return null;
}

/** Another item on the same piece, above or below `layer`, whose box overlaps its box (the first found), or null. */
export function overlappedItem(design: Pick<DesignDocument, "layers">, layer: Layer): Layer | null {
  const box = layerCorners(layer);
  for (const other of design.layers) {
    if (other.id === layer.id || other.pieceId !== layer.pieceId) continue;
    if (quadsOverlap(box, layerCorners(other))) return other;
  }
  return null;
}

/** What the fix did: moved the item, or had to make it smaller. */
export interface ClearFix {
  design: DesignDocument;
  how: "moved" | "smaller";
}

/**
 * The fix: the item moved up or down (away from the one it covers first, then the other way), 2 mm at a time and
 * at most 200 mm, to the nearest place inside its print area where it overlaps no item on its piece (above or
 * below it) and nothing is cut off; else made smaller (10% a step, at most ten steps) until it does. Null when
 * neither helps (E3e: then the button is not shown, and the check says what to do).
 */
export function clearFix(design: DesignDocument, layerId: string, product: ProductDefinition): ClearFix | null {
  const layer = design.layers.find((l) => l.id === layerId);
  if (!layer) return null;
  const other = coveredItem(design, layer);
  if (!other) return null;
  // A place is free only when no item on the piece overlaps it, whether drawn above or below (E3e, B2).
  const clear = (d: DesignDocument) => {
    const moved = d.layers.find((l) => l.id === layerId)!;
    return !overlappedItem(d, moved) && !isClipped(product, moved);
  };
  const away = layer.position.y <= other.position.y ? -1 : 1;
  for (const direction of [away, -away]) {
    for (let mm = 2; mm <= 200; mm += 2) {
      const next = nudgeLayer(design, layerId, 0, direction * mm, { product });
      const moved = next.layers.find((l) => l.id === layerId)!;
      // The print area stopped it: further steps in this direction cannot help.
      if (Math.abs(moved.position.y - layer.position.y) < mm - 0.01) {
        if (clear(next)) return { design: next, how: "moved" };
        break;
      }
      if (clear(next)) return { design: next, how: "moved" };
    }
  }
  let next = design;
  for (let k = 0; k < 10; k++) {
    next = scaleLayerBy(next, layerId, 1 / 1.1, { product });
    if (clear(next)) return { design: next, how: "smaller" };
  }
  return null;
}

/** `clearFix`'s design alone (null when there is no fix). */
export function moveClear(design: DesignDocument, layerId: string, product: ProductDefinition): DesignDocument | null {
  return clearFix(design, layerId, product)?.design ?? null;
}

/** What the status line says after the fix: only when it made the item smaller instead of moving it (E3e, B1). */
export function clearAnnouncement(wording: EditorWording, fix: ClearFix, coveredKind: string): string | null {
  return fix.how === "smaller" ? fill(wording.selection.madeSmallerClear, { item: coveredKind.toLowerCase() }) : null;
}
