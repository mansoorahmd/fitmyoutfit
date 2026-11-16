/**
 * Selection in the coach's terms (06-editor.md 4.8, 5): which tool an item
 * belongs to, and the rules for what is drawn round the selected item. Plain
 * functions, tested without a browser.
 */
import type { Layer } from "../design/schema.js";
import type { ToolId } from "./context.js";

/** The contextual bar's height on a phone (06-editor.md 5.2). */
export const CONTEXT_BAR_HEIGHT = 48;

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The screen box an item takes with its handles: its points, grown by half a handle's hit area. */
export function itemScreenBox(points: ReadonlyArray<{ x: number; y: number }>, pad: number): Box | null {
  if (points.length === 0) return null;
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const x = Math.min(...xs) - pad;
  const y = Math.min(...ys) - pad;
  return { x, y, width: Math.max(...xs) + pad - x, height: Math.max(...ys) + pad - y };
}

function overlapHeight(a: Box, top: number, bottom: number): number {
  return Math.max(0, Math.min(a.y + a.height, bottom) - Math.max(a.y, top));
}

/**
 * Where the contextual bar goes (06-editor.md 5.2: never over the selected
 * item or its handles): at the top of the stage, under the top bar, where the
 * camera has already kept the item below it; if the item still reaches into
 * that band (zoomed in, an item high on the shirt), at the bottom of the free
 * area instead; if both bands are covered, wherever less of it is covered.
 */
export function contextBarPlacement(input: { top: number; freeBottom: number; height?: number; item: Box | null }): "top" | "bottom" {
  const h = input.height ?? CONTEXT_BAR_HEIGHT;
  if (!input.item) return "top";
  const atTop = overlapHeight(input.item, input.top, input.top + h);
  if (atTop === 0) return "top";
  const atBottom = overlapHeight(input.item, input.freeBottom - h, input.freeBottom);
  return atBottom < atTop ? "bottom" : "top";
}

/**
 * What a tap or click on the model does to the panels (E3d, R1): on an item, its tool opens (when it is not the
 * one open already); while the start card is open, the card closes as "Skip" (what was picked is kept) and the
 * item's tool opens, so nothing is ever edited with no tool in view. A tap on empty stage or bare fabric (no item)
 * changes no panel: turning and zooming leave the start card open.
 */
export function modelTapAction(input: { startCard: boolean; itemTool: ToolId | null; activeTool: ToolId | null; tools: readonly ToolId[] }): { closeStartCard: boolean; openTool: ToolId | null } {
  if (input.itemTool === null) return { closeStartCard: false, openTool: null };
  const available = input.tools.includes(input.itemTool) ? input.itemTool : null;
  if (input.startCard) return { closeStartCard: true, openTool: available };
  return { closeStartCard: false, openTool: available !== input.activeTool ? available : null };
}

/** The tool that edits an item: the team name in Team, names and numbers in Players, logos in Logos, free text in Text. */
export function toolForLayer(layer: Pick<Layer, "role" | "kind">): ToolId {
  switch (layer.role) {
    case "team-name":
      return "team";
    case "player-name":
    case "player-number":
      return "players";
    case "text":
      return layer.kind === "logo" || layer.kind === "clipart" ? "logos" : "text";
    default:
      return layer.kind === "text" || layer.kind === "number" ? "text" : "logos";
  }
}
